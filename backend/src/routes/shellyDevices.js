import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { getBridgeSocket } from '../services/cameraBridgeRegistry.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT id, name, status, device_type, local_ip, model, alarm, alarm_at, last_event, last_event_at
         FROM shelly_devices WHERE family_id = ? ORDER BY id`
      )
      .all(req.familyId)
  );
});

// Navngi/godkjenn en enhet broen har oppdaget. For en røykvarsler ber vi i
// tillegg broen sette opp alarm-webhooken på selve enheten automatisk – det
// er den samme handlingen som å trykke "Legg til", ingen egen "koble til
// varsling"-knapp trengs.
router.patch('/:id', requireFamilyPin, (req, res) => {
  const device = db.prepare('SELECT * FROM shelly_devices WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!device) return res.status(404).json({ error: 'Enhet ikke funnet' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd' });

  let webhookToken = device.webhook_token;
  if (device.device_type === 'smoke' && !webhookToken) {
    webhookToken = randomBytes(24).toString('base64url');
  }

  db.prepare("UPDATE shelly_devices SET name = ?, status = 'active', webhook_token = ? WHERE id = ?").run(
    name,
    webhookToken,
    device.id
  );

  if (device.device_type === 'smoke') {
    const bridgeSocket = getBridgeSocket(req.familyId);
    bridgeSocket?.emit('shelly:configure-webhook', {
      localIp: device.local_ip,
      webhookToken,
      deviceType: device.device_type,
    });
  }

  req.app.get('io').to(`family:${req.familyId}`).emit('shelly:update');
  res.json({ id: device.id, name, status: 'active' });
});

router.delete('/:id', requireFamilyPin, (req, res) => {
  db.prepare('DELETE FROM shelly_devices WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('shelly:update');
  res.status(204).end();
});

export default router;
