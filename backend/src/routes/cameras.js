import { Router } from 'express';
import { spawn } from 'node:child_process';
import { config } from '../config.js';

const router = Router();
const BOUNDARY = 'ffmpeg';

router.get('/', (req, res) => {
  res.json(config.cameras.map(({ id, name }) => ({ id, name })));
});

router.get('/:id/stream', (req, res) => {
  const camera = config.cameras.find((c) => c.id === Number(req.params.id));
  if (!camera) {
    return res.status(404).json({ error: 'Kamera ikke funnet' });
  }

  const ffmpeg = spawn(config.ffmpegPath, [
    '-rtsp_transport', 'tcp',
    '-i', camera.rtspUrl,
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
