import { db } from '../db/index.js';

// Erstatter den gamle globale config.parentPin-sjekken – hver familie har nå
// sin egen PIN, lagret i settings (default '1234', samme som før, endres i
// ⚙️ → Innstillinger). Må kjøre ETTER requireAuth (bruker req.familyId).
export function requireFamilyPin(req, res, next) {
  const row = db.prepare('SELECT value FROM settings WHERE family_id = ? AND key = ?').get(req.familyId, 'parent_pin');
  const pin = row?.value || '1234';
  if (req.headers['x-parent-pin'] !== pin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}
