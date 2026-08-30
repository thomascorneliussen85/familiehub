import { db } from '../db/index.js';

// Butikksjef-PIN for admin-handlinger (legge til/fjerne ansatte, endre
// oppgavemaler, sette opp temperaturenheter) – samme mønster som
// FamilieHub sin foreldre-PIN. Vanlige daglige handlinger (fullføre
// oppgave, logge temperatur, melde tomt-for-vare) krever IKKE PIN, siden
// alle 10 ansatte skal kunne bruke nettbrettet uten friksjon.
export function requirePin(req, res, next) {
  const row = db.prepare('SELECT value FROM settings WHERE butikk_id = ? AND key = ?').get(req.butikkId, 'butikksjef_pin');
  const pin = row?.value || '1234';
  if (req.headers['x-butikksjef-pin'] !== pin) {
    return res.status(403).json({ error: 'Feil PIN-kode' });
  }
  next();
}
