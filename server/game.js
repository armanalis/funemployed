import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(readFileSync(new URL('../public/shared/cards.json', import.meta.url), 'utf8'));
export const JOBS = deck.jobs;
export const QUALS = deck.qualifications;
export const LANGS = ['en', 'tr', 'it'];

// Job id for the final "My Job" round, where applicants compete for the employer's real job.
export const MY_JOB = -1;
// Cards players write themselves get ids from here up, so they never collide with deck positions.
export const CUSTOM_BASE = 100000;

export const HAND_SIZE = 4;
export const BONUS_CARDS = 2;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
// Voting needs at least three applicants, otherwise everyone just votes for the other one.
export const MIN_VOTING_APPLICANTS = 3;
export const CUSTOM_MAX_LENGTH = 50;
export const CUSTOM_MAX_PER_KIND = 60;
// "Time's up" stays on screen this long before the game moves on by itself.
export const TIME_UP_GRACE_MS = 2000;
const POOL_REFRESH_EVERY = 3;
const NAME_MAX = 20;

export const PREP_OPTIONS = [0, 30, 60, 90, 120];
export const PITCH_OPTIONS = [0, 45, 60, 90, 120];
export const LAP_OPTIONS = [0, 1, 2, 3];
const FLAGS = ['blind', 'myJob', 'family', 'votes'];

// Thrown for rule violations; the message is an error code the client translates.
export class GameError extends Error {}

const fail = (code) => {
  throw new GameError(code);
};

function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);
const newId = () => randomBytes(9).toString('base64url');

function cleanText(raw, max) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const cleanName = (raw) => cleanText(raw, NAME_MAX);

export class Room {
  constructor(code, { rng = Math.random, now = Date.now } = {}) {
    this.code = code;
    this.rng = rng;
    this.now = now;
    this.players = [];
    this.ownerId = null;
    this.phase = 'lobby';
    this.settings = {
      laps: 0,
      prepSeconds: 60,
      pitchSeconds: 60,
      blind: false,
      myJob: true,
      family: false,
      votes: true,
    };
    this.custom = { jobs: [], quals: [] };
    this.nextCustomId = CUSTOM_BASE;
    this.round = null;
    this.roundNumber = 0;
    this.totalRounds = 0;
    this.employerIdx = -1;
    this.lastActive = now();
  }

  // ---------- players ----------

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  isConnected(id) {
    return (this.getPlayer(id)?.sockets ?? 0) > 0;
  }

  connectedPlayers() {
    return this.players.filter((p) => p.sockets > 0);
  }

  // The room creator stays host; while they are offline the first connected
  // player stands in so the game never gets stuck waiting for them.
  hostId() {
    if (this.isConnected(this.ownerId)) return this.ownerId;
    return this.connectedPlayers()[0]?.id ?? this.ownerId;
  }

  inGame() {
    return !['lobby', 'over'].includes(this.phase);
  }

  laps() {
    return this.settings.laps || (this.players.length <= 6 ? 2 : 1);
  }

  join(token, rawName) {
    this.lastActive = this.now();
    let player = token ? this.players.find((p) => p.token === token) : null;
    if (!player) {
      const name = cleanName(rawName);
      if (!name) fail('name_required');
      // Someone who lost their session can take back their offline seat by name.
      player = this.players.find(
        (p) => p.sockets === 0 && p.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
      );
      if (!player) {
        if (this.players.length >= MAX_PLAYERS) fail('room_full');
        player = {
          id: newId(),
          token: newId() + newId(),
          name: this.uniqueName(name),
          sockets: 0,
          jobs: [],
          stars: 0,
          hand: [],
          ready: false,
        };
        this.players.push(player);
        // Give late joiners their turn as employer.
        if (this.inGame()) this.totalRounds += this.laps();
      }
    }
    player.sockets += 1;
    if (!this.ownerId) this.ownerId = player.id;
    return player;
  }

  uniqueName(name) {
    const taken = new Set(this.players.map((p) => p.name.toLocaleLowerCase('tr')));
    if (!taken.has(name.toLocaleLowerCase('tr'))) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, NAME_MAX - 3)} ${n}`;
      if (!taken.has(candidate.toLocaleLowerCase('tr'))) return candidate;
    }
  }

  leave(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.sockets = Math.max(0, player.sockets - 1);
    this.lastActive = this.now();
  }

  kick(byId, targetId) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') fail('wrong_phase');
    if (targetId === byId) fail('not_allowed');
    this.players = this.players.filter((p) => p.id !== targetId);
  }

  requireHost(byId) {
    if (byId !== this.hostId()) fail('host_only');
  }

  updateSettings(byId, patch = {}) {
    this.requireHost(byId);
    if (this.phase !== 'lobby' && this.phase !== 'over') fail('wrong_phase');
    const next = { ...this.settings };
    const pick = (key, options) => {
      if (!(key in patch)) return;
      if (!options.includes(patch[key])) fail('bad_setting');
      next[key] = patch[key];
    };
    pick('laps', LAP_OPTIONS);
    pick('prepSeconds', PREP_OPTIONS);
    pick('pitchSeconds', PITCH_OPTIONS);
    for (const key of FLAGS) pick(key, [true, false]);
    this.settings = next;
  }

  // ---------- cards players write themselves ----------

  addCustomCard(byId, kind, rawText) {
    if (this.phase !== 'lobby') fail('wrong_phase');
    const author = this.getPlayer(byId);
    if (!author) fail('not_allowed');
    const list = this.customList(kind);
    const text = cleanText(rawText, CUSTOM_MAX_LENGTH + 1);
    if (!text) fail('card_empty');
    if (text.length > CUSTOM_MAX_LENGTH) fail('card_too_long');
    if (list.length >= CUSTOM_MAX_PER_KIND) fail('custom_limit');
    const key = text.toLocaleLowerCase('tr');
    if (list.some((c) => c.text.toLocaleLowerCase('tr') === key)) fail('card_exists');
    list.push({ id: this.nextCustomId++, text, by: author.name, byId: author.id });
  }

  removeCustomCard(byId, kind, cardId) {
    if (this.phase !== 'lobby') fail('wrong_phase');
    const list = this.customList(kind);
    const card = list.find((c) => c.id === cardId);
    if (!card) fail('bad_card');
    if (byId !== card.byId && byId !== this.hostId()) fail('not_allowed');
    list.splice(list.indexOf(card), 1);
  }

  customList(kind) {
    if (kind === 'job') return this.custom.jobs;
    if (kind === 'qual') return this.custom.quals;
    return fail('bad_card');
  }

  // ---------- decks ----------

  // Card ids in play for this game: the built-in deck (minus 18+ cards in family mode) plus custom cards.
  deckIds(cards, custom) {
    const keep = range(cards.length).filter((i) => !(this.settings.family && cards[i].adult));
    return [...keep, ...custom.map((c) => c.id)];
  }

  drawQual() {
    if (this.qualDeck.length === 0) {
      this.qualDeck = shuffle(this.qualDiscard, this.rng);
      this.qualDiscard = [];
    }
    if (this.qualDeck.length === 0) fail('deck_empty');
    return this.qualDeck.pop();
  }

  drawJob() {
    if (this.jobDeck.length === 0) this.jobDeck = shuffle(this.jobIds, this.rng);
    return this.jobDeck.pop();
  }

  // ---------- game flow ----------

  startGame(byId) {
    this.requireHost(byId);
    if (this.inGame()) fail('wrong_phase');
    if (this.connectedPlayers().length < MIN_PLAYERS) fail('not_enough_players');
    this.players = this.connectedPlayers();
    for (const p of this.players) {
      p.jobs = [];
      p.stars = 0;
      p.hand = [];
      p.ready = false;
    }
    this.jobIds = this.deckIds(JOBS, this.custom.jobs);
    this.qualDeck = shuffle(this.deckIds(QUALS, this.custom.quals), this.rng);
    this.qualDiscard = [];
    this.jobDeck = shuffle(this.jobIds, this.rng);
    this.pool = [];
    this.round = null;
    this.roundNumber = 0;
    this.totalRounds = this.laps() * this.players.length;
    this.employerIdx = Math.floor(this.rng() * this.players.length) - 1;
    this.startRound();
  }

  startRound() {
    if (this.connectedPlayers().length < MIN_PLAYERS) fail('not_enough_players');
    const n = this.players.length;
    do {
      this.employerIdx = (this.employerIdx + 1) % n;
    } while (this.players[this.employerIdx].sockets === 0);
    const employer = this.players[this.employerIdx];

    // Applicants go clockwise, starting next to the employer.
    const applicants = range(n - 1)
      .map((i) => this.players[(this.employerIdx + 1 + i) % n])
      .filter((p) => p.sockets > 0);

    for (const p of this.players) {
      this.qualDiscard.push(...p.hand);
      p.hand = [];
      p.ready = false;
    }
    for (const cards of Object.values(this.round?.bonus ?? {})) this.qualDiscard.push(...cards);

    if (this.roundNumber % POOL_REFRESH_EVERY === 0) {
      this.qualDiscard.push(...this.pool);
      this.pool = [];
    }
    const poolSize = Math.min(20, n >= 7 ? n * 2 : 10);
    while (this.pool.length < poolSize) this.pool.push(this.drawQual());

    for (const p of applicants) p.hand = range(HAND_SIZE).map(() => this.drawQual());

    const isFinal = this.roundNumber === this.totalRounds - 1;
    this.roundNumber += 1;
    this.round = {
      employerId: employer.id,
      job: isFinal && this.settings.myJob ? MY_JOB : this.drawJob(),
      applicants: applicants.map((p) => p.id),
      revealed: Object.fromEntries(applicants.map((p) => [p.id, Array(HAND_SIZE).fill(false)])),
      current: -1,
      prepStartedAt: this.now(),
      turnStartedAt: null,
      winnerId: null,
      skipped: false,
      closed: false,
      votes: {},
      finalists: [],
      bonus: {},
      bonusPick: {},
    };
    this.phase = 'prep';
    // "Running late" variant: nobody sees their cards before pitching, so there's nothing to prepare.
    if (this.settings.blind) this.beginInterviews();
  }

  requireApplicant(playerId) {
    if (!this.round?.applicants.includes(playerId)) fail('not_applicant');
    return this.getPlayer(playerId);
  }

  swap(playerId, handIdx, poolIdx, expectedCard) {
    if (this.phase !== 'prep') fail('wrong_phase');
    const player = this.requireApplicant(playerId);
    if (player.ready) fail('locked');
    if (!Number.isInteger(handIdx) || handIdx < 0 || handIdx >= player.hand.length) fail('bad_card');
    if (!Number.isInteger(poolIdx) || poolIdx < 0 || poolIdx >= this.pool.length) fail('bad_card');
    // Another applicant may have grabbed that card a moment earlier.
    if (expectedCard !== undefined && this.pool[poolIdx] !== expectedCard) fail('card_taken');
    [player.hand[handIdx], this.pool[poolIdx]] = [this.pool[poolIdx], player.hand[handIdx]];
  }

  setReady(playerId, ready) {
    if (this.phase !== 'prep') fail('wrong_phase');
    this.requireApplicant(playerId).ready = Boolean(ready);
    const waiting = this.round.applicants
      .map((id) => this.getPlayer(id))
      .filter((p) => p.sockets > 0 && !p.ready);
    if (waiting.length === 0) this.beginInterviews();
  }

  startInterviews(byId) {
    if (this.phase !== 'prep') fail('wrong_phase');
    if (byId !== this.round.employerId && byId !== this.hostId()) fail('not_allowed');
    this.beginInterviews();
  }

  beginInterviews() {
    this.phase = 'interview';
    this.round.current = -1;
    this.advanceApplicant();
  }

  currentApplicantId() {
    return this.round?.applicants[this.round.current] ?? null;
  }

  // Moves to the next applicant who is still connected, or to the decision.
  advanceApplicant() {
    const r = this.round;
    do {
      r.current += 1;
    } while (r.current < r.applicants.length && !this.isConnected(r.applicants[r.current]));
    if (r.current >= r.applicants.length) {
      this.phase = 'decision';
      r.turnStartedAt = null;
    } else {
      r.turnStartedAt = this.now();
    }
  }

  reveal(playerId, handIdx) {
    if (this.phase !== 'interview') fail('wrong_phase');
    if (playerId !== this.currentApplicantId()) fail('not_your_turn');
    const revealed = this.round.revealed[playerId];
    if (!Number.isInteger(handIdx) || handIdx < 0 || handIdx >= revealed.length) fail('bad_card');
    revealed[handIdx] = true;
  }

  finishPitch(byId) {
    if (this.phase !== 'interview') fail('wrong_phase');
    const current = this.currentApplicantId();
    if (![current, this.round.employerId, this.hostId()].includes(byId)) fail('not_allowed');
    this.round.revealed[current].fill(true);
    this.advanceApplicant();
  }

  // ---------- timers ----------

  // When the current phase moves on by itself, or null if it waits for the players.
  deadline() {
    const r = this.round;
    const { prepSeconds, pitchSeconds } = this.settings;
    if (this.phase === 'prep' && prepSeconds) return r.prepStartedAt + prepSeconds * 1000 + TIME_UP_GRACE_MS;
    if (this.phase === 'interview' && pitchSeconds) return r.turnStartedAt + pitchSeconds * 1000 + TIME_UP_GRACE_MS;
    return null;
  }

  // Applies a deadline that has passed. Returns whether anything changed.
  tick() {
    const due = this.deadline();
    if (due === null || this.now() < due) return false;
    if (this.phase === 'prep') {
      this.beginInterviews();
    } else {
      this.round.revealed[this.currentApplicantId()].fill(true);
      this.advanceApplicant();
    }
    return true;
  }

  // ---------- tiebreaker ----------

  // The employer decides; if they dropped out, the host decides for them.
  requireDecider(byId) {
    const employerId = this.round.employerId;
    const allowed = this.isConnected(employerId) ? employerId : this.hostId();
    if (byId !== allowed) fail('employer_only');
  }

  // Official rule: when the employer can't choose, each finalist gets two more cards
  // and uses one of them for a final argument.
  startTiebreak(byId, finalistIds) {
    if (this.phase !== 'decision') fail('wrong_phase');
    this.requireDecider(byId);
    const r = this.round;
    const ids = [...new Set(Array.isArray(finalistIds) ? finalistIds : [])];
    const valid = ids.every((id) => r.applicants.includes(id) && this.isConnected(id));
    if (ids.length < 2 || !valid) fail('need_finalists');
    // Keep the pitching order.
    r.finalists = r.applicants.filter((id) => ids.includes(id));
    for (const id of r.finalists) {
      r.bonus[id] = range(BONUS_CARDS).map(() => this.drawQual());
      r.bonusPick[id] = null;
    }
    this.phase = 'tiebreak';
  }

  pickBonus(playerId, idx) {
    if (this.phase !== 'tiebreak') fail('wrong_phase');
    const r = this.round;
    if (!r.finalists.includes(playerId)) fail('not_finalist');
    if (r.bonusPick[playerId] !== null) fail('already_picked');
    if (!Number.isInteger(idx) || idx < 0 || idx >= BONUS_CARDS) fail('bad_card');
    r.bonusPick[playerId] = idx;
  }

  hire(byId, applicantId) {
    if (this.phase !== 'decision' && this.phase !== 'tiebreak') fail('wrong_phase');
    this.requireDecider(byId);
    const r = this.round;
    if (!r.applicants.includes(applicantId)) fail('not_applicant');
    if (this.phase === 'tiebreak' && !r.finalists.includes(applicantId)) fail('not_finalist');
    const employer = this.getPlayer(r.employerId);
    this.getPlayer(applicantId).jobs.push({ job: r.job, employer: employer.name });
    r.winnerId = applicantId;
    this.phase = 'result';
  }

  // ---------- audience vote ----------

  votingOn() {
    const r = this.round;
    return Boolean(this.settings.votes && r && !r.skipped && r.applicants.length >= MIN_VOTING_APPLICANTS);
  }

  // Everyone except the employer picks the funniest pitch; the fan favorite earns a star.
  vote(playerId, targetId) {
    if (!this.votingOn()) fail('voting_off');
    if (!['decision', 'tiebreak', 'result'].includes(this.phase)) fail('wrong_phase');
    const r = this.round;
    if (!this.getPlayer(playerId) || playerId === r.employerId) fail('not_allowed');
    if (targetId === playerId) fail('no_self_vote');
    if (!r.applicants.includes(targetId)) fail('not_applicant');
    r.votes[playerId] = targetId;
  }

  voteCounts() {
    const counts = {};
    for (const target of Object.values(this.round.votes)) counts[target] = (counts[target] ?? 0) + 1;
    return counts;
  }

  // The applicant with the most votes, or null when nobody voted or it's a tie.
  fanFavoriteId() {
    const ranked = Object.entries(this.voteCounts()).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0 || ranked[1]?.[1] === ranked[0][1]) return null;
    return ranked[0][0];
  }

  // Hands out the fan favorite's star once the round is over.
  closeRound() {
    const r = this.round;
    if (!r || r.closed) return;
    r.closed = true;
    if (this.phase !== 'result' || !this.votingOn()) return;
    const favorite = this.getPlayer(this.fanFavoriteId());
    if (favorite) favorite.stars += 1;
  }

  // ---------- ending rounds and games ----------

  skipRound(byId) {
    this.requireHost(byId);
    if (!['prep', 'interview', 'decision', 'tiebreak'].includes(this.phase)) fail('wrong_phase');
    this.round.winnerId = null;
    this.round.skipped = true;
    this.phase = 'result';
  }

  nextRound(byId) {
    if (this.phase !== 'result') fail('wrong_phase');
    if (byId !== this.round.employerId && byId !== this.hostId()) fail('not_allowed');
    this.closeRound();
    if (this.roundNumber >= this.totalRounds) {
      this.phase = 'over';
      return;
    }
    this.startRound();
  }

  endGame(byId) {
    this.requireHost(byId);
    if (!this.inGame()) fail('wrong_phase');
    this.closeRound();
    this.phase = 'over';
  }

  backToLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'over') fail('wrong_phase');
    this.phase = 'lobby';
    this.round = null;
    for (const p of this.players) {
      p.jobs = [];
      p.stars = 0;
      p.hand = [];
      p.ready = false;
    }
  }

  // ---------- what one player is allowed to see ----------

  view(playerId) {
    const r = this.round;
    const me = this.getPlayer(playerId);
    let round = null;
    if (r) {
      const resumes = {};
      for (const id of r.applicants) {
        const hand = this.getPlayer(id)?.hand ?? [];
        resumes[id] = hand.map((card, i) => (r.revealed[id][i] ? card : null));
      }
      let hand = [];
      if (me && r.applicants.includes(me.id)) {
        hand = this.settings.blind ? resumes[me.id] : me.hand;
      }
      // A finalist sees both extra cards; everyone sees the one each finalist picked.
      const bonusPicks = Object.fromEntries(
        r.finalists.map((id) => [id, r.bonusPick[id] === null ? null : r.bonus[id][r.bonusPick[id]]]),
      );
      const voting = this.votingOn();
      // Vote counts stay hidden until the employer has decided, so they can't sway the hire.
      const showVotes = voting && this.phase === 'result';
      round = {
        employerId: r.employerId,
        job: r.job,
        applicants: r.applicants,
        currentId: this.phase === 'interview' ? this.currentApplicantId() : null,
        prepStartedAt: r.prepStartedAt,
        turnStartedAt: r.turnStartedAt,
        winnerId: r.winnerId,
        skipped: r.skipped,
        pool: this.phase === 'prep' ? this.pool : [],
        resumes,
        hand,
        finalists: r.finalists,
        bonusHand: r.bonus[playerId] ?? [],
        bonusPicks,
        voting,
        myVote: r.votes[playerId] ?? null,
        votesCast: Object.keys(r.votes).length,
        voters: this.players.filter((p) => p.sockets > 0 && p.id !== r.employerId).length,
        voteCounts: showVotes ? this.voteCounts() : {},
        fanFavoriteId: showVotes ? this.fanFavoriteId() : null,
      };
    }
    return {
      code: this.code,
      me: playerId,
      hostId: this.hostId(),
      phase: this.phase,
      settings: this.settings,
      custom: {
        jobs: this.custom.jobs.map(({ id, text, by, byId }) => ({ id, text, by, byId })),
        quals: this.custom.quals.map(({ id, text, by, byId }) => ({ id, text, by, byId })),
      },
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      serverNow: this.now(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.sockets > 0,
        ready: p.ready,
        jobs: p.jobs,
        stars: p.stars,
      })),
      round,
    };
  }
}
