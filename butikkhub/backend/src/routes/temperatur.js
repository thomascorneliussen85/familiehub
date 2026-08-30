import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePin } from '../middleware/requirePin.js';

const router = Router();
router.use(requireAuth);

// Enheter (fryser/kjøl), med siste måling – hovedvisningen for dagens
// lovpålagte kontroll: er alt innenfor grenseverdiene akkurat nå?
router.get('/enheter', (req, res) => {
  const enheter = db
    .prepare('SELECT * FROM temperaturenheter WHERE butikk_id = ? AND aktiv = 1 ORDER BY sort_order, id')
    .all(req.butikkId);
  const lastStmt = db.prepare(
    `SELECT m.*, a.navn AS malt_av_navn FROM temperaturmalinger m
     LEFT JOIN ansatte a ON a.id = m.malt_av
     WHERE m.enhet_id = ? ORDER BY m.malt_at DESC LIMIT 1`
  );
  res.json(enheter.map((e) => ({ ...e, sisteMaling: lastStmt.get(e.id) || null })));
});

router.post('/enheter', requirePin, (req, res) => {
  const { navn, minTemp, maxTemp } = req.body || {};
  if (!navn?.trim() || minTemp == null || maxTemp == null) {
    return res.status(400).json({ error: 'Navn, min- og maks-temperatur er påkrevd' });
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM temperaturenheter WHERE butikk_id = ?').get(req.butikkId).m;
  const info = db
    .prepare('INSERT INTO temperaturenheter (butikk_id, navn, min_temp, max_temp, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(req.butikkId, navn.trim(), Number(minTemp), Number(maxTemp), maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM temperaturenheter WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/enheter/:id', requirePin, (req, res) => {
  db.prepare('UPDATE temperaturenheter SET aktiv = 0 WHERE id = ? AND butikk_id = ?').run(req.params.id, req.butikkId);
  res.status(204).end();
});

// Logg en måling – ingen PIN, dette er en daglig rutineoppgave alle skal
// kunne gjøre raskt. avvik regnes automatisk ut mot enhetens grenseverdier.
router.post('/enheter/:id/mal', (req, res) => {
  const enhet = db.prepare('SELECT * FROM temperaturenheter WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!enhet) return res.status(404).json({ error: 'Fant ikke enhet' });
  const { temperatur, ansattId } = req.body || {};
  if (temperatur == null || Number.isNaN(Number(temperatur))) {
    return res.status(400).json({ error: 'Temperatur er påkrevd' });
  }
  const temp = Number(temperatur);
  const avvik = temp < enhet.min_temp || temp > enhet.max_temp;
  db.prepare('INSERT INTO temperaturmalinger (enhet_id, temperatur, malt_av, avvik) VALUES (?, ?, ?, ?)').run(
    enhet.id,
    temp,
    ansattId || null,
    avvik ? 1 : 0
  );
  const io = req.app.get('io');
  const enheter = db
    .prepare('SELECT * FROM temperaturenheter WHERE butikk_id = ? AND aktiv = 1 ORDER BY sort_order, id')
    .all(req.butikkId);
  io.to(`butikk:${req.butikkId}`).emit('temperatur:update', enheter);
  res.status(201).json({ avvik });
});

// Historikk for én enhet (siste 30 målinger) – til en enkel graf/liste.
router.get('/enheter/:id/historikk', (req, res) => {
  const enhet = db.prepare('SELECT id FROM temperaturenheter WHERE id = ? AND butikk_id = ?').get(req.params.id, req.butikkId);
  if (!enhet) return res.status(404).json({ error: 'Fant ikke enhet' });
  const rows = db
    .prepare('SELECT * FROM temperaturmalinger WHERE enhet_id = ? ORDER BY malt_at DESC LIMIT 30')
    .all(req.params.id);
  res.json(rows.reverse());
});

export default router;
