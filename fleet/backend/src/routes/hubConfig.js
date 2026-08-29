import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { requireHubAuth } from '../middleware/requireHubAuth.js';

const router = Router();

const VALID_STATUS = ['aktiv', 'utlopt', 'pause'];
const VALID_CHANNEL = ['stabil', 'test'];

// Hub-en selv henter sin gjeldende konfigurasjon her, hvert 5. minutt –
// autentisert med hub_id + api-nøkkel, ikke admin-innlogging.
router.get('/', requireHubAuth, (req, res) => {
  const cfg = db.prepare('SELECT * FROM hub_config WHERE hub_id = ?').get(req.hub.hub_id);
  if (!cfg) return res.status(404).json({ error: 'Fant ingen konfigurasjon for denne huben' });
  res.json({ ...cfg, moduler: JSON.parse(cfg.moduler_json || '[]') });
});

router.patch('/:hubId', requireAdminAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM hub_config WHERE hub_id = ?').get(req.params.hubId);
  if (!existing) return res.status(404).json({ error: 'Fant ingen konfigurasjon for denne huben' });

  const { abonnementStatus, moduler, oppdateringskanal } = req.body || {};
  if (abonnementStatus !== undefined && !VALID_STATUS.includes(abonnementStatus)) {
    return res.status(400).json({ error: `abonnementStatus må være en av: ${VALID_STATUS.join(', ')}` });
  }
  if (oppdateringskanal !== undefined && !VALID_CHANNEL.includes(oppdateringskanal)) {
    return res.status(400).json({ error: `oppdateringskanal må være en av: ${VALID_CHANNEL.join(', ')}` });
  }

  const next = {
    abonnement_status: abonnementStatus ?? existing.abonnement_status,
    moduler_json: moduler !== undefined ? JSON.stringify(moduler) : existing.moduler_json,
    oppdateringskanal: oppdateringskanal ?? existing.oppdateringskanal,
  };

  db.prepare(
    `UPDATE hub_config SET abonnement_status = @abonnement_status, moduler_json = @moduler_json,
       oppdateringskanal = @oppdateringskanal, config_versjon = config_versjon + 1, updated_at = datetime('now')
     WHERE hub_id = @hub_id`
  ).run({ ...next, hub_id: req.params.hubId });

  db.prepare(`INSERT INTO config_history (hub_id, endret_av, endring_json) VALUES (?, ?, ?)`).run(
    req.params.hubId,
    'admin',
    JSON.stringify(req.body)
  );

  const updated = db.prepare('SELECT * FROM hub_config WHERE hub_id = ?').get(req.params.hubId);
  res.json({ ...updated, moduler: JSON.parse(updated.moduler_json || '[]') });
});

export default router;
