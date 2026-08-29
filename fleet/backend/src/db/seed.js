import bcrypt from 'bcrypt';
import { db } from './index.js';

const DEFAULT_MODULES = [
  'kalender', 'gjoremal', 'handleliste', 'prissjekk', 'gps', 'smarthjem', 'strompris', 'varme',
  'kamera', 'dorklokke', 'babycall', 'roykvarsler', 'vannalarm', 'helse', 'morgenbrief',
  'ut_og_leke', 'fotoramme', 'vaer_buss',
];

function upsertHub({ hubId, apiKey, kundenavn, kontaktEpost, adresseNotat, notater, installertDato }) {
  const existing = db.prepare('SELECT 1 FROM hubs WHERE hub_id = ?').get(hubId);
  if (existing) {
    console.log(`Hub ${hubId} finnes allerede, hopper over.`);
    return;
  }
  const apiKeyHash = bcrypt.hashSync(apiKey, 10);
  db.prepare(
    `INSERT INTO hubs (hub_id, api_key_hash, kundenavn, kontakt_epost, adresse_notat, notater, installert_dato)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(hubId, apiKeyHash, kundenavn, kontaktEpost, adresseNotat, notater, installertDato);
  db.prepare(`INSERT INTO hub_config (hub_id, moduler_json) VALUES (?, ?)`).run(hubId, JSON.stringify(DEFAULT_MODULES));
  console.log(`Opprettet demo-hub: ${kundenavn} (${hubId}), api-nøkkel: ${apiKey}`);
}

// Demo-hub 1: sunn, nylig sett, grønn status.
upsertHub({
  hubId: 'hub_demo0000000001',
  apiKey: 'demo-nokkel-familien-hansen-0001',
  kundenavn: 'Familien Hansen',
  kontaktEpost: 'hansen@example.com',
  adresseNotat: 'Bergen',
  notater: 'Installert 15.3. Ønsker ikke GPS-modul.',
  installertDato: '2026-03-15',
});
db.prepare(
  `INSERT OR REPLACE INTO hub_status (hub_id, sist_sett, app_versjon, oppetid_sekunder, fri_diskplass_mb, minnebruk_prosent, antall_tilkoblede_enheter, os_versjon)
   VALUES (?, datetime('now'), '1.4.2', 259200, 12400, 34.2, 3, 'Ubuntu 24.04')`
).run('hub_demo0000000001');
db.prepare(`UPDATE hub_config SET moduler_json = ? WHERE hub_id = ?`).run(
  JSON.stringify(DEFAULT_MODULES.filter((m) => m !== 'gps')),
  'hub_demo0000000001'
);

// Demo-hub 2: ikke sett på 3 dager (rød), utløpt abonnement, én registrert feil.
upsertHub({
  hubId: 'hub_demo0000000002',
  apiKey: 'demo-nokkel-familien-berg-0002',
  kundenavn: 'Familien Berg',
  kontaktEpost: 'berg@example.com',
  adresseNotat: 'Trondheim',
  notater: 'Betalingspåminnelse sendt 1.8.',
  installertDato: '2026-01-10',
});
db.prepare(
  `INSERT OR REPLACE INTO hub_status (hub_id, sist_sett, app_versjon, oppetid_sekunder, fri_diskplass_mb, minnebruk_prosent, antall_tilkoblede_enheter, os_versjon)
   VALUES (?, datetime('now', '-72 hours'), '1.4.0', 86400, 3200, 71.8, 1, 'Ubuntu 22.04')`
).run('hub_demo0000000002');
db.prepare(`UPDATE hub_config SET abonnement_status = 'utlopt' WHERE hub_id = ?`).run('hub_demo0000000002');
db.prepare(
  `INSERT INTO hub_errors (hub_id, tidspunkt, feiltype, melding, stacktrace) VALUES (?, datetime('now', '-4 hours'), ?, ?, ?)`
).run(
  'hub_demo0000000002',
  'uncaughtException',
  'ECONNREFUSED ved kall mot ekstern værtjeneste',
  'Error: connect ECONNREFUSED\n    at TCPConnectWrap.afterConnect [as oncomplete]'
);

console.log('Seeding ferdig.');
process.exit(0);
