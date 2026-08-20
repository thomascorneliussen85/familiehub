import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getStarsBalance } from '../services/starsService.js';
import { scanHomeworkImage } from '../services/choreScanService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const WEEKDAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Returnerer datoen (YYYY-MM-DD) som representerer "inneværende periode"
// for et gjøremål, basert på gjentakelsesregelen. For et engangs-gjøremål
// uten frist ("bare må gjøres") brukes en fast nøkkel, slik at avkrysning
// ikke nullstilles neste dag.
function currentPeriodKey(recurrence, dueDate) {
  if (recurrence === 'once') return dueDate || 'anytime';
  if (recurrence === 'daily') return todayStr();
  if (recurrence.startsWith('weekly:')) {
    const targetIdx = WEEKDAY_INDEX[recurrence.split(':')[1]] ?? 0;
    const now = new Date();
    const currentIdx = (now.getDay() + 6) % 7; // man=0..søn=6
    const diff = targetIdx - currentIdx;
    const d = new Date(now);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  return todayStr();
}

function mondayOfThisWeek() {
  const now = new Date();
  const currentIdx = (now.getDay() + 6) % 7;
  const d = new Date(now);
  d.setDate(d.getDate() - currentIdx);
  return d;
}

function listChores(familyId) {
  const chores = db
    .prepare(
      `SELECT c.*, m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM chores c LEFT JOIN family_members m ON m.id = c.member_id
       WHERE c.family_id = ? AND c.active = 1
       ORDER BY c.member_id, c.id`
    )
    .all(familyId);
  const completionStmt = db.prepare(
    'SELECT 1 FROM chore_completions WHERE chore_id = ? AND completed_on = ?'
  );
  return chores.map((chore) => {
    const periodKey = currentPeriodKey(chore.recurrence, chore.due_date);
    const done = Boolean(completionStmt.get(chore.id, periodKey));
    return { ...chore, period_key: periodKey, done };
  });
}

router.get('/', (req, res) => {
  res.json(listChores(req.familyId));
});

router.post('/', (req, res) => {
  const { member_id = null, title, recurrence = 'once', due_date = null, stars = 1, is_homework = false } = req.body;
  if (!title) return res.status(400).json({ error: 'Tittel er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO chores (family_id, member_id, title, recurrence, due_date, stars, is_homework) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.familyId, member_id, title, recurrence, due_date, stars, is_homework ? 1 : 0);
  req.app.get('io').to(`family:${req.familyId}`).emit('chores:update');
  res.status(201).json({ id: info.lastInsertRowid });
});

// Tar imot et bilde av en lekseplan (tatt med nettbrettets kamera) og bruker
// Claude til å finne lekser i det. Oppretter ikke gjøremålene ennå – frontend
// viser dem for bekreftelse først, samme mønster som /api/calendar/scan.
router.post('/scan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ingen bilde mottatt' });
  }
  if (!req.file.mimetype?.startsWith('image/')) {
    return res.status(400).json({ error: 'Filen må være et bilde' });
  }
  try {
    const base64 = req.file.buffer.toString('base64');
    const items = await scanHomeworkImage(base64, req.file.mimetype, req.familyId);
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Kryss av / fjern avkrysning for gjeldende periode (i dag / denne uken) –
// eller, kun for daglige gjøremål, en spesifikk dato i uketavlen (se
// /weekly-grid), slik at en kan krysse av en annen dag enn i dag.
router.post('/:id/toggle', (req, res) => {
  const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!chore) return res.status(404).json({ error: 'Gjøremål ikke funnet' });
  const { date } = req.body || {};
  if (date && chore.recurrence !== 'daily') {
    return res.status(400).json({ error: 'Kan bare velge en annen dato for daglige gjøremål' });
  }
  const periodKey = date || currentPeriodKey(chore.recurrence, chore.due_date);
  const existing = db
    .prepare('SELECT * FROM chore_completions WHERE chore_id = ? AND completed_on = ?')
    .get(chore.id, periodKey);

  if (existing) {
    db.prepare('DELETE FROM chore_completions WHERE id = ?').run(existing.id);
  } else {
    db.prepare(
      'INSERT INTO chore_completions (chore_id, completed_on, stars_awarded) VALUES (?, ?, ?)'
    ).run(chore.id, periodKey, chore.stars);
  }
  const io = req.app.get('io');
  io.to(`family:${req.familyId}`).emit('chores:update');
  res.json({ done: !existing });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE chores SET active = 0 WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('chores:update');
  res.status(204).end();
});

// Uketavle: for hvert daglige gjøremål (kun 'daily' – et ukentlig gjøremål
// har uansett bare én relevant dag), 7 avkrysningsbokser (man-søn) for
// inneværende uke i stedet for bare "gjort i dag". Brukes av Barn-siden.
router.get('/weekly-grid', (req, res) => {
  const { member_id } = req.query;
  const params = member_id ? [req.familyId, member_id] : [req.familyId];
  const chores = db
    .prepare(
      `SELECT * FROM chores WHERE family_id = ? AND active = 1 AND recurrence = 'daily'${member_id ? ' AND member_id = ?' : ''} ORDER BY id`
    )
    .all(...params);

  const monday = mondayOfThisWeek();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const completionStmt = db.prepare(
    `SELECT completed_on FROM chore_completions WHERE chore_id = ? AND completed_on >= ? AND completed_on <= ?`
  );

  res.json(
    chores.map((chore) => {
      const doneDates = new Set(completionStmt.all(chore.id, days[0], days[6]).map((r) => r.completed_on));
      return { ...chore, days: days.map((date) => ({ date, done: doneDates.has(date) })) };
    })
  );
});

// Lekser (is_homework=1) som forfaller i dag eller i morgen og ikke er
// krysset av ennå – brukes av HomeworkBanner på forsiden.
router.get('/homework-due-soon', (req, res) => {
  const today = todayStr();
  const tomorrow = todayStr(1);
  const rows = db
    .prepare(
      `SELECT c.*, m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM chores c LEFT JOIN family_members m ON m.id = c.member_id
       WHERE c.family_id = ? AND c.active = 1 AND c.is_homework = 1 AND c.due_date IN (?, ?)
       ORDER BY c.due_date, c.id`
    )
    .all(req.familyId, today, tomorrow);
  const completionStmt = db.prepare('SELECT 1 FROM chore_completions WHERE chore_id = ? AND completed_on = ?');
  const due = rows.filter((c) => !completionStmt.get(c.id, c.due_date));
  res.json(due.map((c) => ({ ...c, due_today: c.due_date === today })));
});

// Stjerneoversikt per familiemedlem (totalt og denne uken)
router.get('/stars', (req, res) => {
  const members = db.prepare('SELECT id, name, avatar, color FROM family_members WHERE family_id = ?').all(req.familyId);
  res.json(members.map((m) => ({ ...m, ...getStarsBalance(req.familyId, m.id) })));
});

export default router;
