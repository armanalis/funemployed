import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError, HAND_SIZE, MY_JOB, JOBS, QUALS, LANGS } from '../server/game.js';

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

test('an offline seat can be reclaimed by name; duplicate names get a suffix', () => {
  const { room, players } = setup();
  room.leave(players[1].id);
  const back = room.join(null, 'ece');
  assert.equal(back.id, players[1].id);
  const dupe = room.join(null, 'Ali');
  assert.equal(dupe.name, 'Ali 2');
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
