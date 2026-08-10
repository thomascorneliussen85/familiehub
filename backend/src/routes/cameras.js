import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { isBridgeOnline, getBridgeSocket, registerStream, removeStream } from '../services/cameraBridgeRegistry.js';

const router = Router();
router.use(requireAuth);

const BOUNDARY = 'ffmpeg';

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT id, name, status, local_ip, manufacturer, model,
                (rtsp_url != '') AS has_direct_url
         FROM cameras WHERE family_id = ? ORDER BY id`
      )
      .all(req.familyId)
  );
});

router.post('/', requireFamilyPin, (req, res) => {
  const { name, rtspUrl } = req.body || {};
  if (!name || !rtspUrl) {
    return res.status(400).json({ error: 'Navn og RTSP-URL er påkrevd' });
  }
  const info = db
    .prepare(`INSERT INTO cameras (family_id, name, rtsp_url, status) VALUES (?, ?, ?, 'active')`)
    .run(req.familyId, name, rtspUrl);
  res.status(201).json({ id: info.lastInsertRowid, name });
});

// Navngi/godkjenn et kamera broen har oppdaget automatisk (status 'pending'
// -> 'active'), eller gi et eksisterende kamera nytt navn.
router.patch('/:id', requireFamilyPin, (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!camera) return res.status(404).json({ error: 'Kamera ikke funnet' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });
  db.prepare("UPDATE cameras SET name = ?, status = 'active' WHERE id = ?").run(name, camera.id);
  req.app.get('io').to(`family:${req.familyId}`).emit('cameras:update');
  res.json({ id: camera.id, name, status: 'active' });
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM cameras WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('cameras:update');
  res.status(204).end();
});

// Direkte ffmpeg-spawn på selve serveren – fungerer kun når FamilieHub-
// backenden kjører på samme (hjemme)nettverk som kameraet, altså for de som
// selvhoster lokalt. For skyhosting (Render) er kameraet uansett bare
// nåbart via en kamera-bro, se streamViaBridge under.
function streamViaDirectFfmpeg(req, res, camera) {
  const ffmpeg = spawn(config.ffmpegPath, [
    '-rtsp_transport', 'tcp',
    '-i', camera.rtsp_url,
    '-f', 'mpjpeg',
    '-boundary_tag', BOUNDARY,
    '-q:v', '6',
    '-r', '8',
    '-an',
    'pipe:1',
  ]);

  res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
  res.setHeader('Cache-Control', 'no-cache');

  ffmpeg.stdout.pipe(res);

  ffmpeg.on('error', (err) => {
    console.error(`Kamera-stream (${camera.name}) feilet å starte:`, err.message);
    if (!res.headersSent) res.status(500).end();
  });

  function cleanup() {
    ffmpeg.stdout.unpipe(res);
    ffmpeg.kill('SIGKILL');
  }
  req.on('close', cleanup);
  res.on('close', cleanup);
}

// Ber den tilkoblede kamera-broen (lokal Raspberry Pi) hente RTSP-strømmen
// selv og videresende den bit for bit over socket.io – se
// sockets/cameraBridge.js for mottakersiden. Broen kjenner kameraets
// RTSP-legitimasjon lokalt; den sendes aldri til/lagres aldri i skyen.
function streamViaBridge(req, res, camera) {
  const bridgeSocket = getBridgeSocket(req.familyId);
  if (!bridgeSocket) {
    return res.status(503).json({ error: 'Kamera-broen er ikke tilkoblet' });
  }
  const streamId = randomUUID();
  res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
  res.setHeader('Cache-Control', 'no-cache');
  registerStream(streamId, res, req.familyId);
  bridgeSocket.emit('camera:stream-request', { streamId, cameraId: camera.id, localIp: camera.local_ip });

  function cleanup() {
    removeStream(streamId);
    bridgeSocket.emit('camera:stream-stop', { streamId });
  }
  req.on('close', cleanup);
  res.on('close', cleanup);
}

router.get('/:id/stream', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!camera) {
    return res.status(404).json({ error: 'Kamera ikke funnet' });
  }
  if (camera.status === 'pending') {
    return res.status(400).json({ error: 'Kameraet er ikke navngitt/godkjent ennå' });
  }
  if (camera.local_ip && isBridgeOnline(req.familyId)) {
    return streamViaBridge(req, res, camera);
  }
  if (camera.rtsp_url) {
    return streamViaDirectFfmpeg(req, res, camera);
  }
  return res.status(503).json({ error: 'Kamera-broen er ikke tilkoblet' });
});

export default router;
