import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { author = null, text, color = '#fff59d', pos_x = 40, pos_y = 40, rotation = 0 } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Tekst er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO messages (author, text, color, pos_x, pos_y, rotation) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(author, text.trim(), color, pos_x, pos_y, rotation);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').emit('messages:update', { type: 'created', message });
  res.status(201).json(message);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lapp ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    'UPDATE messages SET text = ?, color = ?, pos_x = ?, pos_y = ?, rotation = ? WHERE id = ?'
  ).run(merged.text, merged.color, merged.pos_x, merged.pos_y, merged.rotation, req.params.id);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  req.app.get('io').emit('messages:update', { type: 'updated', message });
  res.json(message);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('messages:update', { type: 'deleted', id: Number(req.params.id) });
  res.status(204).end();
});

export default router;
