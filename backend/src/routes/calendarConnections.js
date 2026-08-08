import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getAuthUrl, handleGoogleCallback, syncGoogleConnection } from '../services/googleCalendarSync.js';
import { testICloudConnection, syncICloudConnection } from '../services/icloudCalendarSync.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

function listConnections(familyId) {
  return db
    .prepare(
      `SELECT cc.id, cc.member_id, cc.provider, cc.label, cc.last_synced_at, cc.created_at,
              m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM calendar_connections cc
       JOIN family_members m ON m.id = cc.member_id
       WHERE m.family_id = ?
       ORDER BY cc.created_at`
    )
    .all(familyId);
}

function memberBelongsToFamily(memberId, familyId) {
  return Boolean(db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId));
}

router.get('/', requireFamilyPin, (req, res) => {
  res.json(listConnections(req.familyId));
});

router.get('/google/auth-url', requireFamilyPin, (req, res) => {
  const { memberId } = req.query;
  if (!memberId) return res.status(400).json({ error: 'memberId er påkrevd' });
  if (!memberBelongsToFamily(memberId, req.familyId)) {
    return res.status(404).json({ error: 'Fant ikke familiemedlemmet' });
  }
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.status(400).json({ error: 'Google er ikke konfigurert i .env ennå' });
  }
  res.json({ url: getAuthUrl(memberId) });
});

// Google redirigerer hit direkte fra nettleseren – økt-cookien følger med
// automatisk siden det er samme nettleser/origin, så req.familyId er
// tilgjengelig som vanlig. Tilgangen er i tillegg beskyttet av at
// auth-url-steget over krever PIN.
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const redirectBase = config.corsOrigin[0] || '/';
  if (error || !code || !state) {
    return res.redirect(`${redirectBase}?calendar_connect=error`);
  }
  if (!memberBelongsToFamily(Number(state), req.familyId)) {
    return res.redirect(`${redirectBase}?calendar_connect=error`);
  }
  try {
    await handleGoogleCallback(code, Number(state));
    res.redirect(`${redirectBase}?calendar_connect=ok`);
  } catch (err) {
    console.error('Google-kalender tilkobling feilet:', err.message);
    res.redirect(`${redirectBase}?calendar_connect=error`);
  }
});

router.post('/icloud', requireFamilyPin, async (req, res) => {
  const { memberId, appleId, appPassword } = req.body || {};
  if (!memberId || !appleId || !appPassword) {
    return res.status(400).json({ error: 'Familiemedlem, Apple-ID og app-passord er påkrevd' });
  }
  if (!memberBelongsToFamily(memberId, req.familyId)) {
    return res.status(404).json({ error: 'Fant ikke familiemedlemmet' });
  }
  try {
    await testICloudConnection(appleId, appPassword);
  } catch (err) {
    return res.status(400).json({ error: `Klarte ikke å koble til iCloud: ${err.message}` });
  }
  const info = db
    .prepare(
      `INSERT INTO calendar_connections (member_id, provider, label, credentials) VALUES (?, 'icloud', ?, ?)`
    )
    .run(memberId, appleId, JSON.stringify({ appleId, appPassword }));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/sync', requireFamilyPin, async (req, res) => {
  const connection = db
    .prepare(
      `SELECT cc.* FROM calendar_connections cc JOIN family_members m ON m.id = cc.member_id
       WHERE cc.id = ? AND m.family_id = ?`
    )
    .get(req.params.id, req.familyId);
  if (!connection) return res.status(404).json({ error: 'Fant ikke tilkoblingen' });
  try {
    const count =
      connection.provider === 'google'
        ? await syncGoogleConnection(connection)
        : await syncICloudConnection(connection);
    req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'synced' });
    res.json({ synced: count });
  } catch (err) {
    console.error(`Synk av kalender-tilkobling ${connection.id} feilet:`, err.message);
    res.status(502).json({ error: `Synkronisering feilet: ${err.message}` });
  }
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  const connection = db
    .prepare(
      `SELECT cc.id FROM calendar_connections cc JOIN family_members m ON m.id = cc.member_id
       WHERE cc.id = ? AND m.family_id = ?`
    )
    .get(req.params.id, req.familyId);
  if (!connection) return res.status(404).json({ error: 'Fant ikke tilkoblingen' });
  db.prepare('DELETE FROM calendar_connections WHERE id = ?').run(req.params.id);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'connection-removed' });
  res.status(204).end();
});

export default router;
