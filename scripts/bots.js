// Fills a room with bots so you can test alone.
// Usage: npm run bots -- ABCD 2        (room code, number of bots)
// Env:   URL=http://localhost:3000  BOT_DELAY=1200
import { io } from 'socket.io-client';

const [code, countArg = '2'] = process.argv.slice(2);
if (!/^[A-Za-z]{4}$/.test(code ?? '')) {
  console.error('Usage: npm run bots -- <ROOM CODE> [count]');
  process.exit(1);
}
const URL = process.env.URL ?? 'http://localhost:3000';
const DELAY = Number(process.env.BOT_DELAY ?? 1200);
const NAMES = ['Bot Bora', 'Bot Ceren', 'Bot Deniz', 'Bot Emre', 'Bot Figen', 'Bot Gökhan'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

function startBot(name) {
  const socket = io(URL);
  let busy = false;
  let lastKey = '';

  const emit = (event, payload = {}) =>
    new Promise((resolve) => socket.timeout(5000).emit(event, payload, (err, res) => resolve(err ? { error: 'timeout' } : res)));

  async function onState(s) {
    const r = s.round;
    // Act once per distinct situation.
    const key = [
      s.phase,
      s.roundNumber,
      r?.currentId,
      r?.hand?.join(),
      s.players.find((p) => p.id === s.me)?.ready,
      r?.finalists?.join(),
      r && Object.values(r.bonusPicks ?? {}).join(),
    ].join('|');
    if (busy || key === lastKey || !r) return;
    lastKey = key;
    busy = true;
    try {
      const me = s.me;
      const decider = s.players.find((p) => p.id === r.employerId)?.connected ? r.employerId : s.hostId;
      if (s.phase === 'prep' && r.applicants.includes(me) && !s.players.find((p) => p.id === me).ready) {
        await wait(DELAY);
        if (Math.random() < 0.7 && r.pool.length) {
          const poolIdx = Math.floor(Math.random() * r.pool.length);
          await emit('game:swap', { handIdx: Math.floor(Math.random() * 4), poolIdx, card: r.pool[poolIdx] });
        }
        await wait(DELAY);
        await emit('game:ready', { ready: true });
      } else if (s.phase === 'interview' && r.currentId === me) {
        for (let i = 0; i < 4; i++) {
          await wait(DELAY);
          await emit('game:reveal', { handIdx: i });
        }
        await wait(DELAY);
        await emit('game:finishPitch');
      } else if (s.phase === 'decision' && decider === me) {
        await wait(DELAY * 2);
        // Now and then the bot can't decide and calls a tiebreaker between two applicants.
        if (Math.random() < 0.4) {
          const finalists = [...r.applicants].sort(() => Math.random() - 0.5).slice(0, 2);
          await emit('game:tiebreak', { finalists });
        } else {
          await emit('game:hire', { playerId: pick(r.applicants) });
        }
      } else if (s.phase === 'tiebreak' && r.finalists.includes(me) && r.bonusPicks[me] == null) {
        await wait(DELAY * 1.5);
        await emit('game:pickBonus', { idx: Math.floor(Math.random() * 2) });
      } else if (s.phase === 'tiebreak' && decider === me && r.finalists.every((id) => r.bonusPicks[id] != null)) {
        await wait(DELAY * 2);
        await emit('game:hire', { playerId: pick(r.finalists) });
      } else if (s.phase === 'result' && r.employerId === me) {
        await wait(DELAY * 3);
        await emit('game:nextRound');
      }
      // Everyone but the employer votes for someone else's pitch.
      const votable = r.applicants.filter((id) => id !== me);
      if (r.voting && !r.myVote && ['decision', 'tiebreak'].includes(s.phase) && r.employerId !== me && votable.length) {
        await wait(DELAY);
        await emit('game:vote', { playerId: pick(votable) });
      }
    } finally {
      busy = false;
    }
  }

  socket.on('state', onState);
  // After a dropped connection the bot rejoins its own seat with its token.
  let token;
  socket.on('connect', async () => {
    const res = await emit('room:join', { code, name, token });
    if (res.token) token = res.token;
    console.log(res.error ? `${name}: ${res.error}` : `${name} joined ${code.toUpperCase()}`);
  });
  return socket;
}

const count = Math.max(1, Math.min(NAMES.length, Number(countArg)));
for (const name of NAMES.slice(0, count)) startBot(name);
