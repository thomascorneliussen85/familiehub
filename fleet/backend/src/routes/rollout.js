import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

const router = Router();
router.use(requireAdminAuth);

const TEST_PERIOD_HOURS = 24;

function getState() {
  return db.prepare('SELECT * FROM rollout_state WHERE id = 1').get();
}

// Sjekker om testhuben er klar for full utrulling: må ha vært testhub i
// minst 24t, vist grønn status nå, og ikke hatt noen feil registrert etter
// at testperioden startet. Alt regnes ut server-side – dashbordet stoler
// aldri på egne klokke-/tilstandsberegninger for denne dørvakten.
function readiness(state) {
  if (!state?.test_hub_id || !state.test_started_at) {
    return { ready: false, reason: 'Ingen testhub er valgt ennå.' };
  }
  const startedMs = new Date(state.test_started_at.replace(' ', 'T') + 'Z').getTime();
  const hoursSince = (Date.now() - startedMs) / (1000 * 60 * 60);
  if (hoursSince < TEST_PERIOD_HOURS) {
    return { ready: false, reason: `Testperioden er ikke fullført ennå (${hoursSince.toFixed(1)} av ${TEST_PERIOD_HOURS} timer).` };
  }
  const status = db.prepare('SELECT * FROM hub_status WHERE hub_id = ?').get(state.test_hub_id);
  const ageHours = status?.sist_sett ? (Date.now() - new Date(status.sist_sett.replace(' ', 'T') + 'Z').getTime()) / (1000 * 60 * 60) : Infinity;
  if (ageHours > 1) {
    return { ready: false, reason: 'Testhuben er ikke grønn (sett innen siste time) akkurat nå.' };
  }
  const errorCount = db
    .prepare('SELECT COUNT(*) AS n FROM hub_errors WHERE hub_id = ? AND tidspunkt >= ?')
    .get(state.test_hub_id, state.test_started_at).n;
  if (errorCount > 0) {
    return { ready: false, reason: `Testhuben har registrert ${errorCount} feil siden testperioden startet.` };
  }
  return { ready: true, reason: null };
}

router.get('/', (req, res) => {
  const state = getState();
  res.json({ ...state, ...readiness(state) });
});

router.post('/start-test', (req, res) => {
  const { hubId, malversjon } = req.body || {};
  if (!hubId || !malversjon?.trim()) {
    return res.status(400).json({ error: 'hubId og målversjon er påkrevd' });
  }
  const hub = db.prepare('SELECT * FROM hubs WHERE hub_id = ? AND aktiv = 1').get(hubId);
  if (!hub) return res.status(404).json({ error: 'Fant ikke en aktiv hub med denne id-en' });

  db.prepare('UPDATE rollout_state SET test_hub_id = ?, test_started_at = datetime(\'now\'), malversjon = ? WHERE id = 1').run(
    hubId,
    malversjon.trim()
  );
  db.prepare(`UPDATE hub_config SET onsket_app_versjon = ?, config_versjon = config_versjon + 1 WHERE hub_id = ?`).run(
    malversjon.trim(),
    hubId
  );
  db.prepare(`INSERT INTO config_history (hub_id, endret_av, endring_json) VALUES (?, 'admin', ?)`).run(
    hubId,
    JSON.stringify({ type: 'start_test', malversjon: malversjon.trim() })
  );
  res.status(201).json(getState());
});

// Ruller ut til ALLE andre aktive hubber – hard sperre server-side (ikke
// bare et UI-hint) hvis testperioden ikke er bekreftet fullført og feilfri.
router.post('/deploy-rest', (req, res) => {
  const state = getState();
  const check = readiness(state);
  if (!check.ready) {
    return res.status(400).json({ error: `Kan ikke rulle ut ennå: ${check.reason}` });
  }
  const others = db.prepare('SELECT hub_id FROM hubs WHERE aktiv = 1 AND hub_id != ?').all(state.test_hub_id);
  const update = db.prepare(`UPDATE hub_config SET onsket_app_versjon = ?, config_versjon = config_versjon + 1 WHERE hub_id = ?`);
  const logHistory = db.prepare(`INSERT INTO config_history (hub_id, endret_av, endring_json) VALUES (?, 'admin', ?)`);
  const tx = db.transaction(() => {
    for (const { hub_id } of others) {
      update.run(state.malversjon, hub_id);
      logHistory.run(hub_id, JSON.stringify({ type: 'deploy_rest', malversjon: state.malversjon }));
    }
  });
  tx();
  res.json({ utrullet: others.length, malversjon: state.malversjon });
});

// Sett ønsket versjon for én enkelt hub direkte, uavhengig av test-arbeidsflyten.
router.post('/deploy-one', (req, res) => {
  const { hubId, versjon } = req.body || {};
  if (!hubId || !versjon?.trim()) {
    return res.status(400).json({ error: 'hubId og versjon er påkrevd' });
  }
  const cfg = db.prepare('SELECT * FROM hub_config WHERE hub_id = ?').get(hubId);
  if (!cfg) return res.status(404).json({ error: 'Fant ikke hub' });
  db.prepare(`UPDATE hub_config SET onsket_app_versjon = ?, config_versjon = config_versjon + 1 WHERE hub_id = ?`).run(
    versjon.trim(),
    hubId
  );
  db.prepare(`INSERT INTO config_history (hub_id, endret_av, endring_json) VALUES (?, 'admin', ?)`).run(
    hubId,
    JSON.stringify({ type: 'deploy_one', versjon: versjon.trim() })
  );
  res.status(204).end();
});

export default router;
