import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Room,
  GameError,
  HAND_SIZE,
  BONUS_CARDS,
  MY_JOB,
  JOBS,
  QUALS,
  LANGS,
  CUSTOM_BASE,
  CUSTOM_MAX_PER_KIND,
  TIME_UP_GRACE_MS,
} from '../server/game.js';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function setup(names = ['Ali', 'Ece', 'Mert']) {
  let clock = 1_000;
  const room = new Room('ABCD', { rng: seeded(), now: () => clock });
  const players = names.map((n) => room.join(null, n));
  return { room, players, tick: (ms) => (clock += ms) };
}

const ids = (players) => players.map((p) => p.id);

function playRound(room, winnerPick = 0) {
  const r = room.round;
  for (const id of r.applicants) room.setReady(id, true);
  assert.equal(room.phase, 'interview');
  for (const id of [...r.applicants]) {
    assert.equal(room.currentApplicantId(), id);
    room.reveal(id, 0);
    room.finishPitch(id);
  }
  assert.equal(room.phase, 'decision');
  room.hire(r.employerId, r.applicants[winnerPick]);
  assert.equal(room.phase, 'result');
}

test('first joiner is host; reconnect by token keeps the seat', () => {
  const { room, players } = setup();
  assert.equal(room.hostId(), players[0].id);
  room.leave(players[0].id);
  assert.equal(room.hostId(), players[1].id, 'host stands in while owner is offline');
  const again = room.join(players[0].token);
  assert.equal(again.id, players[0].id);
  assert.equal(room.hostId(), players[0].id);
  assert.equal(room.players.length, 3);
});

test('an offline seat can be reclaimed by name with its points; duplicate names get a suffix', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  playRound(room);
  const winner = room.getPlayer(room.round.winnerId);
  room.nextRound(room.round.employerId);
  room.leave(winner.id);
  const back = room.join(null, ` ${winner.name.toLowerCase()} `);
  assert.equal(back.id, winner.id, 'same seat, e.g. from another device');
  assert.equal(back.jobs.length, 1, 'points are kept');
  const dupe = room.join(null, 'Ali');
  assert.equal(dupe.name, 'Ali 2', 'a connected player\'s name is not taken over');
});

test('names match whatever the case, including I and İ', () => {
  const { room, players } = setup(['Ali', 'İrem', 'Işık']);
  for (const p of players) room.leave(p.id);
  assert.equal(room.join(null, 'ALI').id, players[0].id);
  assert.equal(room.join(null, 'irem').id, players[1].id);
  assert.equal(room.join(null, 'IŞIK').id, players[2].id);
  assert.equal(room.join(null, 'ali').name, 'ali 2', 'Ali is connected again, so this is someone new');
  room.addCustomCard(players[0].id, 'qual', 'Ice Cream Inspector');
  assert.throws(() => room.addCustomCard(players[0].id, 'qual', 'ICE CREAM INSPECTOR'), /card_exists/);
});

test('game needs 3 connected players and only the host can start it', () => {
  const { room, players } = setup(['Ali', 'Ece']);
  assert.throws(() => room.startGame(players[0].id), GameError);
  room.join(null, 'Mert');
  assert.throws(() => room.startGame(players[1].id), /host_only/);
  room.startGame(players[0].id);
  assert.equal(room.phase, 'prep');
});

test('dealing: employer has no hand, applicants get 4, pool has 10', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  assert.equal(r.applicants.length, 3);
  assert.ok(!r.applicants.includes(r.employerId));
  for (const id of r.applicants) assert.equal(room.getPlayer(id).hand.length, HAND_SIZE);
  assert.equal(room.getPlayer(r.employerId).hand.length, 0);
  assert.equal(room.pool.length, 10);
  const all = [...room.pool, ...r.applicants.flatMap((id) => room.getPlayer(id).hand)];
  assert.equal(new Set(all).size, all.length, 'no card dealt twice');
});

test('swap exchanges a hand card with a pool card and rejects stale picks', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  const a = room.getPlayer(room.round.applicants[0]);
  const [h, p] = [a.hand[1], room.pool[3]];
  room.swap(a.id, 1, 3, p);
  assert.equal(a.hand[1], p);
  assert.equal(room.pool[3], h);
  assert.throws(() => room.swap(a.id, 0, 3, p), /card_taken/);
  assert.throws(() => room.swap(room.round.employerId, 0, 0), /not_applicant/);
  room.setReady(a.id, true);
  assert.throws(() => room.swap(a.id, 0, 0), /locked/);
});

test('views hide other hands and unrevealed résumé cards', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  const [a, b] = room.round.applicants;
  const viewA = room.view(a);
  assert.deepEqual(viewA.round.hand, room.getPlayer(a).hand);
  assert.ok(!('hand' in viewA.players[0]));
  assert.deepEqual(viewA.round.resumes[b], [null, null, null, null]);
  assert.ok(!JSON.stringify(viewA).includes('token'));

  room.setReady(a, true);
  room.setReady(b, true);
  room.reveal(a, 2);
  const viewB = room.view(b);
  assert.equal(viewB.round.resumes[a][2], room.getPlayer(a).hand[2]);
  assert.equal(viewB.round.resumes[a][0], null);
});

test('interviews go in order; only the current applicant can reveal', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  room.startInterviews(r.employerId);
  const [first, second] = r.applicants;
  assert.throws(() => room.reveal(second, 0), /not_your_turn/);
  room.finishPitch(r.employerId);
  assert.deepEqual(r.revealed[first], [true, true, true, true], 'finishing reveals everything');
  assert.equal(room.currentApplicantId(), second);
});

test('offline applicants are skipped; employer offline → host decides', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  room.leave(r.applicants[1]);
  room.startInterviews(room.hostId());
  room.finishPitch(r.applicants[0]);
  assert.equal(room.currentApplicantId(), r.applicants[2]);
  room.finishPitch(r.applicants[2]);
  assert.equal(room.phase, 'decision');
  if (r.employerId !== room.hostId()) {
    room.leave(r.employerId);
    assert.throws(() => room.hire(r.employerId, r.applicants[0]), /employer_only/);
    room.hire(room.hostId(), r.applicants[0]);
  } else {
    room.hire(r.employerId, r.applicants[0]);
  }
  assert.equal(room.getPlayer(r.applicants[0]).jobs.length, 1);
});

test('everyone hires twice with 3 players, the final round is "my job", then game over', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  assert.equal(room.totalRounds, 6);
  const employers = [];
  for (let i = 0; i < 6; i++) {
    employers.push(room.round.employerId);
    if (i === 5) assert.equal(room.round.job, MY_JOB);
    else assert.notEqual(room.round.job, MY_JOB);
    playRound(room);
    room.nextRound(room.round.employerId);
  }
  assert.equal(room.phase, 'over');
  for (const id of ids(players)) assert.equal(employers.filter((e) => e === id).length, 2);
  const totalJobs = room.players.reduce((n, p) => n + p.jobs.length, 0);
  assert.equal(totalJobs, 6);
  room.backToLobby(players[0].id);
  assert.equal(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.jobs.length === 0));
});

test('blind mode skips prep and masks my own hand until revealed', () => {
  const { room, players } = setup();
  room.updateSettings(players[0].id, { blind: true });
  room.startGame(players[0].id);
  assert.equal(room.phase, 'interview');
  const a = room.currentApplicantId();
  assert.deepEqual(room.view(a).round.hand, [null, null, null, null]);
  room.reveal(a, 1);
  assert.equal(room.view(a).round.hand[1], room.getPlayer(a).hand[1]);
});

test('settings are validated and host-only', () => {
  const { room, players } = setup();
  assert.throws(() => room.updateSettings(players[1].id, { laps: 1 }), /host_only/);
  assert.throws(() => room.updateSettings(players[0].id, { laps: 9 }), /bad_setting/);
  assert.throws(() => room.updateSettings(players[0].id, { blind: 'yes' }), /bad_setting/);
  assert.throws(() => room.updateSettings(players[0].id, null), /bad_setting/);
  assert.throws(() => room.updateSettings(players[0].id, 'laps'), /bad_setting/);
  room.updateSettings(players[0].id, { laps: 1, pitchSeconds: 90 });
  assert.equal(room.settings.laps, 1);
  assert.equal(room.settings.pitchSeconds, 90);
});

test('deck reshuffles the discard pile over a long game', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  room.updateSettings(players[0].id, { laps: 3 });
  room.startGame(players[0].id);
  for (let i = 0; i < room.totalRounds; i++) {
    playRound(room);
    room.nextRound(room.round.employerId);
  }
  assert.equal(room.phase, 'over');
});

test('host can skip a stuck round; late joiners extend the game', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  const before = room.totalRounds;
  room.join(null, 'Latecomer');
  assert.equal(room.totalRounds, before + 2);
  room.skipRound(players[0].id);
  assert.equal(room.phase, 'result');
  assert.equal(room.round.winnerId, null);
  room.nextRound(players[0].id);
  assert.equal(room.phase, 'prep');
});

test('late joiners hire as many times as everyone else', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  const employers = [];
  for (let i = 0; room.phase !== 'over'; i++) {
    if (i === 3) room.join(null, 'Latecomer');
    employers.push(room.getPlayer(room.round.employerId).name);
    playRound(room);
    room.nextRound(room.round.employerId);
  }
  assert.equal(employers.length, 8);
  for (const name of ['Ali', 'Ece', 'Mert', 'Latecomer']) {
    assert.equal(employers.filter((e) => e === name).length, 2, `${name} hires twice`);
  }
});

test('someone joining during the final round does not add another final round', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  for (let i = 0; i < 5; i++) {
    playRound(room);
    room.nextRound(room.round.employerId);
  }
  assert.equal(room.round.job, MY_JOB);
  room.join(null, 'Latecomer');
  assert.equal(room.totalRounds, 6);
  playRound(room);
  room.nextRound(room.round.employerId);
  assert.equal(room.phase, 'over');
});

test('every card has text in every language and a unique id', () => {
  for (const [name, list] of [['jobs', JOBS], ['qualifications', QUALS]]) {
    assert.ok(list.length > 0, `${name} is empty`);
    assert.equal(new Set(list.map((c) => c.id)).size, list.length, `${name} has duplicate ids`);
    for (const card of list) {
      for (const lang of LANGS) {
        assert.ok(typeof card[lang] === 'string' && card[lang].trim(), `${name} #${card.id} is missing "${lang}"`);
      }
    }
  }
});

// ---------- added features ----------

function inPlay(room) {
  const r = room.round;
  return [
    ...room.qualDeck,
    ...room.qualDiscard,
    ...room.pool,
    ...room.players.flatMap((p) => p.hand),
    ...Object.values(r?.bonus ?? {}).flat(),
  ];
}

function toDecision(room) {
  for (const id of room.round.applicants) room.setReady(id, true);
  for (const id of [...room.round.applicants]) room.finishPitch(id);
  assert.equal(room.phase, 'decision');
}

test('family mode leaves 18+ cards out of both decks', () => {
  const { room, players } = setup();
  room.updateSettings(players[0].id, { family: true });
  room.startGame(players[0].id);
  const adultQuals = QUALS.flatMap((c, i) => (c.adult ? [i] : []));
  const adultJobs = JOBS.flatMap((c, i) => (c.adult ? [i] : []));
  assert.ok(adultQuals.length > 0 && adultJobs.length > 0);
  const quals = new Set(inPlay(room));
  assert.equal(quals.size, QUALS.length - adultQuals.length);
  for (const id of adultQuals) assert.ok(!quals.has(id));
  for (const id of adultJobs) assert.ok(!room.jobIds.includes(id));
});

test('custom cards: anyone adds in the lobby, author or host removes, they join the deck', () => {
  const { room, players } = setup();
  const [host, ece, mert] = players;
  room.addCustomCard(ece.id, 'qual', '  Knows   the  bus schedule ');
  room.addCustomCard(mert.id, 'job', 'Professional napper');
  const [card] = room.custom.quals;
  assert.equal(card.text, 'Knows the bus schedule');
  assert.ok(card.id >= CUSTOM_BASE);
  assert.throws(() => room.addCustomCard(ece.id, 'qual', 'knows the BUS schedule'), /card_exists/);
  assert.throws(() => room.addCustomCard(ece.id, 'qual', '   '), /card_empty/);
  assert.throws(() => room.addCustomCard(ece.id, 'qual', 'x'.repeat(51)), /card_too_long/);
  assert.throws(() => room.addCustomCard(ece.id, 'weapon', 'Sword'), /bad_card/);
  assert.throws(() => room.removeCustomCard(mert.id, 'qual', card.id), /not_allowed/);
  room.addCustomCard(ece.id, 'qual', 'Owns a llama farm');
  room.removeCustomCard(host.id, 'qual', room.custom.quals[1].id);
  assert.equal(room.custom.quals.length, 1);
  assert.equal(room.view(mert.id).custom.quals[0].by, 'Ece');

  room.updateSettings(host.id, { family: true });
  room.startGame(host.id);
  assert.ok(inPlay(room).includes(card.id), 'custom cards are dealt even in family mode');
  assert.ok(room.jobIds.includes(room.custom.jobs[0].id));
  assert.throws(() => room.addCustomCard(ece.id, 'qual', 'Too late'), /wrong_phase/);
});

test('custom card limit per kind', () => {
  const { room, players } = setup();
  for (let i = 0; i < CUSTOM_MAX_PER_KIND; i++) room.addCustomCard(players[0].id, 'job', `Job ${i}`);
  assert.throws(() => room.addCustomCard(players[0].id, 'job', 'One more'), /custom_limit/);
  room.addCustomCard(players[0].id, 'qual', 'Qualifications have their own limit');
});

test('timers: résumé building and pitches end on their own', () => {
  const { room, players, tick } = setup(['A', 'B', 'C', 'D']);
  room.updateSettings(players[0].id, { prepSeconds: 30, pitchSeconds: 45 });
  room.startGame(players[0].id);
  assert.equal(room.deadline(), room.round.prepStartedAt + 30_000 + TIME_UP_GRACE_MS);
  tick(30_000);
  assert.equal(room.tick(), false, 'the "time\'s up" grace period comes first');
  tick(TIME_UP_GRACE_MS);
  assert.equal(room.tick(), true);
  assert.equal(room.phase, 'interview');

  const first = room.currentApplicantId();
  tick(45_000 + TIME_UP_GRACE_MS);
  room.tick();
  assert.deepEqual(room.round.revealed[first], [true, true, true, true], 'all cards shown when time runs out');
  assert.notEqual(room.currentApplicantId(), first);
});

test('timers set to "no timer" wait for the players', () => {
  const { room, players, tick } = setup();
  assert.throws(() => room.updateSettings(players[0].id, { prepSeconds: 7 }), /bad_setting/);
  room.updateSettings(players[0].id, { prepSeconds: 0, pitchSeconds: 0 });
  room.startGame(players[0].id);
  assert.equal(room.deadline(), null);
  tick(10 * 60_000);
  assert.equal(room.tick(), false);
  assert.equal(room.phase, 'prep');
});

test('audience vote: hidden until the hire, star to the clear favorite', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  const [x, y, z] = r.applicants;
  toDecision(room);
  assert.ok(room.view(x).round.voting);
  assert.throws(() => room.vote(r.employerId, x), /not_allowed/);
  assert.throws(() => room.vote(x, x), /no_self_vote/);
  room.vote(x, y);
  room.vote(z, x);
  room.vote(z, y); // changing your mind is fine
  assert.deepEqual(room.view(x).round.voteCounts, {}, 'no counts before the hire');
  assert.equal(room.view(x).round.votesCast, 2);
  assert.deepEqual(room.view(r.employerId).round.notVoted, [y], 'the employer sees who still has to vote');
  assert.equal(room.view(x).round.myVote, y);

  room.hire(r.employerId, x);
  assert.deepEqual(room.view(x).round.voteCounts, { [y]: 2 });
  assert.equal(room.view(x).round.fanFavoriteId, y);
  assert.throws(() => room.vote(z, x), /wrong_phase/, 'votes are final once the counts are shown');
  assert.equal(room.view(x).round.fanFavoriteId, y);
  room.nextRound(r.employerId);
  assert.equal(room.getPlayer(y).stars, 1);
  assert.equal(room.getPlayer(x).stars, 0);
});

test('audience vote: ties give no star; off with 2 applicants or when disabled', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  const [x, y, z] = r.applicants;
  toDecision(room);
  room.vote(x, y);
  room.vote(y, x);
  room.hire(r.employerId, z);
  assert.equal(room.fanFavoriteId(), null);
  room.nextRound(r.employerId);
  assert.ok(room.players.every((p) => p.stars === 0));

  const small = setup(['A', 'B', 'C']);
  small.room.startGame(small.players[0].id);
  assert.equal(small.room.votingOn(), false);

  const off = setup(['A', 'B', 'C', 'D']);
  off.room.updateSettings(off.players[0].id, { votes: false });
  off.room.startGame(off.players[0].id);
  toDecision(off.room);
  assert.throws(() => off.room.vote(off.room.round.applicants[0], off.room.round.applicants[1]), /voting_off/);
});

test('a skipped round does not use up the employer\'s turn', () => {
  const { room, players } = setup();
  room.startGame(players[0].id);
  const skipped = room.round.employerId;
  room.skipRound(players[0].id);
  assert.equal(room.totalRounds, 7);
  room.nextRound(players[0].id);
  const hired = [];
  while (room.phase !== 'over') {
    hired.push(room.round.employerId);
    playRound(room);
    room.nextRound(room.round.employerId);
  }
  assert.equal(hired.length, 6);
  for (const id of ids(players)) assert.equal(hired.filter((e) => e === id).length, 2);
  assert.equal(hired.filter((e) => e === skipped).length, 2, 'the skipped employer still hires twice');
});

test('a skipped round awards no star', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const [x, y] = room.round.applicants;
  toDecision(room);
  room.vote(x, y);
  room.skipRound(players[0].id);
  assert.throws(() => room.vote(y, x), /voting_off/);
  room.nextRound(players[0].id);
  assert.ok(room.players.every((p) => p.stars === 0));
});

test('tiebreaker: finalists get 2 private cards, pick one, employer hires a finalist', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D']);
  room.startGame(players[0].id);
  const r = room.round;
  const [x, y, z] = r.applicants;
  toDecision(room);
  assert.throws(() => room.startTiebreak(x, [x, y]), /employer_only/);
  assert.throws(() => room.startTiebreak(r.employerId, [x]), /need_finalists/);
  assert.throws(() => room.startTiebreak(r.employerId, [x, r.employerId]), /need_finalists/);
  room.startTiebreak(r.employerId, [y, x, x]);
  assert.equal(room.phase, 'tiebreak');
  assert.deepEqual(r.finalists, [x, y], 'finalists keep pitching order');

  assert.equal(room.view(x).round.bonusHand.length, BONUS_CARDS);
  assert.deepEqual(room.view(z).round.bonusHand, [], 'others cannot see the extra cards');
  assert.deepEqual(room.view(z).round.bonusPicks, { [x]: null, [y]: null });
  assert.throws(() => room.pickBonus(z, 0), /not_finalist/);
  room.pickBonus(x, 1);
  assert.throws(() => room.pickBonus(x, 0), /already_picked/);
  assert.equal(room.view(z).round.bonusPicks[x], r.bonus[x][1]);

  room.vote(z, x); // voting stays open during the tiebreaker
  assert.throws(() => room.hire(r.employerId, z), /not_finalist/);
  room.hire(r.employerId, y);
  assert.equal(room.phase, 'result');
  assert.throws(() => room.startTiebreak(r.employerId, [x, y]), /wrong_phase/);
});

test('cards never duplicate across a long game with tiebreakers', () => {
  const { room, players } = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  room.updateSettings(players[0].id, { laps: 2 });
  room.startGame(players[0].id);
  for (let i = 0; i < room.totalRounds; i++) {
    const r = room.round;
    toDecision(room);
    room.startTiebreak(r.employerId, r.applicants.slice(0, 3));
    for (const id of r.finalists) room.pickBonus(id, 0);
    const cards = inPlay(room);
    assert.equal(new Set(cards).size, cards.length, `duplicate card in round ${room.roundNumber}`);
    room.hire(r.employerId, r.finalists[0]);
    room.nextRound(r.employerId);
  }
  assert.equal(room.phase, 'over');
});
