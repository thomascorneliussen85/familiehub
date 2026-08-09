import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getPlayStatusSnapshot } from '../services/playStatusService.js';
import { getSetting } from '../services/settingsStore.js';
import { broadcastLocalStatus, getOwnerFamilyId } from '../services/relayClient.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

function expiryHours(familyId) {
  const stored = getSetting(familyId, 'play_status_expiry_hours');
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : config.playStatus.expiryHours;
}

// En endring hos én familie påvirker "friends"-listen til ALLE andre
// familier på installasjonen (siden de nå deler lekestatus direkte med
// hverandre), så alle må få sin egen, personlige oppdatering – ikke bare
// familien som faktisk endret noe.
function broadcastLocal(io) {
  const ownerFamilyId = getOwnerFamilyId();
  const families = db.prepare('SELECT id FROM families').all();
  for (const { id } of families) {
    io.to(`family:${id}`).emit('play-status:update', getPlayStatusSnapshot(id, { includeFriends: id === ownerFamilyId }));
  }
}

router.get('/', (req, res) => {
  const includeFriends = req.familyId === getOwnerFamilyId();
  res.json(getPlayStatusSnapshot(req.familyId, { includeFriends }));
});

router.post('/', (req, res) => {
  const { childId, location, emoji } = req.body;
  if (!childId || !location) {
    return res.status(400).json({ error: 'Barn og sted er påkrevd' });
  }
  const child = db
    .prepare(`SELECT * FROM family_members WHERE id = ? AND family_id = ? AND role = 'barn'`)
    .get(childId, req.familyId);
  if (!child) {
    return res.status(404).json({ error: 'Fant ikke barnet' });
  }

  db.prepare(`UPDATE play_status SET ended_at = datetime('now') WHERE child_id = ? AND ended_at IS NULL`).run(
    childId
  );

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + expiryHours(req.familyId) * 60 * 60 * 1000).toISOString();
  const info = db
    .prepare('INSERT INTO play_status (child_id, location, emoji, expires_at) VALUES (?, ?, ?, ?)')
    .run(childId, location, emoji || null, expiresAt);

  broadcastLocal(req.app.get('io'));
  if (req.familyId === getOwnerFamilyId()) {
    broadcastLocalStatus({
      statusId: info.lastInsertRowid,
      childName: child.name,
      location,
      emoji: emoji || null,
      startedAt: startedAt.toISOString(),
      expiresAt,
      ended: false,
    });
  }

  const status = db
    .prepare(
      `SELECT ps.*, m.name AS child_name, m.color AS child_color, m.avatar AS child_avatar
       FROM play_status ps JOIN family_members m ON m.id = ps.child_id WHERE ps.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(status);
});

router.post('/:id/end', (req, res) => {
  const existing = db
    .prepare(
      `SELECT ps.* FROM play_status ps JOIN family_members m ON m.id = ps.child_id
       WHERE ps.id = ? AND m.family_id = ?`
    )
    .get(req.params.id, req.familyId);
  if (!existing) {
    return res.status(404).json({ error: 'Fant ikke status' });
  }
  db.prepare(`UPDATE play_status SET ended_at = datetime('now') WHERE id = ?`).run(req.params.id);
  broadcastLocal(req.app.get('io'));

  if (req.familyId === getOwnerFamilyId()) {
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
  }

  res.status(204).end();
});

export default router;
