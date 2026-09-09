import { Router } from 'express';
import { archiveDeletion } from '../services/undoService.js';
import multer from 'multer';
import { DateTime } from 'luxon';
import { createEvent, validateEvent } from '../services/calendarEvents.js';
import { expandWeeklyOccurrences, familyDate } from '../services/calendarTime.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { scanCalendarImage } from '../services/calendarScanService.js';
import { scanHomeworkImage } from '../services/homeworkScanService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// GET /api/calendar/events?from=ISO&to=ISO
router.get('/events', (req, res) => {
  const { from, to } = req.query;
  if ((from || to) && (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 370 * 86400000)) {
    return res.status(400).json({ error: 'Velg et gyldig datointervall på maksimalt ett år.' });
  }
  if (!from || !to) {
    const rows = db
      .prepare(
        `SELECT e.*, m.name AS member_name, m.color AS member_color
         FROM calendar_events e
         LEFT JOIN family_members m ON m.id = e.member_id
         WHERE e.family_id = ?
         ORDER BY e.start_at`
      )
      .all(req.familyId);
    return res.json(rows);
  }

  const onceRows = db
    .prepare(
      `SELECT e.*, m.name AS member_name, m.color AS member_color
       FROM calendar_events e
       LEFT JOIN family_members m ON m.id = e.member_id
       WHERE e.family_id = ? AND e.recurrence = 'once' AND e.start_at < ? AND e.end_at > ?
       ORDER BY e.start_at`
    )
    .all(req.familyId, to, from);

  const weeklyBases = db
    .prepare(
      `SELECT e.*, m.name AS member_name, m.color AS member_color
       FROM calendar_events e
       LEFT JOIN family_members m ON m.id = e.member_id
       WHERE e.family_id = ? AND e.recurrence = 'weekly'`
    )
    .all(req.familyId);

  const rows = [...onceRows, ...expandWeeklyOccurrences(weeklyBases, from, to)].sort(
    (a, b) => new Date(a.start_at) - new Date(b.start_at)
  );
  res.json(rows);
});

// Tar imot et bilde tatt med nettbrettets kamera (f.eks. av en timeplan eller
// et oppslag på skolen) og bruker Claude til å finne avtaler i det. Oppretter
// ikke avtalene ennå – frontend viser dem for bekreftelse først.
router.post('/scan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen bilde mottatt' });
  }
  if (!req.file.mimetype?.startsWith('image/')) {
    return res.status(400).json({ error: 'Filen må være et bilde' });
  }
  try {
    const base64 = req.file.buffer.toString('base64');
    const events = await scanCalendarImage(base64, req.file.mimetype, req.familyId);
    res.json({ events });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Tar imot et bilde ELLER en PDF av en lekseplan (fotografert, eller lastet
// opp direkte – f.eks. et vedlegg lastet ned fra en e-post fra skolen) og
// bruker Claude til å finne leksene i det. Oppretter ikke avtalene ennå –
// frontend viser dem for bekreftelse først, samme mønster som /scan over.
router.post('/scan-homework', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen fil mottatt' });
  }
  if (!req.file.mimetype?.startsWith('image/') && req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Filen må være et bilde eller en PDF' });
  }
  try {
    const base64 = req.file.buffer.toString('base64');
    const items = await scanHomeworkImage(base64, req.file.mimetype, req.familyId);
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Lekseavtaler (source='homework') som forfaller i dag eller i morgen –
// brukes av HomeworkBanner på forsiden.
router.get('/homework-due-soon', (req, res) => {
  const today = familyDate();
  const tomorrow = familyDate(1);
  const rows = db
    .prepare(
      `SELECT e.*, m.name AS member_name, m.avatar AS member_avatar, m.color AS member_color
       FROM calendar_events e LEFT JOIN family_members m ON m.id = e.member_id
       WHERE e.family_id = ? AND e.source = 'homework' AND e.start_at >= ? AND e.start_at < ?
       ORDER BY e.start_at`
    )
    .all(req.familyId, DateTime.fromISO(today, { zone: 'Europe/Oslo' }).toUTC().toISO(), DateTime.fromISO(tomorrow, { zone: 'Europe/Oslo' }).plus({ days: 1 }).toUTC().toISO());
  res.json(rows.map((r) => ({ ...r, due_today: DateTime.fromISO(r.start_at, { zone: 'Europe/Oslo' }).toISODate() === today })));
});

// A stable client request id makes retries safe even if the response was lost.
router.get('/events/:id/packing', (req, res) => {
  if (!db.prepare('SELECT id FROM calendar_events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId)) return res.status(404).json({ error: 'Avtale ikke funnet' });
  res.json(db.prepare('SELECT item FROM calendar_packing WHERE event_id = ? AND date = ?').all(req.params.id, req.query.date || '').map(row => row.item));
});
router.put('/events/:id/packing', (req, res) => {
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!event) return res.status(404).json({ error: 'Avtale ikke funnet' });
  const { date, item, checked } = req.body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || typeof checked !== 'boolean' || !(event.bring_list || '').split('\n').map(value => value.trim()).includes(item)) return res.status(400).json({ error: 'Ugyldig sjekklistepunkt.' });
  if (checked) db.prepare('INSERT OR IGNORE INTO calendar_packing (event_id, date, item) VALUES (?, ?, ?)').run(event.id, date, item);
  else db.prepare('DELETE FROM calendar_packing WHERE event_id = ? AND date = ? AND item = ?').run(event.id, date, item);
  req.app.get('io').to(`family:${req.familyId}`).emit('packing:update');
  res.json(db.prepare('SELECT item FROM calendar_packing WHERE event_id = ? AND date = ?').all(event.id, date).map(row => row.item));
});

router.post('/events/import', (req, res) => {
  const { requestId, events } = req.body;
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100 || !Array.isArray(events) || !events.length || events.length > 200) return res.status(400).json({ error: 'Ugyldig import.' });
  const payload = JSON.stringify(events);
  const existing = db.prepare('SELECT * FROM calendar_imports WHERE family_id = ? AND request_id = ?').get(req.familyId, requestId);
  if (existing) {
    if (existing.payload !== payload) return res.status(409).json({ error: 'Denne importen er allerede lagret med et annet innhold. Lukk vinduet og kontroller kalenderen.' });
    return res.json(JSON.parse(existing.result));
  }
  for (const event of events) {
    const error = validateEvent(event, req.familyId);
    if (error) return res.status(400).json({ error });
  }
  const result = db.transaction(() => {
    const created = events.map(event => createEvent(event, req.familyId));
    db.prepare('INSERT INTO calendar_imports (family_id, request_id, payload, result) VALUES (?, ?, ?, ?)').run(req.familyId, requestId, payload, JSON.stringify(created));
    return created;
  })();
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'imported' });
  res.status(201).json(result);
});

router.get('/sync-status', (req, res) => {
  res.json(db.prepare(`SELECT c.id, c.provider, c.last_synced_at, m.name AS member_name
    FROM calendar_connections c JOIN family_members m ON m.id = c.member_id
    WHERE m.family_id = ?`).all(req.familyId));
});

router.post('/events', (req, res) => {
  const error = validateEvent(req.body, req.familyId);
  if (error) return res.status(400).json({ error });
  const event = createEvent(req.body, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'created', event });
  res.status(201).json(event);
});

router.put('/events/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Avtale ikke funnet' });
  const merged = { ...existing, ...req.body };
  const error = validateEvent(merged, req.familyId);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE calendar_events SET member_id = ?, title = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, notes = ?, recurrence = ?, responsible_id = ?, driver_id = ?, pickup_id = ?, bring_list = ?, time_zone = ?
     WHERE id = ? AND family_id = ?`
  ).run(
    merged.member_id,
    merged.title,
    merged.start_at,
    merged.end_at,
    merged.all_day ? 1 : 0,
    merged.location,
    merged.notes,
    merged.recurrence,
    merged.responsible_id ?? null, merged.driver_id ?? null, merged.pickup_id ?? null, merged.bring_list || '', merged.time_zone || 'Europe/Oslo',
    req.params.id,
    req.familyId
  );
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'updated', event });
  res.json(event);
});

router.delete('/events/:id', (req, res) => {
  const rows = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?').all(req.params.id, req.familyId);
  const undo = archiveDeletion(req, 'calendar_events', rows, () => db.prepare('DELETE FROM calendar_events WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId));
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'deleted', id: Number(req.params.id) });
  res.json(undo);
});

export default router;
