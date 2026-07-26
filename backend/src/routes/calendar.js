import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

// GET /api/calendar/events?from=ISO&to=ISO
router.get('/events', (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db
      .prepare(
        `SELECT e.*, m.name AS member_name, m.color AS member_color
         FROM calendar_events e
         LEFT JOIN family_members m ON m.id = e.member_id
         WHERE e.start_at < ? AND e.end_at > ?
         ORDER BY e.start_at`
      )
      .all(to, from);
  } else {
    rows = db
      .prepare(
        `SELECT e.*, m.name AS member_name, m.color AS member_color
         FROM calendar_events e
         LEFT JOIN family_members m ON m.id = e.member_id
         ORDER BY e.start_at`
      )
      .all();
  }
  res.json(rows);
});

router.post('/events', (req, res) => {
  const { member_id = null, title, start_at, end_at, all_day = 0, location = null, notes = null } = req.body;
  if (!title || !start_at || !end_at) {
    return res.status(400).json({ error: 'Tittel, start og slutt er påkrevd' });
  }
  const info = db
    .prepare(
      `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, location, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'local')`
    )
    .run(member_id, title, start_at, end_at, all_day ? 1 : 0, location, notes);
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').emit('calendar:update', { type: 'created', event });
  res.status(201).json(event);
});

router.put('/events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Avtale ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE calendar_events SET member_id = ?, title = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, notes = ?
     WHERE id = ?`
  ).run(
    merged.member_id,
    merged.title,
    merged.start_at,
    merged.end_at,
    merged.all_day ? 1 : 0,
    merged.location,
    merged.notes,
    req.params.id
  );
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
  req.app.get('io').emit('calendar:update', { type: 'updated', event });
  res.json(event);
});

router.delete('/events/:id', (req, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('calendar:update', { type: 'deleted', id: Number(req.params.id) });
  res.status(204).end();
});

// ---- Google Calendar-integrasjon (forberedt, krever GOOGLE_CLIENT_ID/SECRET i .env) ----
router.get('/google/status', (req, res) => {
  res.json({ configured: Boolean(config.google.clientId && config.google.clientSecret) });
});

router.get('/google/auth-url', (req, res) => {
  if (!config.google.clientId) {
    return res.status(400).json({ error: 'Google-integrasjon er ikke konfigurert i .env ennå' });
  }
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

router.get('/google/callback', (req, res) => {
  // TODO: bytt "code" mot access/refresh-token og lagre kryptert i settings-tabellen
  // når Google-integrasjonen skal fullføres.
  res.status(501).send('Google Calendar-integrasjon er forberedt, men ikke fullført ennå.');
});

export default router;
