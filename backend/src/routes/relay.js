import { Router } from 'express';
import { db } from '../db/index.js';
import {
  getRelayStatus,
  getPendingIncoming,
  listFriendFamilies,
  createPairingCode,
  redeemPairingCode,
  approvePairing,
  removeFriend,
  getOwnerFamilyId,
} from '../services/relayClient.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

// Fase 1-begrensning: venneparing bruker foreløpig én delt relay-tilkobling
// for hele installasjonen (se relayClient.js), så funksjonen er reservert
// hovedfamilien (den første som ble opprettet) helt til per-familie
// relay-identitet er bygget.
function requireOwnerFamily(req, res, next) {
  if (req.familyId !== getOwnerFamilyId()) {
    return res.status(403).json({
      error: 'Venner-funksjonen er foreløpig kun tilgjengelig for hovedfamilien på denne installasjonen',
    });
  }
  next();
}

router.post('/verify-pin', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE family_id = ? AND key = ?').get(req.familyId, 'parent_pin');
  const pin = row?.value || '1234';
  res.json({ ok: req.body?.pin === pin });
});

router.get('/status', (req, res) => {
  res.json(getRelayStatus());
});

router.get('/friend-families', requireFamilyPin, requireOwnerFamily, (req, res) => {
  res.json(listFriendFamilies());
});

router.get('/pending', requireFamilyPin, requireOwnerFamily, (req, res) => {
  res.json(getPendingIncoming());
});

router.post('/pairing/create', requireFamilyPin, requireOwnerFamily, async (req, res) => {
  try {
    const result = await createPairingCode();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pairing/redeem', requireFamilyPin, requireOwnerFamily, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Kode er påkrevd' });
  try {
    const result = await redeemPairingCode(code);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pairing/:pairingId/approve', requireFamilyPin, requireOwnerFamily, (req, res) => {
  const { approve } = req.body || {};
  try {
    approvePairing(req.params.pairingId, Boolean(approve));
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/friend-families/:friendHubId', requireFamilyPin, requireOwnerFamily, (req, res) => {
  removeFriend(req.params.friendHubId);
  res.status(204).end();
});

export default router;
