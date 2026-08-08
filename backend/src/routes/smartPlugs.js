import { Router } from 'express';
import { db } from '../db/index.js';
import { setPlugRelay } from '../services/shellyPoller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM smart_plugs WHERE family_id = ? ORDER BY id').all(req.familyId));
});

router.post('/', requireFamilyPin, (req, res) => {
  const { name, ip } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'Navn og IP er påkrevd' });
  const info = db.prepare('INSERT INTO smart_plugs (family_id, name, ip) VALUES (?, ?, ?)').run(req.familyId, name, ip);
  const plug = db.prepare('SELECT * FROM smart_plugs WHERE id = ? AND family_id = ?').get(info.lastInsertRowid, req.familyId);
  res.status(201).json(plug);
});

router.post('/:id/toggle', async (req, res) => {
  const plug = db.prepare('SELECT * FROM smart_plugs WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
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
  req.app.get('io').to(`family:${req.familyId}`).emit('plugs:update', db.prepare('SELECT * FROM smart_plugs WHERE family_id = ? ORDER BY id').all(req.familyId));
  res.json(updated);
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM smart_plugs WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

export default router;
