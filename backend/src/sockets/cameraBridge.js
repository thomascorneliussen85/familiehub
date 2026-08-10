import { db } from '../db/index.js';
import { hashBridgeApiKey } from '../services/cameraBridgeAuth.js';
import {
  registerBridgeSocket,
  unregisterBridgeSocket,
  isBridgeOnline,
  getStream,
  removeStream,
} from '../services/cameraBridgeRegistry.js';

// Egen socket.io-namespace for kamera-broer (lokale Raspberry Pi-tjenester),
// atskilt fra familiens vanlige nettleser-sockets i sockets/index.js – broen
// autentiserer med en bridgeId+apiKey (se routes/cameraBridge.js), ikke med
// økt-cookien en innlogget bruker har.
export function registerCameraBridgeSockets(io) {
  const bridgeNamespace = io.of('/camera-bridge');

  bridgeNamespace.use((socket, next) => {
    const { bridgeId, apiKey } = socket.handshake.auth || {};
    if (!bridgeId || !apiKey) return next(new Error('unauthorized'));
    const bridge = db.prepare('SELECT * FROM camera_bridges WHERE id = ?').get(bridgeId);
    if (!bridge || bridge.api_key_hash !== hashBridgeApiKey(apiKey)) {
      return next(new Error('unauthorized'));
    }
    socket.bridgeId = bridge.id;
    socket.familyId = bridge.family_id;
    next();
  });

  bridgeNamespace.on('connection', (socket) => {
    const { familyId, bridgeId } = socket;
    registerBridgeSocket(familyId, socket);
    db.prepare("UPDATE camera_bridges SET last_seen_at = datetime('now') WHERE id = ?").run(bridgeId);
    console.log(`📷 Kamera-bro tilkoblet: ${bridgeId} (familie ${familyId})`);
    io.to(`family:${familyId}`).emit('camera-bridge:status', { online: true });

    // Broen kaller dette når den finner et nytt Tapo-kamera på nettverket
    // (ONVIF-oppdagelse). Kameraet legges inn som "pending" – familien må
    // fortsatt navngi/godkjenne det i Innstillinger før det er aktivt, slik
    // at ikke et hvilket som helst ONVIF-kamera i nærheten (f.eks. et
    // naboens) automatisk blir en fungerende kikkhullskamera-strøm.
    socket.on('camera:discovered', (payload = {}, cb) => {
      const { localIp, manufacturer, model, serial } = payload;
      if (!localIp) return cb?.({ error: 'localIp mangler' });
      const existing = serial
        ? db.prepare('SELECT * FROM cameras WHERE family_id = ? AND serial = ?').get(familyId, serial)
        : db.prepare('SELECT * FROM cameras WHERE family_id = ? AND local_ip = ?').get(familyId, localIp);
      if (existing) {
        db.prepare(
          `UPDATE cameras SET local_ip = ?, manufacturer = COALESCE(?, manufacturer),
           model = COALESCE(?, model), serial = COALESCE(?, serial) WHERE id = ?`
        ).run(localIp, manufacturer || null, model || null, serial || null, existing.id);
        return cb?.({ id: existing.id, status: existing.status });
      }
      const info = db
        .prepare(
          `INSERT INTO cameras (family_id, name, rtsp_url, status, local_ip, manufacturer, model, serial)
           VALUES (?, ?, '', 'pending', ?, ?, ?, ?)`
        )
        .run(
          familyId,
          manufacturer && model ? `${manufacturer} ${model}` : 'Nytt kamera',
          localIp,
          manufacturer || null,
          model || null,
          serial || null
        );
      io.to(`family:${familyId}`).emit('cameras:update');
      cb?.({ id: info.lastInsertRowid, status: 'pending' });
    });

    // Videovideresending: routes/cameras.js har allerede registrert en
    // ventende HTTP-respons under streamId og satt multipart-headerne før
    // broen begynner å sende biter.
    socket.on('camera:stream-chunk', ({ streamId, chunk } = {}) => {
      const stream = getStream(streamId);
      if (!stream || stream.familyId !== familyId) return;
      stream.res.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    socket.on('camera:stream-error', ({ streamId, message } = {}) => {
      const stream = getStream(streamId);
      if (!stream || stream.familyId !== familyId) return;
      console.error(`Kamera-stream (bro) feilet: ${message}`);
      if (!stream.res.headersSent) stream.res.status(502).json({ error: message || 'Kamera-strøm feilet' });
      else stream.res.end();
      removeStream(streamId);
    });

    socket.on('camera:stream-ended', ({ streamId } = {}) => {
      const stream = getStream(streamId);
      if (!stream || stream.familyId !== familyId) return;
      stream.res.end();
      removeStream(streamId);
    });

    socket.on('disconnect', () => {
      unregisterBridgeSocket(familyId, socket);
      io.to(`family:${familyId}`).emit('camera-bridge:status', { online: isBridgeOnline(familyId) });
      console.log(`📷 Kamera-bro frakoblet: ${bridgeId}`);
    });
  });
}
