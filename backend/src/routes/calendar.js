import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { scanCalendarImage } from '../services/calendarScanService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Utvider ukentlig gjentakende avtaler til faktiske forekomster innenfor [from, to).
function expandWeeklyOccurrences(events, fromIso, toIso) {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const result = [];
  for (const e of events) {
    const originalStart = new Date(e.start_at).getTime();
    const duration = new Date(e.end_at).getTime() - originalStart;
    let occStart = originalStart;
    if (occStart < fromMs) {
      const weeksToShift = Math.ceil((fromMs - occStart) / WEEK_MS);
      occStart += weeksToShift * WEEK_MS;
    }
    while (occStart < toMs) {
      if (occStart + duration > fromMs) {
        result.push({
          ...e,
          start_at: new Date(occStart).toISOString(),
          end_at: new Date(occStart + duration).toISOString(),
        });
      }
      occStart += WEEK_MS;
    }
  }
  return result;
}

// GET /api/calendar/events?from=ISO&to=ISO
router.get('/events', (req, res) => {
  const { from, to } = req.query;
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

router.post('/events', (req, res) => {
  const {
    member_id = null,
    title,
    start_at,
    end_at,
    all_day = 0,
    location = null,
    notes = null,
    recurrence = 'once',
  } = req.body;
  if (!title || !start_at || !end_at) {
    return res.status(400).json({ error: 'Tittel, start og slutt er påkrevd' });
  }
  const info = db
    .prepare(
      `INSERT INTO calendar_events (family_id, member_id, title, start_at, end_at, all_day, location, notes, source, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)`
    )
    .run(req.familyId, member_id, title, start_at, end_at, all_day ? 1 : 0, location, notes, recurrence);
  const event = db
    .prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?')
    .get(info.lastInsertRowid, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'created', event });
  res.status(201).json(event);
});

router.put('/events/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Avtale ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE calendar_events SET member_id = ?, title = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, notes = ?, recurrence = ?
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
    req.params.id,
    req.familyId
  );
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'updated', event });
  res.json(event);
});

router.delete('/events/:id', (req, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'deleted', id: Number(req.params.id) });
  res.status(204).end();
});

export default router;
