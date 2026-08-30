import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePin } from '../middleware/requirePin.js';

const router = Router();
router.use(requireAuth);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Dagens oppgaver, med fullført-status for i dag – samme "periode"-idé som
// FamilieHub sine gjøremål, bare med kalenderdag som eneste periodetype
// (ingen ukentlig/når-som-helst-variant her, rutineoppgaver er daglige).
function listToday(butikkId) {
  const oppgaver = db
    .prepare('SELECT * FROM oppgaver WHERE butikk_id = ? AND aktiv = 1 ORDER BY sort_order, id')
    .all(butikkId);
  const today = todayStr();
  const doneStmt = db.prepare(
    `SELECT f.*, a.navn AS fullfort_av_navn FROM oppgave_fullforinger f
     LEFT JOIN ansatte a ON a.id = f.fullfort_av
     WHERE f.oppgave_id = ? AND f.dato = ?`
  );
  return oppgaver.map((o) => {
    const completion = doneStmt.get(o.id, today);
    return { ...o, fullfort: Boolean(completion), fullfort_av_navn: completion?.fullfort_av_navn || null };
  });
}

router.get('/', (req, res) => {
  res.json(listToday(req.butikkId));
});

router.post('/', requirePin, (req, res) => {
  const { tittel, skiftType = 'alle' } = req.body || {};
  if (!tittel?.trim()) return res.status(400).json({ error: 'Tittel er påkrevd' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM oppgaver WHERE butikk_id = ?').get(req.butikkId).m;
  const info = db
    .prepare('INSERT INTO oppgaver (butikk_id, tittel, skift_type, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.butikkId, tittel.trim(), skiftType, maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('UPDATE oppgaver SET aktiv = 0 WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  res.status(204).end();
});

// Kryss av/fjern avkrysning for i dag – ingen PIN, alle 10 ansatte skal
// kunne gjøre dette uten friksjon. ansattId er valgfri (hvem som utførte den).
router.post('/:id/toggle', (req, res) => {
  const oppgave = db.prepare('SELECT * FROM oppgaver WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!oppgave) return res.status(404).json({ error: 'Fant ikke oppgave' });
  const { ansattId } = req.body || {};
  const today = todayStr();
  const existing = db
    .prepare('SELECT * FROM oppgave_fullforinger WHERE oppgave_id = ? AND dato = ?')
    .get(oppgave.id, today);
  if (existing) {
    db.prepare('DELETE FROM oppgave_fullforinger WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO oppgave_fullforinger (oppgave_id, dato, fullfort_av) VALUES (?, ?, ?)').run(
      oppgave.id,
      today,
      ansattId || null
    );
  }
  const io = req.app.get('io');
  io.to(`butikk:${req.butikkId}`).emit('oppgaver:update', listToday(req.butikkId));
  res.json({ fullfort: !existing });
});

export default router;
