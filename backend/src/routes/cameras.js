import { Router } from 'express';
import { spawn } from 'node:child_process';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

const BOUNDARY = 'ffmpeg';

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM cameras WHERE family_id = ? ORDER BY id').all(req.familyId));
});

router.post('/', requireFamilyPin, (req, res) => {
  const { name, rtspUrl } = req.body || {};
  if (!name || !rtspUrl) {
    return res.status(400).json({ error: 'Navn og RTSP-URL er påkrevd' });
  }
  const info = db.prepare('INSERT INTO cameras (family_id, name, rtsp_url) VALUES (?, ?, ?)').run(req.familyId, name, rtspUrl);
  res.status(201).json({ id: info.lastInsertRowid, name });
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM cameras WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

router.get('/:id/stream', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!camera) {
    return res.status(404).json({ error: 'Kamera ikke funnet' });
  }

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
});

export default router;
