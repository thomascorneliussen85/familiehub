import { Router } from 'express';
import { db } from '../db/index.js';
import { sendPushToFamily } from '../services/pushService.js';

const router = Router();

// Kalles DIREKTE av selve Shelly-enheten (ikke av en innlogget bruker – en
// fysisk enhet kan ikke logge inn), så det er ingen requireAuth her.
// webhook_token i URL-en ER autentiseringen, akkurat som f.eks. Slack sine
// incoming webhooks. Bevisst en enkel GET, siden det er det Shelly Gen2 sin
// Webhook-komponent selv sender (se camera-bridge/src/shellyWebhook.js).
router.get('/:token', async (req, res) => {
  const device = db.prepare('SELECT * FROM shelly_devices WHERE webhook_token = ?').get(req.params.token);
  if (!device) return res.status(404).end();

  const event = req.query.event || 'unknown';
  const isAlarm = event === 'alarm';
  const isAlarmOff = event === 'alarm_off';

  db.prepare(
    `UPDATE shelly_devices
     SET alarm = ?, alarm_at = CASE WHEN ? THEN datetime('now') ELSE alarm_at END,
         last_event = ?, last_event_at = datetime('now')
     WHERE id = ?`
  ).run(isAlarm ? 1 : isAlarmOff ? 0 : device.alarm, isAlarm ? 1 : 0, event, device.id);

  req.app.get('io').to(`family:${device.family_id}`).emit('shelly:update');

  if (isAlarm) {
    await sendPushToFamily(device.family_id, {
      title: '🚨 Røykvarsler utløst!',
      body: `${device.name} har utløst alarm.`,
      tag: 'smoke-alarm',
    });
  } else if (isAlarmOff) {
    await sendPushToFamily(device.family_id, {
      title: '✅ Røykvarsler avslått',
      body: `${device.name} er ikke lenger i alarm.`,
      tag: 'smoke-alarm',
    });
  }

  res.status(204).end();
});

export default router;
