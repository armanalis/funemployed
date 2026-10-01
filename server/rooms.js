import { Room, GameError } from './game.js';

// No I, O, L or U: codes are read aloud and typed on phones.
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTVWXYZ';
// Far more than a free server can host at once; keeps memory bounded and new codes quick to find.
export const MAX_ROOMS = 2000;
// Rooms nobody is in get forgotten after this long.
export const ROOM_IDLE_MS = 30 * 60 * 1000;
// Rooms nobody ever joined go sooner, so a burst of "Create a room" clicks can't fill the server.
export const UNUSED_ROOM_MS = 5 * 60 * 1000;
// Rooms one address can create in a window. Plenty for a group sharing one Wi-Fi.
export const ROOMS_PER_IP = 10;
export const IP_WINDOW_MS = 10 * 60 * 1000;

export const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

// The address a room limit applies to. Whoever controls one IPv6 address usually controls
// the whole /64 block around it, so the block counts as one address.
export function ipKey(address) {
  const ip = String(address ?? '').replace(/^::ffff:/, '').toLowerCase();
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

export class Rooms {
  constructor({ max = MAX_ROOMS, now = Date.now, rng = Math.random } = {}) {
    this.max = max;
    this.now = now;
    this.rng = rng;
    this.byCode = new Map();
    // ipKey → when that address created its recent rooms
    this.createdBy = new Map();
  }

  get(code) {
    return this.byCode.get(normalizeCode(code));
  }

  create(ip) {
    const key = ipKey(ip);
    const recent = this.recentCreates(key);
    if (recent.length >= ROOMS_PER_IP) throw new GameError('too_fast');
    if (this.byCode.size >= this.max) this.prune();
    if (this.byCode.size >= this.max) throw new GameError('server_busy');
    this.createdBy.set(key, [...recent, this.now()]);
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.rng() * CODE_LETTERS.length)]).join('');
    } while (this.byCode.has(code));
    const room = new Room(code, { now: this.now });
    this.byCode.set(code, room);
    return room;
  }

  recentCreates(key) {
    return (this.createdBy.get(key) ?? []).filter((at) => this.now() - at < IP_WINDOW_MS);
  }

  // Forgets rooms nobody is using. Returns their codes so the server can clear their timers.
  prune() {
    for (const key of this.createdBy.keys()) {
      if (this.recentCreates(key).length === 0) this.createdBy.delete(key);
    }
    const removed = [];
    for (const [code, room] of this.byCode) {
      if (room.connectedPlayers().length > 0) continue;
      const maxIdle = room.players.length === 0 ? UNUSED_ROOM_MS : ROOM_IDLE_MS;
      if (this.now() - room.lastActive < maxIdle) continue;
      this.byCode.delete(code);
      removed.push(code);
    }
    return removed;
  }
}
