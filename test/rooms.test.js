import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, ipKey, UNUSED_ROOM_MS, ROOM_IDLE_MS, ROOMS_PER_IP, IP_WINDOW_MS } from '../server/rooms.js';

function setup(max) {
  let clock = 1_000;
  const rooms = new Rooms({ max, now: () => clock });
  return { rooms, tick: (ms) => (clock += ms) };
}

test('room codes are 4 easy-to-read letters and lookups ignore case', () => {
  const { rooms } = setup();
  const room = rooms.create();
  assert.match(room.code, /^[A-HJKMNP-TV-Z]{4}$/);
  assert.equal(rooms.get(` ${room.code.toLowerCase()} `), room);
});

test('the server stops creating rooms at the limit instead of filling up', () => {
  const { rooms, tick } = setup(5);
  for (let i = 0; i < 5; i++) rooms.create(`10.0.0.${i}`);
  assert.throws(() => rooms.create(), /server_busy/);
  tick(UNUSED_ROOM_MS);
  rooms.create();
  assert.equal(rooms.byCode.size, 1, 'rooms nobody joined were cleared to make space');
});

test('one address can only create a few rooms at a time', () => {
  const { rooms, tick } = setup();
  for (let i = 0; i < ROOMS_PER_IP; i++) rooms.create('203.0.113.7');
  assert.throws(() => rooms.create('203.0.113.7'), /too_fast/);
  assert.throws(() => rooms.create('::ffff:203.0.113.7'), /too_fast/, 'same address written the IPv6 way');
  rooms.create('203.0.113.8');
  tick(IP_WINDOW_MS);
  rooms.create('203.0.113.7');
});

test('an IPv6 /64 block counts as one address', () => {
  assert.equal(ipKey('2001:db8:aa:bb:1:2:3:4'), '2001:db8:aa:bb');
  assert.equal(ipKey('2001:db8:aa:bb::99'), '2001:db8:aa:bb');
  assert.equal(ipKey('2001:0DB8::1'), '2001:db8:0:0');
  assert.equal(ipKey('::1'), '0:0:0:0');
  assert.equal(ipKey('192.168.1.20'), '192.168.1.20');
});

test('rooms nobody joined go after 5 minutes; rooms with players after 30 idle minutes', () => {
  const { rooms, tick } = setup();
  const unused = rooms.create();
  const played = rooms.create();
  const live = rooms.create();
  const ali = played.join(null, 'Ali');
  played.leave(ali.id);
  live.join(null, 'Ece');

  tick(UNUSED_ROOM_MS);
  assert.deepEqual(rooms.prune(), [unused.code]);
  tick(ROOM_IDLE_MS - UNUSED_ROOM_MS);
  assert.deepEqual(rooms.prune(), [played.code]);
  tick(ROOM_IDLE_MS * 10);
  assert.deepEqual(rooms.prune(), [], 'a room with someone connected stays');
  assert.equal(rooms.get(live.code), live);
});
