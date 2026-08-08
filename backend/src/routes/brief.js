import { Router } from 'express';
import { db } from '../db/index.js';
import { generateBrief, getMemberBriefSettings, getTodaysBrief } from '../services/briefService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function memberBelongsToFamily(memberId, familyId) {
  return Boolean(db.prepare('SELECT 1 FROM family_members WHERE id = ? AND family_id = ?').get(memberId, familyId));
}

// GET /api/brief/status – oversikt for "God morgen"-kortet: hvem har (ikke)
// hørt sin brief i dag ennå.
router.get('/status', (req, res) => {
  const members = db
    .prepare('SELECT id, name, avatar, color, role FROM family_members WHERE family_id = ? ORDER BY sort_order, id')
    .all(req.familyId);
  const date = todayStr();
  const briefStmt = db.prepare('SELECT heard FROM daily_briefs WHERE member_id = ? AND brief_date = ?');
  res.json(
    members.map((m) => {
      const brief = briefStmt.get(m.id, date);
      return { ...m, hasBrief: Boolean(brief), heard: Boolean(brief?.heard) };
    })
  );
});

router.get('/settings/:memberId', (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!memberBelongsToFamily(memberId, req.familyId)) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  res.json(getMemberBriefSettings(memberId));
});

router.patch('/settings/:memberId', requireFamilyPin, (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!memberBelongsToFamily(memberId, req.familyId)) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  getMemberBriefSettings(memberId); // sikrer at raden finnes
  const b = req.body;
  db.prepare(
    `UPDATE brief_settings SET
       module_calendar = ?, module_weather = ?, module_power = ?, module_chores = ?,
       module_news = ?, module_market = ?, module_verse = ?, module_quote = ?, module_fact = ?,
       tickers = ?, rss_feed_urls = ?, preferred_time = ?, updated_at = datetime('now')
     WHERE member_id = ?`
  ).run(
    b.module_calendar ? 1 : 0,
    b.module_weather ? 1 : 0,
    b.module_power ? 1 : 0,
    b.module_chores ? 1 : 0,
    b.module_news ? 1 : 0,
    b.module_market ? 1 : 0,
    b.module_verse ? 1 : 0,
    b.module_quote ? 1 : 0,
    b.module_fact ? 1 : 0,
    JSON.stringify(b.tickers || []),
    JSON.stringify(b.rss_feed_urls || []),
    b.preferred_time || '07:00',
    memberId
  );
  res.json(getMemberBriefSettings(memberId));
});

router.get('/:memberId/today', (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!memberBelongsToFamily(memberId, req.familyId)) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  const brief = getTodaysBrief(memberId);
  res.json(brief || null);
});

router.post('/generate/:memberId', async (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!memberBelongsToFamily(memberId, req.familyId)) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  try {
    const brief = await generateBrief(memberId);
    req.app.get('io').to(`family:${req.familyId}`).emit('brief:update', { memberId });
    res.json(brief);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage morgenbrief', detail: err.message });
  }
});

router.post('/:memberId/heard', (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!memberBelongsToFamily(memberId, req.familyId)) return res.status(404).json({ error: 'Familiemedlem ikke funnet' });
  db.prepare(
    `UPDATE daily_briefs SET heard = 1, heard_at = datetime('now')
     WHERE member_id = ? AND brief_date = ?`
  ).run(memberId, todayStr());
  req.app.get('io').to(`family:${req.familyId}`).emit('brief:update', { memberId });
  res.status(204).end();
});

export default router;
