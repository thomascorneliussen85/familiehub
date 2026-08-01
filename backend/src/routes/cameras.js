import { Router } from 'express';
import { spawn } from 'node:child_process';
import { db } from '../db/index.js';
import { config } from '../config.js';

const router = Router();
const BOUNDARY = 'ffmpeg';

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM cameras ORDER BY id').all());
});

router.post('/', requirePin, (req, res) => {
  const { name, rtspUrl } = req.body || {};
  if (!name || !rtspUrl) {
    return res.status(400).json({ error: 'Navn og RTSP-URL er påkrevd' });
  }
  const info = db.prepare('INSERT INTO cameras (name, rtsp_url) VALUES (?, ?)').run(name, rtspUrl);
  res.status(201).json({ id: info.lastInsertRowid, name });
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('DELETE FROM cameras WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/:id/stream', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
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
