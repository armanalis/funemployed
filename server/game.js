import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(readFileSync(new URL('../public/shared/cards.json', import.meta.url), 'utf8'));
export const JOBS = deck.jobs;
export const QUALS = deck.qualifications;
export const LANGS = ['en', 'tr', 'it'];

// Job id for the final "My Job" round, where applicants compete for the employer's real job.
export const MY_JOB = -1;

export const HAND_SIZE = 4;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const PREP_SECONDS = 60;
const POOL_REFRESH_EVERY = 3;
const NAME_MAX = 20;

export const PITCH_OPTIONS = [0, 45, 60, 90, 120];
export const LAP_OPTIONS = [0, 1, 2, 3];

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

export function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export class Room {
  constructor(code, { rng = Math.random, now = Date.now } = {}) {
    this.code = code;
    this.rng = rng;
    this.now = now;
    this.players = [];
    this.ownerId = null;
    this.phase = 'lobby';
    this.settings = { laps: 0, pitchSeconds: 60, blind: false, myJob: true };
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
    if ('laps' in patch) {
      if (!LAP_OPTIONS.includes(patch.laps)) fail('bad_setting');
      next.laps = patch.laps;
    }
    if ('pitchSeconds' in patch) {
      if (!PITCH_OPTIONS.includes(patch.pitchSeconds)) fail('bad_setting');
      next.pitchSeconds = patch.pitchSeconds;
    }
    for (const key of ['blind', 'myJob']) {
      if (key in patch) {
        if (typeof patch[key] !== 'boolean') fail('bad_setting');
        next[key] = patch[key];
      }
    }
    this.settings = next;
  }

  // ---------- decks ----------

  drawQual() {
    if (this.qualDeck.length === 0) {
      this.qualDeck = shuffle(this.qualDiscard, this.rng);
      this.qualDiscard = [];
    }
    if (this.qualDeck.length === 0) fail('deck_empty');
    return this.qualDeck.pop();
  }

  drawJob() {
    if (this.jobDeck.length === 0) this.jobDeck = shuffle(range(JOBS.length), this.rng);
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
      p.hand = [];
      p.ready = false;
    }
    this.qualDeck = shuffle(range(QUALS.length), this.rng);
    this.qualDiscard = [];
    this.jobDeck = shuffle(range(JOBS.length), this.rng);
    this.pool = [];
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
    this.maybeStartInterviews();
  }

  maybeStartInterviews() {
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

  // The employer decides; if they dropped out, the host decides for them.
  requireDecider(byId) {
    const employerId = this.round.employerId;
    const allowed = this.isConnected(employerId) ? employerId : this.hostId();
    if (byId !== allowed) fail('employer_only');
  }

  hire(byId, applicantId) {
    if (this.phase !== 'decision') fail('wrong_phase');
    this.requireDecider(byId);
    if (!this.round.applicants.includes(applicantId)) fail('not_applicant');
    const employer = this.getPlayer(this.round.employerId);
    this.getPlayer(applicantId).jobs.push({ job: this.round.job, employer: employer.name });
    this.round.winnerId = applicantId;
    this.phase = 'result';
  }

  skipRound(byId) {
    this.requireHost(byId);
    if (!['prep', 'interview', 'decision'].includes(this.phase)) fail('wrong_phase');
    this.round.winnerId = null;
    this.phase = 'result';
  }

  nextRound(byId) {
    if (this.phase !== 'result') fail('wrong_phase');
    if (byId !== this.round.employerId && byId !== this.hostId()) fail('not_allowed');
    if (this.roundNumber >= this.totalRounds) {
      this.phase = 'over';
      return;
    }
    this.startRound();
  }

  endGame(byId) {
    this.requireHost(byId);
    if (!this.inGame()) fail('wrong_phase');
    this.phase = 'over';
  }

  backToLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'over') fail('wrong_phase');
    this.phase = 'lobby';
    this.round = null;
    for (const p of this.players) {
      p.jobs = [];
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
      round = {
        employerId: r.employerId,
        job: r.job,
        applicants: r.applicants,
        currentId: this.phase === 'interview' ? this.currentApplicantId() : null,
        prepStartedAt: r.prepStartedAt,
        turnStartedAt: r.turnStartedAt,
        winnerId: r.winnerId,
        pool: this.phase === 'prep' ? this.pool : [],
        resumes,
        hand,
      };
    }
    return {
      code: this.code,
      me: playerId,
      hostId: this.hostId(),
      phase: this.phase,
      settings: this.settings,
      prepSeconds: PREP_SECONDS,
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      serverNow: this.now(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.sockets > 0,
        ready: p.ready,
        jobs: p.jobs,
      })),
      round,
    };
  }
}
