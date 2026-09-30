import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Room, GameError } from './game.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOM_IDLE_MS = 30 * 60 * 1000;
// No I, O, L or U: codes are read aloud and typed on phones.
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTVWXYZ';

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const app = express();
app.disable('x-powered-by');
app.use('/vendor/preact', express.static(fromRoot('node_modules/preact')));
app.use('/vendor/htm', express.static(fromRoot('node_modules/htm')));
app.use(express.static(fromRoot('public')));
app.get('/healthz', (_req, res) => res.send('ok'));
// Room links like /ABCD are handled by the client.
app.get(/^\/[A-Za-z]{4}\/?$/, (_req, res) => res.sendFile(fromRoot('public/index.html')));

const server = createServer(app);
const io = new Server(server);
const rooms = new Map();

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

function broadcast(room) {
  const socketIds = io.sockets.adapter.rooms.get(room.code) ?? [];
  for (const id of socketIds) {
    const socket = io.sockets.sockets.get(id);
    if (socket) socket.emit('state', room.view(socket.data.playerId));
  }
}

io.on('connection', (socket) => {
  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  function leaveCurrentRoom() {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    room.leave(socket.data.playerId);
    socket.leave(room.code);
    socket.data = {};
    broadcast(room);
  }

  socket.on('room:create', (_payload, ack) => {
    const code = newCode();
    rooms.set(code, new Room(code));
    reply(ack, { code });
  });

  socket.on('room:peek', (payload, ack) => {
    const room = rooms.get(normalizeCode(payload?.code));
    reply(ack, room ? { exists: true, players: room.players.length } : { exists: false });
  });

  socket.on('room:join', (payload, ack) => {
    const room = rooms.get(normalizeCode(payload?.code));
    if (!room) return reply(ack, { error: 'room_not_found' });
    try {
      if (socket.data.code) leaveCurrentRoom();
      const player = room.join(payload?.token, payload?.name);
      socket.data = { code: room.code, playerId: player.id };
      socket.join(room.code);
      reply(ack, { token: player.token });
      broadcast(room);
    } catch (err) {
      reply(ack, { error: err instanceof GameError ? err.message : 'server_error' });
      if (!(err instanceof GameError)) console.error(err);
    }
  });

  socket.on('room:leave', (_payload, ack) => {
    leaveCurrentRoom();
    reply(ack, { ok: true });
  });

  // Every game action: run it against the player's room, then push fresh state to everyone.
  const actions = {
    'game:start': (room, me) => room.startGame(me),
    'game:settings': (room, me, p) => room.updateSettings(me, p),
    'game:kick': (room, me, p) => room.kick(me, p?.playerId),
    'game:swap': (room, me, p) => room.swap(me, p?.handIdx, p?.poolIdx, p?.card),
    'game:ready': (room, me, p) => room.setReady(me, p?.ready),
    'game:startInterviews': (room, me) => room.startInterviews(me),
    'game:reveal': (room, me, p) => room.reveal(me, p?.handIdx),
    'game:finishPitch': (room, me) => room.finishPitch(me),
    'game:hire': (room, me, p) => room.hire(me, p?.playerId),
    'game:skipRound': (room, me) => room.skipRound(me),
    'game:nextRound': (room, me) => room.nextRound(me),
    'game:end': (room, me) => room.endGame(me),
    'game:lobby': (room, me) => room.backToLobby(me),
  };

  for (const [event, run] of Object.entries(actions)) {
    socket.on(event, (payload, ack) => {
      const room = rooms.get(socket.data.code);
      if (!room) return reply(ack, { error: 'not_in_room' });
      try {
        run(room, socket.data.playerId, payload);
        room.lastActive = Date.now();
        reply(ack, { ok: true });
      } catch (err) {
        reply(ack, { error: err instanceof GameError ? err.message : 'server_error' });
        if (!(err instanceof GameError)) console.error(err);
      }
      // Broadcast even after an error so a client acting on stale state catches up.
      broadcast(room);
    });
  }

  socket.on('disconnect', leaveCurrentRoom);
});

// Forget rooms nobody has touched for a while.
setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_MS;
  for (const [code, room] of rooms) {
    if (room.connectedPlayers().length === 0 && room.lastActive < cutoff) rooms.delete(code);
  }
}, 5 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Funemployed running at http://localhost:${PORT}`);
});
