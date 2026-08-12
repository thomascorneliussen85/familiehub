import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { decryptSecret } from '../services/financeCrypto.js';
import { startConsent, listAccounts, listAspsps } from '../services/enableBankingClient.js';

const router = Router();
router.use(requireAuth);
// requireFamilyPin brukes PER RUTE her, IKKE globalt: /eb-callback nås av en
// vanlig nettleser-omdirigering FRA Enable Banking sine servere etter
// samtykke i banken – en slik omdirigering kan umulig sende med den
// egendefinerte x-parent-pin-headeren, så den ruten kan bare kreve
// requireAuth (familiens innloggingscookie følger med redirecten siden den
// går til vårt eget domene).

// Begge nivåer må være på for at noe skal faktisk gjøre et kall mot Enable
// Banking – global ENABLE_BANKING_ACTIVE OG familiens egen bryter (satt via
// financeSetup.js). Rutene finnes uansett, men svarer "ikke aktivert" i
// stedet for å prøve å nå en tjeneste familien ikke har satt opp ennå.
function getActiveConfig(familyId) {
  if (!config.enableBankingActive) return null;
  const cfg = db.prepare('SELECT * FROM finance_config WHERE family_id = ?').get(familyId);
  if (!cfg?.enable_banking_active || !cfg.enable_banking_app_id || !cfg.enable_banking_pem_encrypted) return null;
  return { appId: cfg.enable_banking_app_id, pem: decryptSecret(cfg.enable_banking_pem_encrypted), domain: cfg.domain };
}

router.get('/aspsps', requireFamilyPin, async (req, res) => {
  const active = getActiveConfig(req.familyId);
  if (!active) return res.status(409).json({ error: 'Enable Banking er ikke aktivert', enabled: false });
  try {
    const country = req.query.country || 'NO';
    res.json(await listAspsps(active.appId, active.pem, country));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Starter samtykkeflyten mot en gitt bank – returnerer en URL frontend
// omdirigerer familien til (BankID-innlogging hos banken selv).
router.post('/connect', requireFamilyPin, async (req, res) => {
  const active = getActiveConfig(req.familyId);
  if (!active) return res.status(409).json({ error: 'Enable Banking er ikke aktivert', enabled: false });
  const { aspspName, aspspCountry } = req.body || {};
  if (!aspspName || !aspspCountry) return res.status(400).json({ error: 'aspspName og aspspCountry er påkrevd' });
  if (!active.domain) {
    return res.status(400).json({ error: 'Domene må settes i Oppsett før du kan koble til en bank (brukes som redirect-URL).' });
  }
  try {
    const redirectUrl = `https://${active.domain}/api/finance-banking/eb-callback`;
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const consent = await startConsent(active.appId, active.pem, {
      aspspName,
      aspspCountry,
      redirectUrl,
      validUntil,
    });
    res.json({ url: consent.url, sessionId: consent.session_id || consent.sessionId });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Enable Banking sender familien tilbake hit etter samtykke i banken.
// MERK: eksakt query-parameter (code/session_id) og responsformen fra
// listAccounts() er ikke verifisert mot en ekte sandbox – se
// enableBankingClient.js. Kobler foreløpig bare til de kontoene familien
// allerede har opprettet manuelt (matchet på kontonavn), siden vi ikke kan
// teste den ekte kontolisten uten reell tilgang.
router.get('/eb-callback', async (req, res) => {
  const active = getActiveConfig(req.familyId);
  if (!active) return res.status(409).json({ error: 'Enable Banking er ikke aktivert' });
  const sessionId = req.query.session_id || req.query.code;
  if (!sessionId) return res.status(400).json({ error: 'Mangler session_id fra Enable Banking' });
  try {
    const session = await listAccounts(active.appId, active.pem, sessionId);
    res.json({ ok: true, session });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/accounts/:id/consent-status', requireFamilyPin, (req, res) => {
  const account = db
    .prepare('SELECT id, consent_expires_at, eb_account_id FROM finance_accounts WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!account) return res.status(404).json({ error: 'Konto ikke funnet' });
  const connected = Boolean(account.eb_account_id);
  const daysLeft = account.consent_expires_at
    ? Math.ceil((new Date(account.consent_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  res.json({ connected, consentExpiresAt: account.consent_expires_at, daysLeft });
});

export default router;
