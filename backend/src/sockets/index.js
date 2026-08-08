import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { SESSION_COOKIE } from '../middleware/requireAuth.js';

// Sanntidsoppdateringer skal kun nå familien de gjelder – hver socket
// autentiseres med samme økt-cookie som HTTP-forespørslene, og legges i et
// eget "family:<id>"-rom. Alle io.emit(...) i resten av backend er derfor
// erstattet med io.to(`family:${familyId}`).emit(...).
export function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(raw);
      const token = cookies[SESSION_COOKIE];
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, config.jwtSecret);
      socket.familyId = payload.familyId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`family:${socket.familyId}`);
    console.log(`🔌 Klient tilkoblet: ${socket.id} (familie ${socket.familyId})`);
    socket.on('disconnect', () => {
      console.log(`🔌 Klient frakoblet: ${socket.id}`);
    });
  });
}
