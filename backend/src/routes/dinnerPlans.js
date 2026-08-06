import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db
      .prepare('SELECT * FROM dinner_plans WHERE date >= ? AND date <= ? ORDER BY date')
      .all(from, to);
  } else {
    rows = db.prepare('SELECT * FROM dinner_plans ORDER BY date').all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { date, title, emoji, notes } = req.body || {};
  if (!date || !title) {
    return res.status(400).json({ error: 'Dato og tittel er påkrevd' });
  }
  db.prepare(
    `INSERT INTO dinner_plans (date, title, emoji, notes) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET title = excluded.title, emoji = excluded.emoji, notes = excluded.notes`
  ).run(date, title, emoji || null, notes || null);

  const plan = db.prepare('SELECT * FROM dinner_plans WHERE date = ?').get(date);
  req.app.get('io').emit('dinner-plans:update', plan);
  res.status(201).json(plan);
});

router.delete('/:date', (req, res) => {
  db.prepare('DELETE FROM dinner_plans WHERE date = ?').run(req.params.date);
  req.app.get('io').emit('dinner-plans:update', { date: req.params.date, deleted: true });
  res.status(204).end();
});

export default router;
