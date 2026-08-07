import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getAuthUrl, handleGoogleCallback, syncGoogleConnection } from '../services/googleCalendarSync.js';
import { testICloudConnection, syncICloudConnection } from '../services/icloudCalendarSync.js';

const router = Router();

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

function listConnections() {
  return db
    .prepare(
      `SELECT cc.id, cc.member_id, cc.provider, cc.label, cc.last_synced_at, cc.created_at,
              m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM calendar_connections cc
       JOIN family_members m ON m.id = cc.member_id
       ORDER BY cc.created_at`
    )
    .all();
}

router.get('/', requirePin, (req, res) => {
  res.json(listConnections());
});

router.get('/google/auth-url', requirePin, (req, res) => {
  const { memberId } = req.query;
  if (!memberId) return res.status(400).json({ error: 'memberId er påkrevd' });
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.status(400).json({ error: 'Google er ikke konfigurert i .env ennå' });
  }
  res.json({ url: getAuthUrl(memberId) });
});

// Google redirigerer hit direkte fra nettleseren – kan ikke sende PIN-header her,
// så tilgangen er i praksis beskyttet av at auth-url-steget over krever PIN.
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const redirectBase = config.corsOrigin[0] || '/';
  if (error || !code || !state) {
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

router.post('/icloud', requirePin, async (req, res) => {
  const { memberId, appleId, appPassword } = req.body || {};
  if (!memberId || !appleId || !appPassword) {
    return res.status(400).json({ error: 'Familiemedlem, Apple-ID og app-passord er påkrevd' });
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

router.post('/:id/sync', requirePin, async (req, res) => {
  const connection = db.prepare('SELECT * FROM calendar_connections WHERE id = ?').get(req.params.id);
  if (!connection) return res.status(404).json({ error: 'Fant ikke tilkoblingen' });
  try {
    const count =
      connection.provider === 'google'
        ? await syncGoogleConnection(connection)
        : await syncICloudConnection(connection);
    req.app.get('io').emit('calendar:update', { type: 'synced' });
    res.json({ synced: count });
  } catch (err) {
    console.error(`Synk av kalender-tilkobling ${connection.id} feilet:`, err.message);
    res.status(502).json({ error: `Synkronisering feilet: ${err.message}` });
  }
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('DELETE FROM calendar_connections WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('calendar:update', { type: 'connection-removed' });
  res.status(204).end();
});

export default router;
