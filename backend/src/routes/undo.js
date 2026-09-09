import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { restoreDeletion } from '../services/undoService.js';
import { db } from '../db/index.js';
const router = Router();
router.use(requireAuth);
router.post('/:token', (req, res) => {
  try {
    const table = restoreDeletion(req.familyId, req.params.token);
    if (!table) return res.status(404).json({ error: 'Angrefristen er utløpt, eller slettingen er allerede angret.' });
    const room = req.app.get('io').to(`family:${req.familyId}`);
    if (table === 'shopping_items') room.emit('shopping:update', db.prepare('SELECT * FROM shopping_items WHERE family_id = ? ORDER BY checked, position, id').all(req.familyId));
    else room.emit({ calendar_events: 'calendar:update', dinner_plans: 'dinner-plans:update', chores: 'chores:update' }[table], { type: 'restored' });
    res.json({ restored: true });
  } catch {
    res.status(409).json({ error: 'Kan ikke gjenopprette fordi innholdet er endret. Ingen nyere data er overskrevet.' });
  }
});
export default router;
