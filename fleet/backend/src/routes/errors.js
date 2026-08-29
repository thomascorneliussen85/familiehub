import { Router } from 'express';
import { db } from '../db/index.js';
import { requireHubAuth } from '../middleware/requireHubAuth.js';

const router = Router();

const MAX_LEN = 2000;

// Mottar feilmeldinger fra en hub – klienten skal ha strippet navn/verdier
// FØR sending (se fleetClient.js sin stripPii), men vi trimmer i tillegg
// til en fornuftig lengde her, og lagrer aldri mer enn det som sendes inn.
router.post('/', requireHubAuth, (req, res) => {
  const { errors } = req.body || {};
  if (!Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ error: 'errors må være en ikke-tom liste' });
  }
  const insert = db.prepare(
    `INSERT INTO hub_errors (hub_id, feiltype, melding, stacktrace) VALUES (?, ?, ?, ?)`
  );
  const insertMany = db.transaction((rows) => {
    for (const e of rows.slice(0, 50)) {
      insert.run(
        req.hub.hub_id,
        String(e.feiltype || 'ukjent').slice(0, 100),
        String(e.melding || '').slice(0, MAX_LEN),
        e.stacktrace ? String(e.stacktrace).slice(0, MAX_LEN) : null
      );
    }
  });
  insertMany(errors);
  res.status(204).end();
});

export default router;
