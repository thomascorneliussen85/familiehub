import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { generateBridgeId, generateBridgeApiKey, hashBridgeApiKey } from '../services/cameraBridgeAuth.js';
import { isBridgeOnline } from '../services/cameraBridgeRegistry.js';

const router = Router();
router.use(requireAuth);

router.get('/status', (req, res) => {
  const bridges = db
    .prepare('SELECT id, name, last_seen_at, created_at FROM camera_bridges WHERE family_id = ? ORDER BY id')
    .all(req.familyId);
  res.json({ online: isBridgeOnline(req.familyId), bridges });
});

// Genererer en ny bro-nøkkel. Selve nøkkelen vises kun i dette ene svaret –
// bare hashen lagres i databasen, samme mønster som relay-tjenesten.
router.post('/token', requireFamilyPin, (req, res) => {
  const id = generateBridgeId();
  const apiKey = generateBridgeApiKey();
  db.prepare('INSERT INTO camera_bridges (id, family_id, api_key_hash, name) VALUES (?, ?, ?, ?)').run(
    id,
    req.familyId,
    hashBridgeApiKey(apiKey),
    req.body?.name?.trim() || 'Kamera-bro'
  );
  res.status(201).json({ bridgeId: id, apiKey });
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM camera_bridges WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

export default router;
