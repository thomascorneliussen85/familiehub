import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db/index.js';

const router = Router();
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const COVER_SETTING_KEY = 'dashboard_cover_photo';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/', (req, res) => {
  fs.mkdirSync(config.photos.dir, { recursive: true });
  const files = fs
    .readdirSync(config.photos.dir)
    .filter((f) => EXTENSIONS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .sort();
  res.json(files.map((name) => ({ name, url: `/photos/${encodeURIComponent(name)}` })));
});

router.get('/cover', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(COVER_SETTING_KEY);
  res.json({ url: row ? `/photos/${encodeURIComponent(row.value)}` : null });
});

router.post('/cover', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen fil mottatt' });
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: 'Ugyldig filtype' });
  }

  fs.mkdirSync(config.photos.dir, { recursive: true });

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(COVER_SETTING_KEY);
  if (existing) {
    fs.rm(path.join(config.photos.dir, existing.value), { force: true }, () => {});
  }

  const filename = `dashboard-cover${ext}`;
  fs.writeFileSync(path.join(config.photos.dir, filename), req.file.buffer);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(COVER_SETTING_KEY, filename);

  const url = `/photos/${encodeURIComponent(filename)}`;
  req.app.get('io').emit('photos:cover-update', { url });
  res.status(201).json({ url });
});

export default router;
