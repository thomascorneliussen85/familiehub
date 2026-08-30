import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePin } from '../middleware/requirePin.js';

const router = Router();
router.use(requireAuth);

function parseRow(a) {
  return { ...a, sertifiseringer: JSON.parse(a.sertifiseringer || '[]') };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM ansatte WHERE butikk_id = ? AND aktiv = 1 ORDER BY navn')
    .all(req.butikkId);
  res.json(rows.map(parseRow));
});

router.post('/', requirePin, (req, res) => {
  const { navn, rolle = 'medarbeider', telefon, sertifiseringer = [], farge = '#7c9cff' } = req.body || {};
  if (!navn?.trim()) return res.status(400).json({ error: 'Navn er påkrevd' });
  const info = db
    .prepare('INSERT INTO ansatte (butikk_id, navn, rolle, telefon, sertifiseringer, farge) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.butikkId, navn.trim(), rolle, telefon || null, JSON.stringify(sertifiseringer), farge);
  res.status(201).json(parseRow(db.prepare('SELECT * FROM ansatte WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', requirePin, (req, res) => {
  const existing = db.prepare('SELECT * FROM ansatte WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!existing) return res.status(404).json({ error: 'Fant ikke ansatt' });
  const { navn, rolle, telefon, sertifiseringer, farge, aktiv } = req.body || {};
  const merged = {
    navn: navn !== undefined ? navn.trim() : existing.navn,
    rolle: rolle !== undefined ? rolle : existing.rolle,
    telefon: telefon !== undefined ? telefon : existing.telefon,
    sertifiseringer: sertifiseringer !== undefined ? JSON.stringify(sertifiseringer) : existing.sertifiseringer,
    farge: farge !== undefined ? farge : existing.farge,
    aktiv: aktiv !== undefined ? (aktiv ? 1 : 0) : existing.aktiv,
  };
  db.prepare(
    `UPDATE ansatte SET navn = @navn, rolle = @rolle, telefon = @telefon, sertifiseringer = @sertifiseringer,
       farge = @farge, aktiv = @aktiv WHERE id = @id`
  ).run({ ...merged, id: req.params.id });
  res.json(parseRow(db.prepare('SELECT * FROM ansatte WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', requirePin, (req, res) => {
  const existing = db.prepare('SELECT * FROM ansatte WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!existing) return res.status(404).json({ error: 'Fant ikke ansatt' });
  db.prepare('UPDATE ansatte SET aktiv = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
