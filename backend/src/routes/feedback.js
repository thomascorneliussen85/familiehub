import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getOwnerFamilyId } from '../services/ownerFamily.js';

const router = Router();
router.use(requireAuth);

router.post('/', (req, res) => {
  const message = (req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'Meldingen kan ikke være tom' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Meldingen er for lang' });
  }
  const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 200) : null;
  db.prepare('INSERT INTO feedback (family_id, user_id, message, page) VALUES (?, ?, ?, ?)').run(
    req.familyId,
    req.userId,
    message,
    page
  );
  res.status(201).json({ ok: true });
});

// Aggregerer på tvers av familier – kun installasjonens eier skal se dette.
router.get('/', (req, res) => {
  if (req.familyId !== getOwnerFamilyId()) {
    return res.status(403).json({ error: 'Tilbakemeldinger er kun tilgjengelig for hovedfamilien' });
  }
  const rows = db
    .prepare(
      `SELECT feedback.id, feedback.message, feedback.page, feedback.resolved, feedback.created_at,
              families.name AS family_name, users.email AS user_email
       FROM feedback
       JOIN families ON families.id = feedback.family_id
       LEFT JOIN users ON users.id = feedback.user_id
       ORDER BY feedback.resolved ASC, feedback.created_at DESC`
    )
    .all();
  res.json(rows);
});

router.patch('/:id/resolve', (req, res) => {
  if (req.familyId !== getOwnerFamilyId()) {
    return res.status(403).json({ error: 'Tilbakemeldinger er kun tilgjengelig for hovedfamilien' });
  }
  const resolved = req.body?.resolved ? 1 : 0;
  const result = db.prepare('UPDATE feedback SET resolved = ? WHERE id = ?').run(resolved, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Fant ikke tilbakemeldingen' });
  }
  res.status(204).end();
});

export default router;
