import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getStravaAuthUrl, exchangeStravaCode, syncStravaActivities } from '../services/stravaService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

function getConnection(familyId) {
  return db.prepare('SELECT * FROM strava_connections WHERE family_id = ?').get(familyId);
}

function listActivities(familyId) {
  return db.prepare('SELECT * FROM strava_activities WHERE family_id = ? ORDER BY start_time DESC LIMIT 50').all(familyId);
}

router.get('/auth-url', requireFamilyPin, (req, res) => {
  if (!config.strava.clientId || !config.strava.clientSecret || !config.strava.redirectUri) {
    return res.status(400).json({ error: 'Strava er ikke konfigurert i .env ennå' });
  }
  res.json({ url: getStravaAuthUrl() });
});

// Strava redirigerer hit direkte i nettleseren – økt-cookien følger med som
// vanlig siden det er samme nettleser/origin, så req.familyId er tilgjengelig.
// Tilgangen er i tillegg beskyttet av at auth-url-steget over krever PIN.
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const redirectBase = config.corsOrigin[0] || '/';
  if (error || !code) {
    return res.redirect(`${redirectBase}?strava_connect=error`);
  }
  try {
    const tokens = await exchangeStravaCode(code);
    db.prepare(
      `INSERT INTO strava_connections (family_id, athlete_id, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET
         athlete_id = excluded.athlete_id, access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`
    ).run(req.familyId, tokens.athlete?.id ?? null, tokens.access_token, tokens.refresh_token, tokens.expires_at);
    res.redirect(`${redirectBase}?strava_connect=ok`);
  } catch (err) {
    console.error('Strava-tilkobling feilet:', err.message);
    res.redirect(`${redirectBase}?strava_connect=error`);
  }
});

router.get('/status', (req, res) => {
  const connection = getConnection(req.familyId);
  res.json({ configured: Boolean(connection), lastSyncAt: connection?.last_synced_at || null });
});

router.delete('/connect', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM strava_connections WHERE family_id = ?').run(req.familyId);
  res.status(204).end();
});

router.get('/activities', (req, res) => {
  res.json(listActivities(req.familyId));
});

router.get('/activities/:id', (req, res) => {
  const activity = db
    .prepare('SELECT * FROM strava_activities WHERE strava_activity_id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!activity) return res.status(404).json({ error: 'Treningsøkt ikke funnet' });
  res.json({ ...activity, raw: activity.raw_json ? JSON.parse(activity.raw_json) : null });
});

router.post('/sync', async (req, res) => {
  const connection = getConnection(req.familyId);
  if (!connection) {
    return res.status(400).json({ error: 'Ingen Strava-konto koblet til ennå – gå til ⚙️ → Enheter' });
  }
  try {
    const count = await syncStravaActivities(connection, 30);
    db.prepare(`UPDATE strava_connections SET last_synced_at = datetime('now') WHERE family_id = ?`).run(req.familyId);
    const activities = listActivities(req.familyId);
    req.app.get('io').to(`family:${req.familyId}`).emit('strava:update', activities);
    res.json({ synced: count, activities });
  } catch (err) {
    console.error('Strava-synk feilet:', err.message);
    res.status(502).json({ error: `Klarte ikke å synkronisere med Strava: ${err.message}` });
  }
});

export default router;
