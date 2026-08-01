import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getPlayStatusSnapshot } from '../services/playStatusService.js';
import { getSetting } from '../services/settingsStore.js';
import { broadcastLocalStatus } from '../services/relayClient.js';

const router = Router();

function expiryHours() {
  const stored = getSetting('play_status_expiry_hours');
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : config.playStatus.expiryHours;
}

function broadcastLocal(io) {
  io.emit('play-status:update', getPlayStatusSnapshot());
}

router.get('/', (req, res) => {
  res.json(getPlayStatusSnapshot());
});

router.post('/', (req, res) => {
  const { childId, location, emoji } = req.body;
  if (!childId || !location) {
    return res.status(400).json({ error: 'Barn og sted er påkrevd' });
  }
  const child = db.prepare(`SELECT * FROM family_members WHERE id = ? AND role = 'barn'`).get(childId);
  if (!child) {
    return res.status(404).json({ error: 'Fant ikke barnet' });
  }

  db.prepare(`UPDATE play_status SET ended_at = datetime('now') WHERE child_id = ? AND ended_at IS NULL`).run(
    childId
  );

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + expiryHours() * 60 * 60 * 1000).toISOString();
  const info = db
    .prepare('INSERT INTO play_status (child_id, location, emoji, expires_at) VALUES (?, ?, ?, ?)')
    .run(childId, location, emoji || null, expiresAt);

  broadcastLocal(req.app.get('io'));
  broadcastLocalStatus({
    statusId: info.lastInsertRowid,
    childName: child.name,
    location,
    emoji: emoji || null,
    startedAt: startedAt.toISOString(),
    expiresAt,
    ended: false,
  });

  const status = db
    .prepare(
      `SELECT ps.*, m.name AS child_name, m.color AS child_color, m.avatar AS child_avatar
       FROM play_status ps JOIN family_members m ON m.id = ps.child_id WHERE ps.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(status);
});

router.post('/:id/end', (req, res) => {
  const existing = db.prepare('SELECT * FROM play_status WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Fant ikke status' });
  }
  db.prepare(`UPDATE play_status SET ended_at = datetime('now') WHERE id = ?`).run(req.params.id);
  broadcastLocal(req.app.get('io'));

  const child = db.prepare('SELECT * FROM family_members WHERE id = ?').get(existing.child_id);
  broadcastLocalStatus({
    statusId: existing.id,
    childName: child?.name,
    location: existing.location,
    emoji: existing.emoji,
    startedAt: existing.started_at,
    expiresAt: existing.expires_at,
    ended: true,
  });

  res.status(204).end();
});

export default router;
