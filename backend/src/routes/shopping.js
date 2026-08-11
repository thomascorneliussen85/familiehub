import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { scheduleMatchingRun } from '../services/smartShoppingService.js';

const router = Router();
router.use(requireAuth);

function listItems(familyId) {
  // Uavkryssede varer først (etter posisjon), avkryssede nederst (etter tidspunkt krysset av)
  return db
    .prepare(
      `SELECT * FROM shopping_items
       WHERE family_id = ?
       ORDER BY checked ASC, CASE WHEN checked = 1 THEN checked_at END ASC, position ASC, id ASC`
    )
    .all(familyId);
}

function broadcast(req) {
  req.app.get('io').to(`family:${req.familyId}`).emit('shopping:update', listItems(req.familyId));
}

router.get('/', (req, res) => {
  res.json(listItems(req.familyId));
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Varenavn er påkrevd' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM shopping_items WHERE family_id = ?').get(req.familyId).m;
  db.prepare('INSERT INTO shopping_items (family_id, name, position) VALUES (?, ?, ?)').run(
    req.familyId,
    name.trim(),
    maxPos + 1
  );
  broadcast(req);
  scheduleMatchingRun(req.familyId, req.app.get('io'));
  res.status(201).json(listItems(req.familyId));
});

router.patch('/:id/toggle', (req, res) => {
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!item) return res.status(404).json({ error: 'Vare ikke funnet' });
  const checked = item.checked ? 0 : 1;
  db.prepare('UPDATE shopping_items SET checked = ?, checked_at = ? WHERE id = ?').run(
    checked,
    checked ? new Date().toISOString() : null,
    item.id
  );
  broadcast(req);
  if (!checked) scheduleMatchingRun(req.familyId, req.app.get('io'));
  res.json(listItems(req.familyId));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  broadcast(req);
  res.status(204).end();
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE checked = 1 AND family_id = ?').run(req.familyId);
  broadcast(req);
  res.status(204).end();
});

router.get('/quick-items', (req, res) => {
  res.json(db.prepare('SELECT * FROM quick_items WHERE family_id = ? ORDER BY id').all(req.familyId));
});

export default router;
