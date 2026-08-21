import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import {
  testVacuumConnection,
  getVacuumStatus,
  startCleaning,
  stopCleaning,
  returnHome,
} from '../services/dreameVacuumService.js';

const router = Router();
router.use(requireAuth);

// Henter live status for hver koblet støvsuger på hvert kall (ikke
// bakgrunnspolling) – samme "spør når noen faktisk ser på siden"-mønster
// som smart-plugger. Én enhet som ikke svarer skal ikke velte de andre.
router.get('/', async (req, res) => {
  const devices = db.prepare('SELECT * FROM vacuum_devices WHERE family_id = ? ORDER BY id').all(req.familyId);
  const withStatus = await Promise.all(
    devices.map(async (d) => {
      try {
        const status = await getVacuumStatus(d.ip, d.token);
        return { id: d.id, label: d.label, ip: d.ip, online: true, ...status };
      } catch (err) {
        return { id: d.id, label: d.label, ip: d.ip, online: false, error: err.message };
      }
    })
  );
  res.json(withStatus);
});

router.post('/', requireFamilyPin, async (req, res) => {
  const { label, ip, token } = req.body || {};
  if (!label || !ip || !token) {
    return res.status(400).json({ error: 'Navn, IP-adresse og token er påkrevd' });
  }
  try {
    await testVacuumConnection(ip, token);
  } catch (err) {
    return res.status(400).json({ error: `Klarte ikke å koble til støvsugeren: ${err.message}` });
  }
  const info = db
    .prepare('INSERT INTO vacuum_devices (family_id, label, ip, token) VALUES (?, ?, ?, ?)')
    .run(req.familyId, label.trim(), ip.trim(), token.trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

function getOwnedDevice(req) {
  return db.prepare('SELECT * FROM vacuum_devices WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
}

router.post('/:id/start', async (req, res) => {
  const device = getOwnedDevice(req);
  if (!device) return res.status(404).json({ error: 'Fant ikke støvsugeren' });
  try {
    await startCleaning(device.ip, device.token);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  const device = getOwnedDevice(req);
  if (!device) return res.status(404).json({ error: 'Fant ikke støvsugeren' });
  try {
    await stopCleaning(device.ip, device.token);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/:id/home', async (req, res) => {
  const device = getOwnedDevice(req);
  if (!device) return res.status(404).json({ error: 'Fant ikke støvsugeren' });
  try {
    await returnHome(device.ip, device.token);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM vacuum_devices WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

export default router;
