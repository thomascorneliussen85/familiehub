import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getVapidPublicKey, sendPushToFamily } from '../services/pushService.js';

const router = Router();
router.use(requireAuth);

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Ugyldig push-abonnement' });
  }
  db.prepare(
    `INSERT INTO push_subscriptions (family_id, user_id, endpoint, keys_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET family_id = excluded.family_id, user_id = excluded.user_id, keys_json = excluded.keys_json`
  ).run(req.familyId, req.userId, endpoint, JSON.stringify(keys));
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND family_id = ?').run(endpoint, req.familyId);
  }
  res.status(204).end();
});

router.post('/test', async (req, res) => {
  await sendPushToFamily(req.familyId, {
    title: '🔔 Test-varsel fra FamilieHub',
    body: 'Hvis du ser denne, virker push-varsler på denne enheten.',
    tag: 'test',
  });
  res.json({ ok: true });
});

export default router;
