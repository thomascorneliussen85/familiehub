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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function familyPhotosDir(familyId) {
  return path.join(config.familyPhotosDir, String(familyId));
}

function savePhoto(familyId, file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new Error('Ugyldig filtype');
  const dir = familyPhotosDir(familyId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `member-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return filename;
}

function memberWithPhotoUrl(familyId, member) {
  return { ...member, photo_url: member.photo ? `/family-photos/${familyId}/${encodeURIComponent(member.photo)}` : null };
}

router.get('/', (req, res) => {
  const members = db
    .prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY sort_order, id')
    .all(req.familyId);
  res.json(members.map((m) => memberWithPhotoUrl(req.familyId, m)));
});

router.post('/', requireFamilyPin, upload.single('photo'), (req, res) => {
  const { name, role = 'voksen', color = '#7c9cff', avatar = null, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });
  let photo = null;
  try {
    if (req.file) photo = savePhoto(req.familyId, req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const info = db
    .prepare(
      'INSERT INTO family_members (family_id, name, role, color, avatar, photo, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.familyId, name, role, color, avatar, photo, sort_order);
  const member = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(info.lastInsertRowid, req.familyId);
  res.status(201).json(memberWithPhotoUrl(req.familyId, member));
});

router.patch('/:id', requireFamilyPin, upload.single('photo'), (req, res) => {
  const existing = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });

  let photo = existing.photo;
  if (req.file) {
    try {
      photo = savePhoto(req.familyId, req.file);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (existing.photo) {
      fs.rm(path.join(familyPhotosDir(req.familyId), existing.photo), { force: true }, () => {});
    }
  }

  const merged = { ...existing, ...req.body, photo };
  db.prepare(
    'UPDATE family_members SET name = ?, role = ?, color = ?, avatar = ?, photo = ?, sort_order = ? WHERE id = ? AND family_id = ?'
  ).run(merged.name, merged.role, merged.color, merged.avatar, merged.photo, merged.sort_order, req.params.id, req.familyId);
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  res.json(memberWithPhotoUrl(req.familyId, member));
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  db.prepare('DELETE FROM family_members WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  if (existing?.photo) {
    fs.rm(path.join(familyPhotosDir(req.familyId), existing.photo), { force: true }, () => {});
  }
  res.status(204).end();
});

export default router;
