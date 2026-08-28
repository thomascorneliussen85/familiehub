import { Router } from 'express';
import { db } from '../db/index.js';
import { syncGarminActivities, testGarminConnection } from '../services/garminService.js';
import {
  analyzeActivity,
  getCoachNote,
  generateTrainingPlan,
  getLatestTrainingPlan,
} from '../services/trainingCoachService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

function getConnection(familyId) {
  return db.prepare('SELECT * FROM garmin_connections WHERE family_id = ?').get(familyId);
}

function listActivities(familyId) {
  return db.prepare('SELECT * FROM garmin_activities WHERE family_id = ? ORDER BY start_time DESC LIMIT 50').all(familyId);
}

router.get('/status', (req, res) => {
  const connection = getConnection(req.familyId);
  res.json({
    configured: Boolean(connection),
    lastSyncAt: connection?.last_synced_at || null,
  });
});

router.post('/connect', requireFamilyPin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
  }
  try {
    await testGarminConnection(username.trim(), password);
  } catch (err) {
    return res.status(400).json({ error: `Klarte ikke å logge inn på Garmin Connect: ${err.message}` });
  }
  db.prepare(
    `INSERT INTO garmin_connections (family_id, username, password) VALUES (?, ?, ?)
     ON CONFLICT(family_id) DO UPDATE SET username = excluded.username, password = excluded.password`
  ).run(req.familyId, username.trim(), password);
  res.status(201).json({ ok: true });
});

router.delete('/connect', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM garmin_connections WHERE family_id = ?').run(req.familyId);
  res.status(204).end();
});

router.get('/activities', (req, res) => {
  res.json(listActivities(req.familyId));
});

router.post('/sync', async (req, res) => {
  const connection = getConnection(req.familyId);
  if (!connection) {
    return res.status(400).json({ error: 'Ingen Garmin-konto koblet til ennå – gå til ⚙️ → Enheter' });
  }
  try {
    const count = await syncGarminActivities(req.familyId, connection.username, connection.password, 20);
    db.prepare(`UPDATE garmin_connections SET last_synced_at = datetime('now') WHERE family_id = ?`).run(req.familyId);
    const activities = listActivities(req.familyId);
    req.app.get('io').to(`family:${req.familyId}`).emit('garmin:update', activities);
    res.json({ synced: count, activities });
  } catch (err) {
    console.error('Garmin-synk feilet:', err.message);
    res.status(502).json({ error: `Klarte ikke å synkronisere med Garmin Connect: ${err.message}` });
  }
});

// GET /api/garmin/activities/:id – full detalj for én økt (id = garmin_activity_id)
router.get('/activities/:id', (req, res) => {
  const activity = db
    .prepare('SELECT * FROM garmin_activities WHERE garmin_activity_id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!activity) return res.status(404).json({ error: 'Treningsøkt ikke funnet' });
  res.json({ ...activity, raw: activity.raw_json ? JSON.parse(activity.raw_json) : null });
});

router.get('/activities/:id/coach', (req, res) => {
  res.json(getCoachNote(Number(req.params.id), req.familyId) || null);
});

router.post('/activities/:id/coach', async (req, res) => {
  try {
    const note = await analyzeActivity(Number(req.params.id), req.familyId);
    res.json(note);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage treningskommentar', detail: err.message });
  }
});

router.get('/plan', (req, res) => {
  res.json(getLatestTrainingPlan(req.familyId) || null);
});

router.post('/plan', async (req, res) => {
  try {
    const plan = await generateTrainingPlan(req.familyId);
    res.json(plan);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage treningsplan', detail: err.message });
  }
});

export default router;
