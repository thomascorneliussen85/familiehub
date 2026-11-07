import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

router.get('/', (req, res) => {
  const members = db
    .prepare('SELECT * FROM family_members ORDER BY sort_order, id')
    .all();
  res.json(members);
});

router.post('/', (req, res) => {
  const { name, role = 'voksen', color = '#7c9cff', avatar = null, photo_url = null, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO family_members (name, role, color, avatar, photo_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(name, role, color, avatar, photo_url, sort_order);
  const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').emit('family-members:update');
  res.status(201).json(member);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    'UPDATE family_members SET name = ?, role = ?, color = ?, avatar = ?, photo_url = ?, sort_order = ? WHERE id = ?'
  ).run(merged.name, merged.role, merged.color, merged.avatar, merged.photo_url, merged.sort_order, req.params.id);
  req.app.get('io').emit('family-members:update');
  res.json(db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id));
});

// Laster opp/erstatter bildet som vises på barnas oppgaveside (data-URL fra <input type="file">)
router.post('/:id/photo', (req, res) => {
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });

  const { imageDataUrl } = req.body;
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(imageDataUrl || '');
  const extension = match && MIME_EXTENSIONS[match[1].toLowerCase()];
  if (!match || !extension) {
    return res.status(400).json({ error: 'Ugyldig bildeformat (bruk jpg, png, webp eller gif)' });
  }

  fs.mkdirSync(config.avatars.dir, { recursive: true });
  const filename = `member-${existing.id}${extension}`;
  fs.writeFileSync(path.join(config.avatars.dir, filename), Buffer.from(match[2], 'base64'));

  const photoUrl = `/avatars/${filename}?v=${Date.now()}`;
  db.prepare('UPDATE family_members SET photo_url = ? WHERE id = ?').run(photoUrl, existing.id);
  const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(existing.id);
  req.app.get('io').emit('family-members:update');
  res.json(member);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM family_members WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('family-members:update');
  res.status(204).end();
});

export default router;
