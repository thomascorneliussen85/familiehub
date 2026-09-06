import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function sheetsDir(familyId) {
  return path.join(config.coloringSheetsDir, String(familyId));
}

function photosDir(familyId) {
  return path.join(config.photos.dir, String(familyId));
}

// Familiens egne opplastede fargeleggingsark, i tillegg til det faste settet
// som ligger statisk i frontend/public/coloring-sheets.
router.get('/', (req, res) => {
  const dir = sheetsDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });
  const files = fs
    .readdirSync(dir)
    .filter((f) => EXTENSIONS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .sort();
  res.json(files.map((name) => ({ name, url: `/coloring-sheets/${req.familyId}/${encodeURIComponent(name)}` })));
});

// Å legge inn NYE ark er en voksen-handling (kurering av hva barna får velge
// mellom) – krever foreldre-PIN, samme vern som bilde-opplasting i photos.js.
router.post('/', requireFamilyPin, upload.array('sheets', 20), (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Ingen filer mottatt' });
  }

  const dir = sheetsDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const filename = `sheet-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    saved.push({ name: filename, url: `/coloring-sheets/${req.familyId}/${encodeURIComponent(filename)}` });
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
  fs.rm(path.join(sheetsDir(req.familyId), name), { force: true }, () => {});
  res.status(204).end();
});

// Ferdig fargelagt tegning – dette ER selve barne-aktiviteten og skal derfor
// IKKE kreve PIN (i motsetning til å legge inn nye ark over). Lagres rett inn
// i familiens vanlige bilde-mappe, slik at den automatisk dukker opp i
// fotorammen sammen med familiebildene – ingen egen "tegninger"-tabell trengs.
router.post('/finished', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen fil mottatt' });
  }
  const dir = photosDir(req.familyId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `coloring-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  res.status(201).json({ name: filename, url: `/photos/${req.familyId}/${encodeURIComponent(filename)}` });
});

export default router;
