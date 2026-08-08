import { db } from '../db/index.js';

// Fase 1-begrensning: noen integrasjoner (Xplora/Traccar-GPS, "Ut og
// leke"-relay) bruker fortsatt én delt konto/tilkobling for hele
// installasjonen, ikke én per familie ennå. De knyttes til "hovedfamilien"
// – den første som ble opprettet (installasjonens eier) – i stedet for å
// gjette hvilken familie som skal eie dataen.
export function getOwnerFamilyId() {
  return db.prepare('SELECT id FROM families ORDER BY id LIMIT 1').get()?.id ?? null;
}
