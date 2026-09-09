import { Router } from 'express';
import { DateTime } from 'luxon';
import { FAMILY_ZONE } from '../services/calendarTime.js';
import { archiveDeletion } from '../services/undoService.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getStarsBalance } from '../services/starsService.js';

const router = Router();
router.use(requireAuth);

const WEEKDAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function todayStr(offsetDays = 0) { return DateTime.now().setZone(FAMILY_ZONE).plus({ days: offsetDays }).toISODate(); }
function currentPeriodKey(recurrence, dueDate) {
  if (recurrence === 'once') return dueDate || 'anytime';
  if (recurrence.startsWith('weekly:')) return DateTime.now().setZone(FAMILY_ZONE).startOf('week').plus({ days: WEEKDAY_INDEX[recurrence.split(':')[1]] ?? 0 }).toISODate();
  return todayStr();
}
function mondayOfThisWeek() { return DateTime.now().setZone(FAMILY_ZONE).startOf('week'); }

router.post('/routines', (req, res) => {
  const { member_id, group, titles } = req.body;
  if (!['morning', 'evening'].includes(group) || !Array.isArray(titles) || !titles.length || titles.length > 20 || titles.some(title => typeof title !== 'string' || !title.trim() || title.length > 200)) return res.status(400).json({ error: 'Velg rutine og mellom 1 og 20 korte trinn.' });
  if (!db.prepare("SELECT id FROM family_members WHERE id = ? AND family_id = ? AND role = 'barn'").get(member_id, req.familyId)) return res.status(400).json({ error: 'Velg et barn i din familie.' });
  db.transaction(() => {
    for (const raw of titles) {
      const title = raw.trim();
      const exists = db.prepare('SELECT id FROM chores WHERE family_id = ? AND member_id = ? AND routine_group = ? AND title = ? AND active = 1').get(req.familyId, member_id, group, title);
      if (!exists) db.prepare("INSERT INTO chores (family_id, member_id, title, recurrence, stars, routine_group) VALUES (?, ?, ?, 'daily', 1, ?)").run(req.familyId, member_id, title, group);
    }
  })();
  req.app.get('io').to(`family:${req.familyId}`).emit('chores:update');
  res.status(201).json({ saved: true });
});

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
  const { member_id = null, title, recurrence = 'once', due_date = null, stars = 1 } = req.body;
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Tittel er påkrevd' });
  if (member_id != null && !db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ?').get(member_id, req.familyId)) return res.status(400).json({ error: 'Ugyldig familiemedlem' });
  const info = db
    .prepare(
      'INSERT INTO chores (family_id, member_id, title, recurrence, due_date, stars) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.familyId, member_id, title, recurrence, due_date, stars);
  req.app.get('io').to(`family:${req.familyId}`).emit('chores:update');
  res.status(201).json({ id: info.lastInsertRowid });
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
  const rows = db.prepare('SELECT * FROM chores WHERE id = ? AND family_id = ? AND active = 1').all(req.params.id, req.familyId);
  const undo = archiveDeletion(req, 'chores', rows, () => db.prepare('UPDATE chores SET active = 0 WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId));
  req.app.get('io').to(`family:${req.familyId}`).emit('chores:update');
  res.json(undo);
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
    return monday.plus({ days: i }).toISODate();
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

// Stjerneoversikt per familiemedlem (totalt og denne uken)
router.get('/stars', (req, res) => {
  const members = db.prepare('SELECT id, name, avatar, color FROM family_members WHERE family_id = ?').all(req.familyId);
  res.json(members.map((m) => ({ ...m, ...getStarsBalance(req.familyId, m.id) })));
});

export default router;
