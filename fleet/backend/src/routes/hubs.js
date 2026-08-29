import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAdminAuth, SESSION_COOKIE } from '../middleware/requireAdminAuth.js';

const router = Router();

// Statusprikk regnes ut her (server-side, én kilde til sannhet), ikke i
// dashbordet – grønn = sett siste time, gul = 1-48t, rød = over 48t/aldri sett.
function statusColor(sistSett) {
  if (!sistSett) return 'rod';
  const ageMs = Date.now() - new Date(sistSett.replace(' ', 'T') + 'Z').getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours <= 1) return 'gronn';
  if (hours <= 48) return 'gul';
  return 'rod';
}

function withStatus(hub) {
  const status = db.prepare('SELECT * FROM hub_status WHERE hub_id = ?').get(hub.hub_id);
  const cfg = db.prepare('SELECT * FROM hub_config WHERE hub_id = ?').get(hub.hub_id);
  return {
    ...hub,
    status: status || null,
    statusFarge: statusColor(status?.sist_sett),
    config: cfg ? { ...cfg, moduler: JSON.parse(cfg.moduler_json || '[]') } : null,
  };
}

// Registrerer en NY hub – kalt ENTEN av oppsettskommandoen på selve hub-en
// (delt oppsetts-token, FLEET_SETUP_TOKEN, siden det skjer fra en
// kommandolinje uten nettleserøkt) ELLER av en innlogget admin direkte fra
// dashbordet ("Legg til hub"-knappen).
router.post('/register', (req, res) => {
  let authorized = false;
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) {
    try {
      jwt.verify(cookieToken, config.jwtSecret);
      authorized = true;
    } catch {
      // ugyldig/utløpt admin-økt – fall gjennom til oppsett-token-sjekken under
    }
  }
  if (!authorized) {
    if (!config.setupToken) {
      return res.status(500).json({ error: 'FLEET_SETUP_TOKEN er ikke satt på fleet-tjenesten' });
    }
    if (req.headers['x-fleet-setup-token'] !== config.setupToken) {
      return res.status(403).json({ error: 'Ugyldig oppsett-token' });
    }
  }
  const { kundenavn, kontaktEpost, adresseNotat } = req.body || {};
  if (!kundenavn?.trim()) {
    return res.status(400).json({ error: 'Kundenavn er påkrevd' });
  }
  const hubId = `hub_${crypto.randomBytes(8).toString('hex')}`;
  const apiKey = crypto.randomBytes(24).toString('base64url');
  const apiKeyHash = bcrypt.hashSync(apiKey, 10);

  db.prepare(
    `INSERT INTO hubs (hub_id, api_key_hash, kundenavn, kontakt_epost, adresse_notat) VALUES (?, ?, ?, ?, ?)`
  ).run(hubId, apiKeyHash, kundenavn.trim(), kontaktEpost || null, adresseNotat || null);
  db.prepare(`INSERT INTO hub_config (hub_id) VALUES (?)`).run(hubId);

  // api_key vises KUN her, én gang – kun hashen lagres.
  res.status(201).json({ hubId, apiKey });
});

router.get('/', requireAdminAuth, (req, res) => {
  const hubs = db.prepare('SELECT * FROM hubs ORDER BY created_at DESC').all();
  res.json(hubs.map(withStatus));
});

router.get('/:hubId', requireAdminAuth, (req, res) => {
  const hub = db.prepare('SELECT * FROM hubs WHERE hub_id = ?').get(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Fant ikke hub' });
  const errors = db
    .prepare('SELECT * FROM hub_errors WHERE hub_id = ? ORDER BY tidspunkt DESC LIMIT 50')
    .all(req.params.hubId);
  const history = db
    .prepare('SELECT * FROM hub_status_history WHERE hub_id = ? ORDER BY sist_sett DESC LIMIT 100')
    .all(req.params.hubId);
  const history_json = db
    .prepare('SELECT * FROM config_history WHERE hub_id = ? ORDER BY tidspunkt DESC LIMIT 30')
    .all(req.params.hubId);
  res.json({ ...withStatus(hub), errors, statusHistory: history.reverse(), configHistory: history_json });
});

router.patch('/:hubId', requireAdminAuth, (req, res) => {
  const hub = db.prepare('SELECT * FROM hubs WHERE hub_id = ?').get(req.params.hubId);
  if (!hub) return res.status(404).json({ error: 'Fant ikke hub' });
  const { kundenavn, kontaktEpost, adresseNotat, notater, aktiv } = req.body || {};
  const merged = {
    kundenavn: kundenavn !== undefined ? kundenavn : hub.kundenavn,
    kontakt_epost: kontaktEpost !== undefined ? kontaktEpost : hub.kontakt_epost,
    adresse_notat: adresseNotat !== undefined ? adresseNotat : hub.adresse_notat,
    notater: notater !== undefined ? notater : hub.notater,
    aktiv: aktiv !== undefined ? (aktiv ? 1 : 0) : hub.aktiv,
  };
  db.prepare(
    `UPDATE hubs SET kundenavn = @kundenavn, kontakt_epost = @kontakt_epost, adresse_notat = @adresse_notat,
       notater = @notater, aktiv = @aktiv WHERE hub_id = @hub_id`
  ).run({ ...merged, hub_id: req.params.hubId });
  res.json(withStatus(db.prepare('SELECT * FROM hubs WHERE hub_id = ?').get(req.params.hubId)));
});

export default router;
