import { Router } from 'express';
import { db } from '../db/index.js';
import { setPlugRelay } from '../services/shellyPoller.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM smart_plugs ORDER BY id').all());
});

router.post('/', (req, res) => {
  const { name, ip } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'Navn og IP er påkrevd' });
  const info = db.prepare('INSERT INTO smart_plugs (name, ip) VALUES (?, ?)').run(name, ip);
  const plug = db.prepare('SELECT * FROM smart_plugs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(plug);
});

router.post('/:id/toggle', async (req, res) => {
  const plug = db.prepare('SELECT * FROM smart_plugs WHERE id = ?').get(req.params.id);
  if (!plug) return res.status(404).json({ error: 'Plugg ikke funnet' });
  const turnOn = req.body.on ?? !plug.is_on;
  try {
    await setPlugRelay(plug.ip, turnOn);
    db.prepare('UPDATE smart_plugs SET is_on = ?, online = 1, last_seen_at = datetime(\'now\') WHERE id = ?').run(
      turnOn ? 1 : 0,
      plug.id
    );
  } catch (err) {
    db.prepare('UPDATE smart_plugs SET online = 0 WHERE id = ?').run(plug.id);
    return res.status(502).json({ error: `Fikk ikke kontakt med ${plug.name} på ${plug.ip}` });
  }
  const updated = db.prepare('SELECT * FROM smart_plugs WHERE id = ?').get(plug.id);
  req.app.get('io').emit('plugs:update', db.prepare('SELECT * FROM smart_plugs ORDER BY id').all());
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM smart_plugs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
