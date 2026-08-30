import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

const NEXT_STATUS = { meldt: 'bestilt', bestilt: 'mottatt' };
const TIMESTAMP_COLUMN = { bestilt: 'bestilt_at', mottatt: 'mottatt_at' };

function list(butikkId) {
  return db
    .prepare(
      `SELECT b.*, a.navn AS meldt_av_navn FROM bestillinger b
       LEFT JOIN ansatte a ON a.id = b.meldt_av
       WHERE b.butikk_id = ? AND b.status != 'mottatt' ORDER BY b.meldt_at DESC`
    )
    .all(butikkId);
}

router.get('/', (req, res) => {
  res.json(list(req.butikkId));
});

// Ingen PIN – alle skal raskt kunne melde fra om at noe er tomt.
router.post('/', (req, res) => {
  const { vare, notat, ansattId } = req.body || {};
  if (!vare?.trim()) return res.status(400).json({ error: 'Varenavn er påkrevd' });
  db.prepare('INSERT INTO bestillinger (butikk_id, vare, notat, meldt_av) VALUES (?, ?, ?, ?)').run(
    req.butikkId,
    vare.trim(),
    notat || null,
    ansattId || null
  );
  const rows = list(req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('bestillinger:update', rows);
  res.status(201).json(rows);
});

// Flytt til neste status i arbeidsflyten: meldt -> bestilt -> mottatt.
router.post('/:id/neste-status', (req, res) => {
  const row = db.prepare('SELECT * FROM bestillinger WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!row) return res.status(404).json({ error: 'Fant ikke bestilling' });
  const next = NEXT_STATUS[row.status];
  if (!next) return res.status(400).json({ error: 'Allerede mottatt' });
  const timestampCol = TIMESTAMP_COLUMN[next];
  db.prepare(`UPDATE bestillinger SET status = ?, ${timestampCol} = datetime('now') WHERE id = ?`).run(next, row.id);
  const rows = list(req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('bestillinger:update', rows);
  res.json(rows);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bestillinger WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  const rows = list(req.butikkId);
  req.app.get('io').to(`butikk:${req.butikkId}`).emit('bestillinger:update', rows);
  res.status(204).end();
});

export default router;
