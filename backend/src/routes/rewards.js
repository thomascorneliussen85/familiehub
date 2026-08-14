import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { getStarsBalance } from '../services/starsService.js';

const router = Router();
router.use(requireAuth);

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function familyRewardImagesDir(familyId) {
  return path.join(config.rewardsImagesDir, String(familyId));
}

function saveImage(familyId, file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new Error('Ugyldig filtype');
  const dir = familyRewardImagesDir(familyId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `reward-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return filename;
}

function rewardWithUrl(familyId, reward) {
  return { ...reward, image_url: reward.image ? `/reward-images/${familyId}/${encodeURIComponent(reward.image)}` : null };
}

// GET /api/rewards/balances – stjernebalanse per familiemedlem: total opptjent
// (livstid), denne uken (motivasjon), og saldo (opptjent - brukt, det som kan
// løses inn nå).
router.get('/balances', (req, res) => {
  const members = db.prepare('SELECT id, name, avatar, color FROM family_members WHERE family_id = ?').all(req.familyId);
  res.json(members.map((m) => ({ ...m, ...getStarsBalance(req.familyId, m.id) })));
});

router.get('/', (req, res) => {
  const rewards = db.prepare('SELECT * FROM rewards WHERE family_id = ? ORDER BY sort_order, id').all(req.familyId);
  res.json(rewards.map((r) => rewardWithUrl(req.familyId, r)));
});

router.post('/', requireFamilyPin, upload.single('image'), (req, res) => {
  const { title, description = null, star_cost, sort_order = 0 } = req.body;
  if (!title || !star_cost) {
    return res.status(400).json({ error: 'Tittel og stjernekostnad er påkrevd' });
  }
  let image = null;
  try {
    if (req.file) image = saveImage(req.familyId, req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const info = db
    .prepare('INSERT INTO rewards (family_id, title, description, star_cost, image, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.familyId, title, description, Number(star_cost), image, Number(sort_order));
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND family_id = ?').get(info.lastInsertRowid, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('rewards:update');
  res.status(201).json(rewardWithUrl(req.familyId, reward));
});

router.patch('/:id', requireFamilyPin, upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM rewards WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Belønning ikke funnet' });

  let image = existing.image;
  if (req.file) {
    try {
      image = saveImage(req.familyId, req.file);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (existing.image) {
      fs.rm(path.join(familyRewardImagesDir(req.familyId), existing.image), { force: true }, () => {});
    }
  }

  const merged = { ...existing, ...req.body, image };
  db.prepare(
    `UPDATE rewards SET title = ?, description = ?, star_cost = ?, image = ?, active = ?, sort_order = ? WHERE id = ? AND family_id = ?`
  ).run(
    merged.title,
    merged.description,
    Number(merged.star_cost),
    merged.image,
    merged.active === false || merged.active === '0' || merged.active === 0 ? 0 : 1,
    Number(merged.sort_order),
    req.params.id,
    req.familyId
  );
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('rewards:update');
  res.json(rewardWithUrl(req.familyId, reward));
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('UPDATE rewards SET active = 0 WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('rewards:update');
  res.status(204).end();
});

router.get('/redemptions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = db
    .prepare(
      `SELECT r.*, m.name AS member_name, m.avatar AS member_avatar, m.color AS member_color
       FROM reward_redemptions r
       LEFT JOIN family_members m ON m.id = r.member_id
       WHERE m.family_id = ?
       ORDER BY r.id DESC LIMIT ?`
    )
    .all(req.familyId, limit);
  res.json(rows);
});

router.post('/redeem', (req, res) => {
  const { member_id, reward_id } = req.body;
  if (!member_id || !reward_id) {
    return res.status(400).json({ error: 'Familiemedlem og belønning er påkrevd' });
  }
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(member_id, req.familyId);
  if (!member) return res.status(404).json({ error: 'Fant ikke familiemedlemmet' });
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND family_id = ? AND active = 1').get(reward_id, req.familyId);
  if (!reward) return res.status(404).json({ error: 'Fant ikke belønningen' });

  const { stars_balance: balance } = getStarsBalance(req.familyId, member_id);

  if (balance < reward.star_cost) {
    return res.status(400).json({ error: 'Ikke nok stjerner ennå' });
  }

  const info = db
    .prepare(
      `INSERT INTO reward_redemptions (member_id, reward_id, reward_title, stars_spent) VALUES (?, ?, ?, ?)`
    )
    .run(member_id, reward.id, reward.title, reward.star_cost);
  req.app.get('io').to(`family:${req.familyId}`).emit('rewards:update');
  res.status(201).json(db.prepare('SELECT * FROM reward_redemptions WHERE id = ?').get(info.lastInsertRowid));
});

// Angre en innløsning (feiltrykk e.l.) – refunderer stjernene.
router.delete('/redemptions/:id', requireFamilyPin, (req, res) => {
  const existing = db
    .prepare(
      `SELECT rr.* FROM reward_redemptions rr JOIN family_members m ON m.id = rr.member_id
       WHERE rr.id = ? AND m.family_id = ?`
    )
    .get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'Fant ikke innløsningen' });
  db.prepare('DELETE FROM reward_redemptions WHERE id = ?').run(req.params.id);
  req.app.get('io').to(`family:${req.familyId}`).emit('rewards:update');
  res.status(204).end();
});

export default router;
