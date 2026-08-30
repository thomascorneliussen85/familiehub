import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePin } from '../middleware/requirePin.js';

const router = Router();
router.use(requireAuth);

// GET /api/skift?fra=YYYY-MM-DD&til=YYYY-MM-DD
router.get('/', (req, res) => {
  const { fra, til } = req.query;
  const rows = fra && til
    ? db
        .prepare(
          `SELECT s.*, a.navn AS ansatt_navn, a.farge AS ansatt_farge FROM skift s
           JOIN ansatte a ON a.id = s.ansatt_id
           WHERE s.butikk_id = ? AND s.dato >= ? AND s.dato <= ? ORDER BY s.dato, s.start_tid`
        )
        .all(req.butikkId, fra, til)
    : db
        .prepare(
          `SELECT s.*, a.navn AS ansatt_navn, a.farge AS ansatt_farge FROM skift s
           JOIN ansatte a ON a.id = s.ansatt_id
           WHERE s.butikk_id = ? ORDER BY s.dato, s.start_tid`
        )
        .all(req.butikkId);
  res.json(rows);
});

router.post('/', requirePin, (req, res) => {
  const { ansattId, dato, startTid, sluttTid, type = 'normal', notat } = req.body || {};
  if (!ansattId || !dato || !startTid || !sluttTid) {
    return res.status(400).json({ error: 'Ansatt, dato og klokkeslett er påkrevd' });
  }
  const ansatt = db.prepare('SELECT id FROM ansatte WHERE id = ? AND butikk_id = ?').get(ansattId, req.butikkId);
  if (!ansatt) return res.status(404).json({ error: 'Fant ikke ansatt' });
  const info = db
    .prepare('INSERT INTO skift (butikk_id, ansatt_id, dato, start_tid, slutt_tid, type, notat) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.butikkId, ansattId, dato, startTid, sluttTid, type, notat || null);
  res.status(201).json(db.prepare('SELECT * FROM skift WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', requirePin, (req, res) => {
  const existing = db.prepare('SELECT * FROM skift WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!existing) return res.status(404).json({ error: 'Fant ikke skift' });
  const { ansattId, dato, startTid, sluttTid, type, notat } = req.body || {};
  const merged = {
    ansatt_id: ansattId ?? existing.ansatt_id,
    dato: dato ?? existing.dato,
    start_tid: startTid ?? existing.start_tid,
    slutt_tid: sluttTid ?? existing.slutt_tid,
    type: type ?? existing.type,
    notat: notat !== undefined ? notat : existing.notat,
  };
  db.prepare(
    `UPDATE skift SET ansatt_id = @ansatt_id, dato = @dato, start_tid = @start_tid, slutt_tid = @slutt_tid,
       type = @type, notat = @notat WHERE id = @id`
  ).run({ ...merged, id: req.params.id });
  res.json(db.prepare('SELECT * FROM skift WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('DELETE FROM skift WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  res.status(204).end();
});

export default router;
