import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

function list(butikkId) {
  return db.prepare('SELECT * FROM beskjeder WHERE butikk_id = ? ORDER BY created_at DESC LIMIT 50').all(butikkId);
}

router.get('/', (req, res) => {
  res.json(list(req.butikkId));
});

router.post('/', (req, res) => {
  const { forfatter, tekst } = req.body || {};
  if (!tekst?.trim()) return res.status(400).json({ error: 'Tekst er påkrevd' });
  db.prepare('INSERT INTO beskjeder (butikk_id, forfatter, tekst) VALUES (?, ?, ?)').run(
    req.butikkId,
    forfatter || null,
    tekst.trim()
  );
  const rows = list(req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('beskjeder:update', rows);
  res.status(201).json(rows);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM beskjeder WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  const rows = list(req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('beskjeder:update', rows);
  res.status(204).end();
});

export default router;
