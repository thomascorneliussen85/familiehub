import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const rewards = db
    .prepare(
      `SELECT r.*, m.name AS member_name
       FROM bonus_rewards r LEFT JOIN family_members m ON m.id = r.member_id
       WHERE r.active = 1
       ORDER BY r.member_id IS NULL, r.member_id, r.stars_required`
    )
    .all();
  res.json(rewards);
});

router.post('/', (req, res) => {
  const { member_id = null, stars_required, title, emoji = '🎁' } = req.body;
  if (!title || !stars_required) {
    return res.status(400).json({ error: 'Tittel og antall stjerner er påkrevd' });
  }
  const info = db
    .prepare('INSERT INTO bonus_rewards (member_id, stars_required, title, emoji) VALUES (?, ?, ?, ?)')
    .run(member_id, stars_required, title, emoji);
  req.app.get('io').emit('chores:update');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE bonus_rewards SET active = 0 WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('chores:update');
  res.status(204).end();
});

export default router;
