import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

const WEEKDAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Returnerer datoen (YYYY-MM-DD) som representerer "inneværende periode"
// for et gjøremål, basert på gjentakelsesregelen.
function currentPeriodKey(recurrence, dueDate) {
  if (recurrence === 'once') return dueDate || todayStr();
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
  return d.toISOString().slice(0, 10);
}

function listChores() {
  const chores = db
    .prepare(
      `SELECT c.*, m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM chores c LEFT JOIN family_members m ON m.id = c.member_id
       WHERE c.active = 1
       ORDER BY c.member_id, c.id`
    )
    .all();
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
  res.json(listChores());
});

// Oversikt for barnas oppgaveside: dagens oppgaver, stjerner og bonusbelønninger per barn
router.get('/kids-overview', (req, res) => {
  const kids = db
    .prepare("SELECT * FROM family_members WHERE role = 'barn' ORDER BY sort_order, id")
    .all();
  const today = todayStr();
  const weekStart = mondayOfThisWeek();

  const choresStmt = db.prepare('SELECT * FROM chores WHERE member_id = ? AND active = 1 ORDER BY id');
  const completionStmt = db.prepare(
    'SELECT 1 FROM chore_completions WHERE chore_id = ? AND completed_on = ?'
  );
  const starsTodayStmt = db.prepare(
    `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
     FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
     WHERE c.member_id = ? AND cc.completed_on = ?`
  );
  const starsWeekStmt = db.prepare(
    `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
     FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
     WHERE c.member_id = ? AND cc.completed_on >= ?`
  );
  const bonusStmt = db.prepare(
    `SELECT * FROM bonus_rewards WHERE active = 1 AND (member_id = ? OR member_id IS NULL)
     ORDER BY stars_required`
  );

  const overview = kids.map((kid) => {
    const starsToday = starsTodayStmt.get(kid.id, today).total;
    const tasks = choresStmt
      .all(kid.id)
      .map((chore) => {
        const periodKey = currentPeriodKey(chore.recurrence, chore.due_date);
        return { ...chore, period_key: periodKey, done: Boolean(completionStmt.get(chore.id, periodKey)) };
      })
      .filter((chore) => chore.period_key === today);
    const bonusRewards = bonusStmt.all(kid.id).map((b) => ({ ...b, unlocked: starsToday >= b.stars_required }));

    return {
      ...kid,
      tasks,
      stars_today: starsToday,
      stars_week: starsWeekStmt.get(kid.id, weekStart).total,
      bonus_rewards: bonusRewards,
    };
  });

  res.json(overview);
});

router.post('/', (req, res) => {
  const { member_id = null, title, recurrence = 'once', due_date = null, stars = 1, reward_text = null } = req.body;
  if (!title) return res.status(400).json({ error: 'Tittel er påkrevd' });
  const info = db
    .prepare(
      'INSERT INTO chores (member_id, title, recurrence, due_date, stars, reward_text) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(member_id, title, recurrence, due_date, stars, reward_text);
  req.app.get('io').emit('chores:update');
  res.status(201).json({ id: info.lastInsertRowid });
});

// Redigerer et eksisterende gjøremål (brukes av voksen-administrasjonen)
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Gjøremål ikke funnet' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE chores SET member_id = ?, title = ?, recurrence = ?, due_date = ?, stars = ?, reward_text = ?
     WHERE id = ?`
  ).run(
    merged.member_id,
    merged.title,
    merged.recurrence,
    merged.due_date,
    merged.stars,
    merged.reward_text,
    req.params.id
  );
  req.app.get('io').emit('chores:update');
  res.json(db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id));
});

// Kryss av / fjern avkrysning for gjeldende periode (i dag / denne uken)
router.post('/:id/toggle', (req, res) => {
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
  if (!chore) return res.status(404).json({ error: 'Gjøremål ikke funnet' });
  const periodKey = currentPeriodKey(chore.recurrence, chore.due_date);
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
  io.emit('chores:update');
  res.json({ done: !existing });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE chores SET active = 0 WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('chores:update');
  res.status(204).end();
});

// Stjerneoversikt per familiemedlem (totalt og denne uken)
router.get('/stars', (req, res) => {
  const members = db.prepare('SELECT id, name, avatar, color FROM family_members').all();
  const weekStart = mondayOfThisWeek();
  const totalStmt = db.prepare(
    `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
     FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
     WHERE c.member_id = ?`
  );
  const weekStmt = db.prepare(
    `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
     FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
     WHERE c.member_id = ? AND cc.completed_on >= ?`
  );
  res.json(
    members.map((m) => ({
      ...m,
      stars_total: totalStmt.get(m.id).total,
      stars_this_week: weekStmt.get(m.id, weekStart).total,
    }))
  );
});

export default router;
