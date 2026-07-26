import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

function listItems() {
  // Uavkryssede varer først (etter posisjon), avkryssede nederst (etter tidspunkt krysset av)
  return db
    .prepare(
      `SELECT * FROM shopping_items
       ORDER BY checked ASC, CASE WHEN checked = 1 THEN checked_at END ASC, position ASC, id ASC`
    )
    .all();
}

function broadcast(req) {
  req.app.get('io').emit('shopping:update', listItems());
}

router.get('/', (req, res) => {
  res.json(listItems());
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Varenavn er påkrevd' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM shopping_items').get().m;
  db.prepare('INSERT INTO shopping_items (name, position) VALUES (?, ?)').run(
    name.trim(),
    maxPos + 1
  );
  broadcast(req);
  res.status(201).json(listItems());
});

router.patch('/:id/toggle', (req, res) => {
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Vare ikke funnet' });
  const checked = item.checked ? 0 : 1;
  db.prepare('UPDATE shopping_items SET checked = ?, checked_at = ? WHERE id = ?').run(
    checked,
    checked ? new Date().toISOString() : null,
    item.id
  );
  broadcast(req);
  res.json(listItems());
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(req.params.id);
  broadcast(req);
  res.status(204).end();
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE checked = 1').run();
  broadcast(req);
  res.status(204).end();
});

router.get('/quick-items', (req, res) => {
  res.json(db.prepare('SELECT * FROM quick_items ORDER BY id').all());
});

export default router;
