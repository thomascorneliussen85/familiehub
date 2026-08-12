import { db } from '../db/index.js';
import { config } from '../config.js';
import { decryptSecret } from './financeCrypto.js';
import { dedupKey } from './financeImportService.js';
import { getAccountTransactions } from './enableBankingClient.js';

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 2x/dag
const LOOKBACK_DAYS = 7; // henter litt overlapp, dedup_key filtrerer bort duplikater
const CONSENT_WARNING_DAYS = 14;
const MAX_RETRIES = 2;

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// MERK: mapper fra Enable Bankings transaksjonsform til vårt eget skjema.
// Selve feltnavnene (transaction_amount.amount, remittance_information osv.)
// følger deres offentlig dokumenterte "harmonized" transaksjonsformat, men er
// IKKE verifisert mot et ekte svar herfra (se enableBankingClient.js). Denne
// funksjonen er det eneste stedet som må rettes opp hvis feltnavnene viser
// seg å avvike når ekte sandbox-tilgang finnes.
function mapEbTransaction(raw) {
  return {
    date: raw.booking_date || raw.value_date,
    amount: Number(raw.transaction_amount?.amount ?? raw.amount ?? 0),
    counterparty: raw.creditor?.name || raw.debtor?.name || null,
    rawDescription: raw.remittance_information?.join?.(' ') || raw.remittance_information || null,
  };
}

async function syncAccount(familyId, appId, pem, account) {
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getAccountTransactions(appId, pem, account.eb_account_id, dateFrom, dateTo);
      const rawTransactions = response.transactions || response.booked || [];
      const insert = db.prepare(
        `INSERT OR IGNORE INTO finance_transactions
           (family_id, account_id, date, amount, counterparty, raw_description, source, dedup_key)
         VALUES (?, ?, ?, ?, ?, ?, 'api', ?)`
      );
      let newCount = 0;
      for (const raw of rawTransactions) {
        const tx = mapEbTransaction(raw);
        if (!tx.date || !Number.isFinite(tx.amount)) continue;
        const key = dedupKey(account.id, tx.date, tx.amount, tx.counterparty);
        const info = insert.run(familyId, account.id, tx.date, tx.amount, tx.counterparty, tx.rawDescription, key);
        if (info.changes > 0) newCount += 1;
      }
      return newCount;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function syncFamily(familyId) {
  const cfg = db.prepare('SELECT * FROM finance_config WHERE family_id = ?').get(familyId);
  if (!cfg?.enable_banking_active || !cfg.enable_banking_app_id || !cfg.enable_banking_pem_encrypted) return;

  const pem = decryptSecret(cfg.enable_banking_pem_encrypted);
  const accounts = db
    .prepare(
      `SELECT * FROM finance_accounts
       WHERE family_id = ? AND data_source IN ('api', 'begge') AND eb_account_id IS NOT NULL`
    )
    .all(familyId);

  for (const account of accounts) {
    if (account.consent_expires_at && daysUntil(account.consent_expires_at) <= 0) {
      console.warn(`Enable Banking: samtykket for konto ${account.id} (familie ${familyId}) er utløpt.`);
      continue;
    }
    if (account.consent_expires_at && daysUntil(account.consent_expires_at) <= CONSENT_WARNING_DAYS) {
      console.warn(
        `Enable Banking: samtykket for konto ${account.id} (familie ${familyId}) utløper om ${daysUntil(account.consent_expires_at)} dager.`
      );
    }
    try {
      const newCount = await syncAccount(familyId, cfg.enable_banking_app_id, pem, account);
      if (newCount > 0) console.log(`Enable Banking: ${newCount} nye transaksjoner for konto ${account.id}.`);
    } catch (err) {
      console.error(`Enable Banking: synk feilet for konto ${account.id} (familie ${familyId}).`, err.message);
    }
  }
}

// Global av/på-bryter (ENABLE_BANKING_ACTIVE) må være satt i tillegg til at
// hver enkelt familie har skrudd det på selv – se finance_config.
// enable_banking_active. Uten dette gjør jobben ingenting (samme
// "no-op hvis ikke konfigurert"-mønster som traccarPoller.js).
export function startEnableBankingSync() {
  if (!config.enableBankingActive) {
    console.log('ℹ️  Enable Banking er ikke aktivert globalt (ENABLE_BANKING_ACTIVE) – kontosynk kjører ikke.');
    return;
  }

  async function runForAllFamilies() {
    const families = db.prepare('SELECT id FROM families').all();
    for (const { id } of families) {
      await syncFamily(id).catch((err) => console.error(`Enable Banking: synk feilet for familie ${id}.`, err.message));
    }
  }

  runForAllFamilies();
  setInterval(runForAllFamilies, SYNC_INTERVAL_MS);
}
