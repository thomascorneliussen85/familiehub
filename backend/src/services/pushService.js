import webpush from 'web-push';
import { db } from '../db/index.js';

// VAPID-nøkkelparet identifiserer DENNE FamilieHub-installasjonen overfor
// nettleser-push-tjenestene (Apple/Google/Mozilla) – genereres én gang og
// lagres i app_config, slik at eksisterende abonnementer (telefonene som har
// skrudd på varsler) fortsetter å virke etter en restart/redeploy, uten et
// manuelt .env-steg.
function getOrCreateVapidKeys() {
  const existing = db.prepare("SELECT key, value FROM app_config WHERE key IN ('vapid_public_key', 'vapid_private_key')").all();
  const found = Object.fromEntries(existing.map((r) => [r.key, r.value]));
  if (found.vapid_public_key && found.vapid_private_key) {
    return { publicKey: found.vapid_public_key, privateKey: found.vapid_private_key };
  }
  const generated = webpush.generateVAPIDKeys();
  const upsert = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  upsert.run('vapid_public_key', generated.publicKey);
  upsert.run('vapid_private_key', generated.privateKey);
  console.log('🔑 Genererte nytt VAPID-nøkkelpar for web push-varsler.');
  return { publicKey: generated.publicKey, privateKey: generated.privateKey };
}

const vapidKeys = getOrCreateVapidKeys();
webpush.setVapidDetails('mailto:familiehub@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

export function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

export async function sendPushToFamily(familyId, payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE family_id = ?').all(familyId);
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const keys = JSON.parse(sub.keys_json);
        await webpush.sendNotification({ endpoint: sub.endpoint, keys }, body);
      } catch (err) {
        // 404/410 = abonnementet finnes ikke lenger på nettleser-siden
        // (avinstallert, tømt nettleserdata, e.l.) – rydd det bort stille.
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error('Feil ved sending av push-varsel:', err.message);
        }
      }
    })
  );
}
