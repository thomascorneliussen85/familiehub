import cookie from 'cookie';
import { SESSION_COOKIE, verifySession } from '../middleware/requireAuth.js';

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
      const payload = verifySession(token);
      socket.familyId = payload.familyId;
      socket.userId = payload.userId;
      socket.sessionExpires = payload.exp * 1000;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`family:${socket.familyId}`);
    socket.join(`user:${socket.userId}`);
    const expiry = setInterval(() => {
      try { verifySession(cookie.parse(socket.handshake.headers.cookie || '')[SESSION_COOKIE]); }
      catch { socket.disconnect(true); }
    }, 60000);
    expiry.unref?.();
    socket.once('disconnect', () => clearInterval(expiry));
    console.log(`🔌 Klient tilkoblet: ${socket.id} (familie ${socket.familyId})`);
    socket.on('disconnect', () => {
      console.log(`🔌 Klient frakoblet: ${socket.id}`);
    });
  });
}
