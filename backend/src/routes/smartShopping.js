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
  autocomplete,
  getQuickPicks,
  recordHistoryChoice,
} from '../services/smartShoppingService.js';

const router = Router();
router.use(requireAuth);

router.get('/autocomplete', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) return res.json({ history: [], suggestions: [] });
  res.json(await autocomplete(req.familyId, q));
});

router.get('/quick-picks', (req, res) => {
  res.json(getQuickPicks(req.familyId));
});

// Oppretter en ny handleliste-linje MED en allerede kjent EAN (fra
// autocomplete-dropdownen eller et hurtigvalg) – i motsetning til den vanlige
// POST /api/shopping, som alltid lagrer ren fritekst uten ean.
router.post('/choose', async (req, res) => {
  const { searchTerm, ean, name } = req.body || {};
  if (!ean || !name) return res.status(400).json({ error: 'ean og name er påkrevd' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM shopping_items WHERE family_id = ?').get(req.familyId).m;
  const info = db
    .prepare('INSERT INTO shopping_items (family_id, name, ean, position) VALUES (?, ?, ?, ?)')
    .run(req.familyId, name, ean, maxPos + 1);
  recordHistoryChoice(req.familyId, searchTerm || name, ean, name);
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(info.lastInsertRowid);
  await matchShoppingItem(req.familyId, item).catch((err) => console.error('Smart handleliste (velg):', err.message));

  const io = req.app.get('io');
  io.to(`family:${req.familyId}`).emit(
    'shopping:update',
    db.prepare('SELECT * FROM shopping_items WHERE family_id = ? ORDER BY checked ASC, position ASC, id ASC').all(req.familyId)
  );
  io.to(`family:${req.familyId}`).emit('smart-shopping:update');
  res.status(201).json(item);
});

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
  recordHistoryChoice(req.familyId, item.name, ean, productName || item.name);
  // Setter ean direkte på linjen også – da slipper vi fuzzy-søk for akkurat
  // denne raden fra nå av, selv om varen skulle fjernes og legges til igjen
  // med en annen ordlyd (item_locks/item_history dekker det tilfellet).
  db.prepare('UPDATE shopping_items SET ean = ? WHERE id = ?').run(ean, item.id);
  const updatedItem = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(item.id);
  await matchShoppingItem(req.familyId, updatedItem).catch((err) => console.error('Smart handleliste (lås):', err.message));
  const io = req.app.get('io');
  io.to(`family:${req.familyId}`).emit('smart-shopping:update');
  io.to(`family:${req.familyId}`).emit(
    'shopping:update',
    db.prepare('SELECT * FROM shopping_items WHERE family_id = ? ORDER BY checked ASC, position ASC, id ASC').all(req.familyId)
  );
  res.json({ item: updatedItem, matches: getItemMatches(item.id) });
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
