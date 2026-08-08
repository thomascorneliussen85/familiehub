import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { syncGarminActivities } from '../services/garminService.js';
import {
  analyzeActivity,
  getCoachNote,
  generateTrainingPlan,
  getLatestTrainingPlan,
} from '../services/trainingCoachService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getOwnerFamilyId } from '../services/ownerFamily.js';

const router = Router();
// Garmin er foreløpig én delt konto for hele installasjonen (satt opp av
// installasjonens eier via .env), ikke per-familie – se README. garmin_activities
// har derfor ingen family_id i det hele tatt; for å unngå at treningsdataen
// lekker til andre familier på samme installasjon er hele modulen reservert
// hovedfamilien (den første som ble opprettet) helt til per-familie
// kreditiv-lagring er bygget.
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.familyId !== getOwnerFamilyId()) {
    return res.status(403).json({ error: 'Garmin er foreløpig kun tilgjengelig for hovedfamilien på denne installasjonen' });
  }
  next();
});

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
    .prepare('SELECT * FROM garmin_activities WHERE garmin_activity_id = ?')
    .get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Treningsøkt ikke funnet' });
  res.json({ ...activity, raw: activity.raw_json ? JSON.parse(activity.raw_json) : null });
});

router.get('/activities/:id/coach', (req, res) => {
  res.json(getCoachNote(Number(req.params.id)) || null);
});

router.post('/activities/:id/coach', async (req, res) => {
  try {
    const note = await analyzeActivity(Number(req.params.id));
    res.json(note);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage treningskommentar', detail: err.message });
  }
});

router.get('/plan', (req, res) => {
  res.json(getLatestTrainingPlan() || null);
});

router.post('/plan', async (req, res) => {
  try {
    const plan = await generateTrainingPlan();
    res.json(plan);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage treningsplan', detail: err.message });
  }
});

export default router;
