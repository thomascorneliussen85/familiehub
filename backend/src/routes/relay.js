import { Router } from 'express';
import { config } from '../config.js';
import {
  getRelayStatus,
  getPendingIncoming,
  listFriendFamilies,
  createPairingCode,
  redeemPairingCode,
  approvePairing,
  removeFriend,
} from '../services/relayClient.js';

const router = Router();

function requirePin(req, res, next) {
  if (req.headers['x-parent-pin'] !== config.parentPin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}

router.post('/verify-pin', (req, res) => {
  res.json({ ok: req.body?.pin === config.parentPin });
});

router.get('/status', (req, res) => {
  res.json(getRelayStatus());
});

router.get('/friend-families', requirePin, (req, res) => {
  res.json(listFriendFamilies());
});

router.get('/pending', requirePin, (req, res) => {
  res.json(getPendingIncoming());
});

router.post('/pairing/create', requirePin, async (req, res) => {
  try {
    const result = await createPairingCode();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pairing/redeem', requirePin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Kode er påkrevd' });
  try {
    const result = await redeemPairingCode(code);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pairing/:pairingId/approve', requirePin, (req, res) => {
  const { approve } = req.body || {};
  try {
    approvePairing(req.params.pairingId, Boolean(approve));
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/friend-families/:friendHubId', requirePin, (req, res) => {
  removeFriend(req.params.friendHubId);
  res.status(204).end();
});

export default router;
