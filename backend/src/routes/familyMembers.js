import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const members = db
    .prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY sort_order, id')
    .all(req.familyId);
  res.json(members);
});

router.post('/', requireFamilyPin, (req, res) => {
  const { name, role = 'voksen', color = '#7c9cff', avatar = null, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO family_members (family_id, name, role, color, avatar, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.familyId, name, role, color, avatar, sort_order);
  const member = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(info.lastInsertRowid, req.familyId);
  res.status(201).json(member);
});

router.patch('/:id', requireFamilyPin, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    'UPDATE family_members SET name = ?, role = ?, color = ?, avatar = ?, sort_order = ? WHERE id = ? AND family_id = ?'
  ).run(merged.name, merged.role, merged.color, merged.avatar, merged.sort_order, req.params.id, req.familyId);
  res.json(db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId));
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM family_members WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

export default router;
