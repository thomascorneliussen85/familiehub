import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getSetting, setSetting } from '../services/settingsStore.js';

const router = Router();

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

router.use(requirePin);

router.post('/locations', (req, res) => {
  const { label, emoji } = req.body || {};
  if (!label) return res.status(400).json({ error: 'Navn er påkrevd' });
  const { n: count } = db.prepare('SELECT COUNT(*) AS n FROM play_locations').get();
  const info = db
    .prepare('INSERT INTO play_locations (label, emoji, sort_order) VALUES (?, ?, ?)')
    .run(label, emoji || '📍', count + 1);
  res.status(201).json(db.prepare('SELECT * FROM play_locations WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/locations/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM play_locations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Fant ikke stedet' });
  const merged = { ...existing, ...req.body };
  db.prepare('UPDATE play_locations SET label = ?, emoji = ?, sort_order = ? WHERE id = ?').run(
    merged.label,
    merged.emoji,
    merged.sort_order,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM play_locations WHERE id = ?').get(req.params.id));
});

router.delete('/locations/:id', (req, res) => {
  db.prepare('DELETE FROM play_locations WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/expiry-hours', (req, res) => {
  const stored = getSetting('play_status_expiry_hours');
  const hours = Number.isFinite(Number(stored)) && Number(stored) > 0 ? Number(stored) : config.playStatus.expiryHours;
  res.json({ hours });
});

router.patch('/expiry-hours', (req, res) => {
  const { hours } = req.body || {};
  const parsed = Number(hours);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ error: 'Ugyldig antall timer' });
  }
  setSetting('play_status_expiry_hours', String(parsed));
  res.json({ hours: parsed });
});

export default router;
