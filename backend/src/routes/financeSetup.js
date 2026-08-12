import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { encryptSecret, isFinanceEncryptionConfigured } from '../services/financeCrypto.js';

const router = Router();
router.use(requireAuth);
router.use(requireFamilyPin);

// Eksponerer ALDRI de krypterte verdiene tilbake til frontend – kun om noe
// er satt eller ikke, pluss den globale (skrivebeskyttede) feature-flagget
// som avgjør om Enable Banking-seksjonen skal vises som aktiv eller
// "Kommer snart" i oppsettsveiviseren.
router.get('/', (req, res) => {
  const cfg = db.prepare('SELECT * FROM finance_config WHERE family_id = ?').get(req.familyId);
  res.json({
    claudeKeyConfigured: Boolean(cfg?.claude_api_key_encrypted),
    enableBankingAppId: cfg?.enable_banking_app_id || null,
    enableBankingPemConfigured: Boolean(cfg?.enable_banking_pem_encrypted),
    enableBankingActive: Boolean(cfg?.enable_banking_active),
    domain: cfg?.domain || null,
    globalEnableBankingActive: config.enableBankingActive,
    encryptionConfigured: isFinanceEncryptionConfigured(),
  });
});

router.patch('/', (req, res) => {
  if (!isFinanceEncryptionConfigured()) {
    return res.status(500).json({
      error: 'FINANCE_ENCRYPTION_KEY er ikke satt på serveren. Kontakt den som satte opp installasjonen.',
    });
  }
  const { claudeApiKey, enableBankingAppId, enableBankingPem, enableBankingActive, domain } = req.body || {};

  const existing = db.prepare('SELECT * FROM finance_config WHERE family_id = ?').get(req.familyId);
  const next = {
    familyId: req.familyId,
    claudeApiKeyEncrypted:
      claudeApiKey !== undefined ? (claudeApiKey ? encryptSecret(claudeApiKey) : null) : existing?.claude_api_key_encrypted ?? null,
    enableBankingAppId: enableBankingAppId !== undefined ? enableBankingAppId || null : existing?.enable_banking_app_id ?? null,
    enableBankingPemEncrypted:
      enableBankingPem !== undefined
        ? (enableBankingPem ? encryptSecret(enableBankingPem) : null)
        : existing?.enable_banking_pem_encrypted ?? null,
    enableBankingActive:
      enableBankingActive !== undefined ? (enableBankingActive ? 1 : 0) : existing?.enable_banking_active ?? 0,
    domain: domain !== undefined ? domain || null : existing?.domain ?? null,
  };

  db.prepare(
    `INSERT INTO finance_config
       (family_id, claude_api_key_encrypted, enable_banking_app_id, enable_banking_pem_encrypted, enable_banking_active, domain, updated_at)
     VALUES (@familyId, @claudeApiKeyEncrypted, @enableBankingAppId, @enableBankingPemEncrypted, @enableBankingActive, @domain, datetime('now'))
     ON CONFLICT(family_id) DO UPDATE SET
       claude_api_key_encrypted = excluded.claude_api_key_encrypted,
       enable_banking_app_id = excluded.enable_banking_app_id,
       enable_banking_pem_encrypted = excluded.enable_banking_pem_encrypted,
       enable_banking_active = excluded.enable_banking_active,
       domain = excluded.domain,
       updated_at = datetime('now')`
  ).run(next);

  res.json({ ok: true });
});

export default router;
