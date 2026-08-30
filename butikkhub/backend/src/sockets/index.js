import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { SESSION_COOKIE } from '../middleware/requireAuth.js';

// Sanntidsoppdateringer skal kun nå butikken de gjelder – hver socket
// autentiseres med samme økt-cookie som HTTP-forespørslene, og legges i et
// eget "butikk:<id>"-rom.
export function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(raw);
      const token = cookies[SESSION_COOKIE];
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, config.jwtSecret);
      socket.butikkId = payload.butikkId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`butikk:${socket.butikkId}`);
    console.log(`🔌 Klient tilkoblet: ${socket.id} (butikk ${socket.butikkId})`);
    socket.on('disconnect', () => {
      console.log(`🔌 Klient frakoblet: ${socket.id}`);
    });
  });
}
