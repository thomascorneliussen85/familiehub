import { Router } from 'express';
import { db } from '../db/index.js';
import { requireHubAuth } from '../middleware/requireHubAuth.js';
import { sanitizeTelemetry } from '../../../shared/telemetryWhitelist.js';

const router = Router();

// Mottar telemetri fra en hub – validerer mot den delte whitelisten selv om
// klienten allerede skal ha gjort det samme (aldri stol kun på klientsiden).
// sist_sett settes til tjenestens EGET tidspunkt ved mottak, sendes aldri av
// klienten – umulig å forfalske "jeg er fortsatt i live" med en gammel verdi.
router.post('/', requireHubAuth, (req, res) => {
  const clean = sanitizeTelemetry(req.body);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const hubId = req.hub.hub_id;

  db.prepare(
    `INSERT INTO hub_status (hub_id, sist_sett, app_versjon, oppetid_sekunder, fri_diskplass_mb, minnebruk_prosent, antall_tilkoblede_enheter, os_versjon)
     VALUES (@hub_id, @sist_sett, @app_versjon, @oppetid_sekunder, @fri_diskplass_mb, @minnebruk_prosent, @antall_tilkoblede_enheter, @os_versjon)
     ON CONFLICT(hub_id) DO UPDATE SET
       sist_sett = excluded.sist_sett, app_versjon = excluded.app_versjon, oppetid_sekunder = excluded.oppetid_sekunder,
       fri_diskplass_mb = excluded.fri_diskplass_mb, minnebruk_prosent = excluded.minnebruk_prosent,
       antall_tilkoblede_enheter = excluded.antall_tilkoblede_enheter, os_versjon = excluded.os_versjon`
  ).run({
    hub_id: hubId,
    sist_sett: now,
    app_versjon: clean.app_versjon ?? null,
    oppetid_sekunder: clean.oppetid_sekunder ?? null,
    fri_diskplass_mb: clean.fri_diskplass_mb ?? null,
    minnebruk_prosent: clean.minnebruk_prosent ?? null,
    antall_tilkoblede_enheter: clean.antall_tilkoblede_enheter ?? null,
    os_versjon: clean.os_versjon ?? null,
  });

  db.prepare(
    `INSERT INTO hub_status_history (hub_id, sist_sett, oppetid_sekunder, fri_diskplass_mb, minnebruk_prosent, antall_tilkoblede_enheter)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(hubId, now, clean.oppetid_sekunder ?? null, clean.fri_diskplass_mb ?? null, clean.minnebruk_prosent ?? null, clean.antall_tilkoblede_enheter ?? null);

  res.status(204).end();
});

export default router;
