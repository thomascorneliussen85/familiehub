import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getOwnerFamilyId } from '../services/ownerFamily.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['planned', 'in_progress', 'done'];

function requireOwnerFamily(req, res, next) {
  if (req.familyId !== getOwnerFamilyId()) {
    return res.status(403).json({ error: 'Kun tilgjengelig for hovedfamilien' });
  }
  next();
}

// Delt referansedata – alle innloggede familier kan se veikartet.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM roadmap_items ORDER BY sort_order ASC, created_at ASC').all();
  res.json(rows);
});

router.post('/', requireOwnerFamily, (req, res) => {
  const title = (req.body?.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Tittel er påkrevd' });
  }
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const status = STATUSES.includes(req.body?.status) ? req.body.status : 'planned';
  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM roadmap_items').get().m ?? -1;
  const result = db
    .prepare('INSERT INTO roadmap_items (title, description, status, sort_order) VALUES (?, ?, ?, ?)')
    .run(title, description, status, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM roadmap_items WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id', requireOwnerFamily, (req, res) => {
  const existing = db.prepare('SELECT * FROM roadmap_items WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Fant ikke elementet' });
  }
  const title = req.body?.title !== undefined ? req.body.title.trim() : existing.title;
  const description = req.body?.description !== undefined ? req.body.description.trim() : existing.description;
  const status = STATUSES.includes(req.body?.status) ? req.body.status : existing.status;
  if (!title) {
    return res.status(400).json({ error: 'Tittel er påkrevd' });
  }
  db.prepare('UPDATE roadmap_items SET title = ?, description = ?, status = ? WHERE id = ?').run(
    title,
    description,
    status,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM roadmap_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireOwnerFamily, (req, res) => {
  const result = db.prepare('DELETE FROM roadmap_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Fant ikke elementet' });
  }
  res.status(204).end();
});

export default router;
