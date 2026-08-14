import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getStarsBalance } from '../services/starsService.js';

const router = Router();
router.use(requireAuth);

// ---- Sparemål (stjernebasert, ikke ekte penger) ----

// Gjeldende (uoppnådde) sparemål, ett per medlem – hele familien eller filtrert til ett medlem.
router.get('/savings', (req, res) => {
  const { member_id } = req.query;
  const params = member_id ? [req.familyId, member_id] : [req.familyId];
  const rows = db
    .prepare(
      `SELECT sg.* FROM savings_goals sg
       JOIN family_members m ON m.id = sg.member_id
       WHERE m.family_id = ? AND sg.achieved_at IS NULL${member_id ? ' AND sg.member_id = ?' : ''}
       ORDER BY sg.created_at DESC`
    )
    .all(...params);
  res.json(rows);
});

// Setter et nytt sparemål – erstatter et ev. eksisterende aktivt mål for
// samme barn (kun ett aktivt mål av gangen, som i Zenframe sitt enkle skjema).
router.post('/savings', (req, res) => {
  const { member_id, title, star_cost } = req.body || {};
  if (!member_id || !title || !star_cost) {
    return res.status(400).json({ error: 'Familiemedlem, tittel og stjernekostnad er påkrevd' });
  }
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(member_id, req.familyId);
  if (!member) return res.status(404).json({ error: 'Fant ikke familiemedlemmet' });

  db.transaction(() => {
    db.prepare('DELETE FROM savings_goals WHERE member_id = ? AND achieved_at IS NULL').run(member_id);
    db.prepare('INSERT INTO savings_goals (family_id, member_id, title, star_cost) VALUES (?, ?, ?, ?)').run(
      req.familyId,
      member_id,
      title.trim(),
      Number(star_cost)
    );
  })();

  const goal = db.prepare('SELECT * FROM savings_goals WHERE member_id = ? AND achieved_at IS NULL').get(member_id);
  req.app.get('io').to(`family:${req.familyId}`).emit('family-goals:update');
  res.status(201).json(goal);
});

// Løser inn sparemålet – trekker stjerner (via reward_redemptions, samme
// mekanisme som en vanlig belønning) og markerer målet som oppnådd.
router.post('/savings/:id/redeem', (req, res) => {
  const goal = db
    .prepare(
      `SELECT sg.* FROM savings_goals sg JOIN family_members m ON m.id = sg.member_id
       WHERE sg.id = ? AND m.family_id = ? AND sg.achieved_at IS NULL`
    )
    .get(req.params.id, req.familyId);
  if (!goal) return res.status(404).json({ error: 'Fant ikke et aktivt sparemål' });

  const { stars_balance } = getStarsBalance(req.familyId, goal.member_id);
  if (stars_balance < goal.star_cost) {
    return res.status(400).json({ error: 'Ikke nok stjerner ennå' });
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO reward_redemptions (member_id, reward_id, reward_title, stars_spent) VALUES (?, NULL, ?, ?)`
    ).run(goal.member_id, goal.title, goal.star_cost);
    db.prepare(`UPDATE savings_goals SET achieved_at = datetime('now') WHERE id = ?`).run(goal.id);
  })();

  const io = req.app.get('io');
  io.to(`family:${req.familyId}`).emit('family-goals:update');
  io.to(`family:${req.familyId}`).emit('rewards:update');
  res.status(204).end();
});

// Avbryter et sparemål uten å løse det inn (f.eks. hvis barnet ombestemmer seg).
router.delete('/savings/:id', (req, res) => {
  db.prepare(
    `DELETE FROM savings_goals WHERE id = ? AND member_id IN (SELECT id FROM family_members WHERE family_id = ?)`
  ).run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('family-goals:update');
  res.status(204).end();
});

// ---- Langsiktige mål (uten stjerner) ----

router.get('/long-term', (req, res) => {
  const { member_id } = req.query;
  const params = member_id ? [req.familyId, member_id] : [req.familyId];
  const rows = db
    .prepare(
      `SELECT ltg.* FROM long_term_goals ltg
       JOIN family_members m ON m.id = ltg.member_id
       WHERE m.family_id = ?${member_id ? ' AND ltg.member_id = ?' : ''}
       ORDER BY ltg.done ASC, ltg.created_at DESC`
    )
    .all(...params);
  res.json(rows);
});

router.post('/long-term', (req, res) => {
  const { member_id, title } = req.body || {};
  if (!member_id || !title) {
    return res.status(400).json({ error: 'Familiemedlem og tittel er påkrevd' });
  }
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(member_id, req.familyId);
  if (!member) return res.status(404).json({ error: 'Fant ikke familiemedlemmet' });
  const info = db
    .prepare('INSERT INTO long_term_goals (family_id, member_id, title) VALUES (?, ?, ?)')
    .run(req.familyId, member_id, title.trim());
  req.app.get('io').to(`family:${req.familyId}`).emit('family-goals:update');
  res.status(201).json(db.prepare('SELECT * FROM long_term_goals WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/long-term/:id/toggle', (req, res) => {
  const goal = db
    .prepare(
      `SELECT ltg.* FROM long_term_goals ltg JOIN family_members m ON m.id = ltg.member_id
       WHERE ltg.id = ? AND m.family_id = ?`
    )
    .get(req.params.id, req.familyId);
  if (!goal) return res.status(404).json({ error: 'Fant ikke målet' });
  db.prepare('UPDATE long_term_goals SET done = ? WHERE id = ?').run(goal.done ? 0 : 1, goal.id);
  req.app.get('io').to(`family:${req.familyId}`).emit('family-goals:update');
  res.json({ done: !goal.done });
});

router.delete('/long-term/:id', (req, res) => {
  db.prepare(
    `DELETE FROM long_term_goals WHERE id = ? AND member_id IN (SELECT id FROM family_members WHERE family_id = ?)`
  ).run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('family-goals:update');
  res.status(204).end();
});

export default router;
