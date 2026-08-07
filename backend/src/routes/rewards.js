import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db/index.js';

const router = Router();
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

function saveImage(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new Error('Ugyldig filtype');
  fs.mkdirSync(config.rewardsImagesDir, { recursive: true });
  const filename = `reward-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.writeFileSync(path.join(config.rewardsImagesDir, filename), file.buffer);
  return filename;
}

function rewardWithUrl(reward) {
  return { ...reward, image_url: reward.image ? `/reward-images/${encodeURIComponent(reward.image)}` : null };
}

// GET /api/rewards/balances – stjernebalanse per familiemedlem: total opptjent
// (livstid), denne uken (motivasjon), og saldo (opptjent - brukt, det som kan
// løses inn nå).
router.get('/balances', (req, res) => {
  const members = db.prepare('SELECT id, name, avatar, color FROM family_members').all();
  const now = new Date();
  const currentIdx = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - currentIdx);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

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
  const spentStmt = db.prepare(
    `SELECT COALESCE(SUM(stars_spent), 0) AS total FROM reward_redemptions WHERE member_id = ?`
  );

  res.json(
    members.map((m) => {
      const total = totalStmt.get(m.id).total;
      const spent = spentStmt.get(m.id).total;
      return {
        ...m,
        stars_total: total,
        stars_this_week: weekStmt.get(m.id, weekStartStr).total,
        stars_spent: spent,
        stars_balance: total - spent,
      };
    })
  );
});

router.get('/', (req, res) => {
  const rewards = db.prepare('SELECT * FROM rewards ORDER BY sort_order, id').all();
  res.json(rewards.map(rewardWithUrl));
});

router.post('/', requirePin, upload.single('image'), (req, res) => {
  const { title, description = null, star_cost, sort_order = 0 } = req.body;
  if (!title || !star_cost) {
    return res.status(400).json({ error: 'Tittel og stjernekostnad er påkrevd' });
  }
  let image = null;
  try {
    if (req.file) image = saveImage(req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const info = db
    .prepare('INSERT INTO rewards (title, description, star_cost, image, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(title, description, Number(star_cost), image, Number(sort_order));
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').emit('rewards:update');
  res.status(201).json(rewardWithUrl(reward));
});

router.patch('/:id', requirePin, upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Belønning ikke funnet' });

  let image = existing.image;
  if (req.file) {
    try {
      image = saveImage(req.file);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (existing.image) {
      fs.rm(path.join(config.rewardsImagesDir, existing.image), { force: true }, () => {});
    }
  }

  const merged = { ...existing, ...req.body, image };
  db.prepare(
    `UPDATE rewards SET title = ?, description = ?, star_cost = ?, image = ?, active = ?, sort_order = ? WHERE id = ?`
  ).run(
    merged.title,
    merged.description,
    Number(merged.star_cost),
    merged.image,
    merged.active === false || merged.active === '0' || merged.active === 0 ? 0 : 1,
    Number(merged.sort_order),
    req.params.id
  );
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);
  req.app.get('io').emit('rewards:update');
  res.json(rewardWithUrl(reward));
});

router.delete('/:id', requirePin, (req, res) => {
  db.prepare('UPDATE rewards SET active = 0 WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('rewards:update');
  res.status(204).end();
});

router.get('/redemptions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = db
    .prepare(
      `SELECT r.*, m.name AS member_name, m.avatar AS member_avatar, m.color AS member_color
       FROM reward_redemptions r
       LEFT JOIN family_members m ON m.id = r.member_id
       ORDER BY r.id DESC LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

router.post('/redeem', (req, res) => {
  const { member_id, reward_id } = req.body;
  if (!member_id || !reward_id) {
    return res.status(400).json({ error: 'Familiemedlem og belønning er påkrevd' });
  }
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND active = 1').get(reward_id);
  if (!reward) return res.status(404).json({ error: 'Fant ikke belønningen' });

  const total = db
    .prepare(
      `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
       FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
       WHERE c.member_id = ?`
    )
    .get(member_id).total;
  const spent = db
    .prepare(`SELECT COALESCE(SUM(stars_spent), 0) AS total FROM reward_redemptions WHERE member_id = ?`)
    .get(member_id).total;
  const balance = total - spent;

  if (balance < reward.star_cost) {
    return res.status(400).json({ error: 'Ikke nok stjerner ennå' });
  }

  const info = db
    .prepare(
      `INSERT INTO reward_redemptions (member_id, reward_id, reward_title, stars_spent) VALUES (?, ?, ?, ?)`
    )
    .run(member_id, reward.id, reward.title, reward.star_cost);
  req.app.get('io').emit('rewards:update');
  res.status(201).json(db.prepare('SELECT * FROM reward_redemptions WHERE id = ?').get(info.lastInsertRowid));
});

// Angre en innløsning (feiltrykk e.l.) – refunderer stjernene.
router.delete('/redemptions/:id', requirePin, (req, res) => {
  db.prepare('DELETE FROM reward_redemptions WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('rewards:update');
  res.status(204).end();
});

export default router;
