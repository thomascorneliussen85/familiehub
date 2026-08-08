import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const COVER_SETTING_KEY = 'dashboard_cover_photo';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function familyDir(familyId) {
  return path.join(config.photos.dir, String(familyId));
}

router.get('/', (req, res) => {
  const dir = familyDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });
  const files = fs
    .readdirSync(dir)
    .filter((f) => EXTENSIONS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .sort();
  res.json(files.map((name) => ({ name, url: `/photos/${req.familyId}/${encodeURIComponent(name)}` })));
});

router.get('/cover', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE family_id = ? AND key = ?').get(req.familyId, COVER_SETTING_KEY);
  res.json({ url: row ? `/photos/${req.familyId}/${encodeURIComponent(row.value)}` : null });
});

router.post('/cover', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen fil mottatt' });
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: 'Ugyldig filtype' });
  }

  const dir = familyDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });

  const existing = db.prepare('SELECT value FROM settings WHERE family_id = ? AND key = ?').get(req.familyId, COVER_SETTING_KEY);
  if (existing) {
    fs.rm(path.join(dir, existing.value), { force: true }, () => {});
  }

  const filename = `dashboard-cover${ext}`;
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  db.prepare(
    `INSERT INTO settings (family_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value`
  ).run(req.familyId, COVER_SETTING_KEY, filename);

  const url = `/photos/${req.familyId}/${encodeURIComponent(filename)}`;
  req.app.get('io').to(`family:${req.familyId}`).emit('photos:cover-update', { url });
  res.status(201).json({ url });
});

// Massopplasting av bilder til fotoramme-mappen (⚙️ → Bilder).
router.post('/', requireFamilyPin, upload.array('photos', 100), (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Ingen filer mottatt' });
  }

  const dir = familyDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const filename = `photo-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    saved.push({ name: filename, url: `/photos/${req.familyId}/${encodeURIComponent(filename)}` });
  }

  if (saved.length === 0) {
    return res.status(400).json({ error: 'Ingen av filene var et gyldig bildeformat' });
  }
  res.status(201).json(saved);
});

router.delete('/:name', requireFamilyPin, (req, res) => {
  const name = req.params.name;
  if (!EXTENSIONS.has(path.extname(name).toLowerCase()) || name.includes('/') || name.includes('..')) {
    return res.status(400).json({ error: 'Ugyldig filnavn' });
  }
  fs.rm(path.join(familyDir(req.familyId), name), { force: true }, () => {});
  res.status(204).end();
});

export default router;
