import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { syncGarminActivities } from '../services/garminService.js';

const router = Router();

function listActivities() {
  return db.prepare('SELECT * FROM garmin_activities ORDER BY start_time DESC LIMIT 50').all();
}

router.get('/status', (req, res) => {
  const row = db.prepare('SELECT MAX(synced_at) AS lastSyncAt FROM garmin_activities').get();
  res.json({
    configured: Boolean(config.garmin.username && config.garmin.password),
    lastSyncAt: row?.lastSyncAt || null,
  });
});

router.get('/activities', (req, res) => {
  res.json(listActivities());
});

router.post('/sync', async (req, res) => {
  if (!config.garmin.username || !config.garmin.password) {
    return res.status(400).json({ error: 'Garmin-brukernavn/passord er ikke satt i .env' });
  }
  try {
    const count = await syncGarminActivities(20);
    const activities = listActivities();
    req.app.get('io').emit('garmin:update', activities);
    res.json({ synced: count, activities });
  } catch (err) {
    console.error('Garmin-synk feilet:', err.message);
    res.status(502).json({ error: `Klarte ikke å synkronisere med Garmin Connect: ${err.message}` });
  }
});

export default router;
