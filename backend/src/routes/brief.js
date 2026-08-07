import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { generateBrief, getMemberBriefSettings, getTodaysBrief } from '../services/briefService.js';

const router = Router();

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/brief/status – oversikt for "God morgen"-kortet: hvem har (ikke)
// hørt sin brief i dag ennå.
router.get('/status', (req, res) => {
  const members = db
    .prepare('SELECT id, name, avatar, color, role FROM family_members ORDER BY sort_order, id')
    .all();
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
  const settings = getMemberBriefSettings(Number(req.params.memberId));
  res.json(settings);
});

router.patch('/settings/:memberId', requirePin, (req, res) => {
  const memberId = Number(req.params.memberId);
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
  const brief = getTodaysBrief(Number(req.params.memberId));
  res.json(brief || null);
});

router.post('/generate/:memberId', async (req, res) => {
  try {
    const brief = await generateBrief(Number(req.params.memberId));
    req.app.get('io').emit('brief:update', { memberId: Number(req.params.memberId) });
    res.json(brief);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å lage morgenbrief', detail: err.message });
  }
});

router.post('/:memberId/heard', (req, res) => {
  const memberId = Number(req.params.memberId);
  db.prepare(
    `UPDATE daily_briefs SET heard = 1, heard_at = datetime('now')
     WHERE member_id = ? AND brief_date = ?`
  ).run(memberId, todayStr());
  req.app.get('io').emit('brief:update', { memberId });
  res.status(204).end();
});

export default router;
