import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

router.get('/', (req, res) => {
  const members = db
    .prepare('SELECT * FROM family_members ORDER BY sort_order, id')
    .all();
  res.json(members);
});

router.post('/', requirePin, (req, res) => {
  const { name, role = 'voksen', color = '#7c9cff', avatar = null, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO family_members (name, role, color, avatar, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, role, color, avatar, sort_order);
  const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(member);
});

router.patch('/:id', requirePin, (req, res) => {
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    'UPDATE family_members SET name = ?, role = ?, color = ?, avatar = ?, sort_order = ? WHERE id = ?'
  ).run(merged.name, merged.role, merged.color, merged.avatar, merged.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('DELETE FROM family_members WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
