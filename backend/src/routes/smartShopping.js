import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import {
  getPriceCheckSummary,
  getItemMatches,
  lockItem,
  matchShoppingItem,
  getFamilySettings,
  saveFamilySettings,
  isConfigured,
} from '../services/smartShoppingService.js';

const router = Router();
router.use(requireAuth);

router.get('/price-check', (req, res) => {
  res.json({ ...getPriceCheckSummary(req.familyId), configured: isConfigured() });
});

router.get('/items/:shoppingItemId', (req, res) => {
  const item = db
    .prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?')
    .get(req.params.shoppingItemId, req.familyId);
  if (!item) return res.status(404).json({ error: 'Vare ikke funnet' });
  res.json({ item, matches: getItemMatches(item.id) });
});

router.post('/items/:shoppingItemId/lock', async (req, res) => {
  const item = db
    .prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?')
    .get(req.params.shoppingItemId, req.familyId);
  if (!item) return res.status(404).json({ error: 'Vare ikke funnet' });
  const { ean, productName } = req.body || {};
  if (!ean) return res.status(400).json({ error: 'ean er påkrevd' });
  lockItem(req.familyId, item.name, ean, productName || null);
  await matchShoppingItem(req.familyId, item).catch((err) => console.error('Smart handleliste (lås):', err.message));
  req.app.get('io').to(`family:${req.familyId}`).emit('smart-shopping:update');
  res.json({ item, matches: getItemMatches(item.id) });
});

router.get('/settings', (req, res) => {
  res.json(getFamilySettings(req.familyId));
});

router.patch('/settings', requireFamilyPin, (req, res) => {
  const { enabled, radiusKm, enabledChains } = req.body || {};
  const patch = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (typeof radiusKm === 'number' && radiusKm > 0) patch.radiusKm = radiusKm;
  if (Array.isArray(enabledChains)) patch.enabledChains = enabledChains;
  res.json(saveFamilySettings(req.familyId, patch));
});

export default router;
