import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { fra, til } = req.query;
  const rows = fra && til
    ? db
        .prepare('SELECT * FROM kalender_hendelser WHERE butikk_id = ? AND start_at < ? AND slutt_at > ? ORDER BY start_at')
        .all(req.butikkId, til, fra)
    : db.prepare('SELECT * FROM kalender_hendelser WHERE butikk_id = ? ORDER BY start_at').all(req.butikkId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { tittel, startAt, sluttAt, allDay = false, notat } = req.body || {};
  if (!tittel?.trim() || !startAt || !sluttAt) {
    return res.status(400).json({ error: 'Tittel, start og slutt er påkrevd' });
  }
  const info = db
    .prepare('INSERT INTO kalender_hendelser (butikk_id, tittel, start_at, slutt_at, all_day, notat) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.butikkId, tittel.trim(), startAt, sluttAt, allDay ? 1 : 0, notat || null);
  const event = db.prepare('SELECT * FROM kalender_hendelser WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('kalender:update', { type: 'created', event });
  res.status(201).json(event);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM kalender_hendelser WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('kalender:update', { type: 'deleted', id: Number(req.params.id) });
  res.status(204).end();
});

export default router;
