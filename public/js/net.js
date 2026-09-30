import { io } from '/socket.io/socket.io.esm.min.js';

export const socket = io();

// Emits an event and resolves with the server's reply ({ error } on failure or timeout).
export function call(event, payload = {}) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { error: 'timeout' } : res ?? {}));
  });
}
