import bcrypt from 'bcrypt';
import { db } from '../db/index.js';

// Autentiserer en HUB (ikke admin) via hub_id + api_key i headere – brukes
// på telemetri/config/feil-endepunktene hub-klienten selv kaller. Helt
// adskilt fra requireAdminAuth (dashbord-innlogging).
export function requireHubAuth(req, res, next) {
  const hubId = req.headers['x-hub-id'];
  const apiKey = req.headers['x-api-key'];
  if (!hubId || !apiKey) {
    return res.status(401).json({ error: 'Mangler hub-id/api-nøkkel' });
  }
  const hub = db.prepare('SELECT * FROM hubs WHERE hub_id = ? AND aktiv = 1').get(hubId);
  if (!hub || !bcrypt.compareSync(apiKey, hub.api_key_hash)) {
    return res.status(401).json({ error: 'Ugyldig hub-id eller api-nøkkel' });
  }
  req.hub = hub;
  next();
}
