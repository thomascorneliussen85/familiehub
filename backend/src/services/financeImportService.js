import crypto from 'crypto';
import { db } from '../db/index.js';
import { parseTransactions } from './financeCsvParser.js';

const DEFAULT_CATEGORIES = ['Dagligvarer', 'Transport', 'Bolig', 'Strøm', 'Abonnement', 'Barn', 'Fritid', 'Annet'];

// Kalles lat (ved første kategori-spørring eller import) i stedet for i
// schema.sql, siden kategoriene er per-familie data, ikke skjema.
export function ensureDefaultCategories(familyId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM finance_categories WHERE family_id = ?').get(familyId).n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO finance_categories (family_id, name, sort_order) VALUES (?, ?, ?)');
  const insertAll = db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((name, i) => insert.run(familyId, name, i));
  });
  insertAll();
}

// Gjetter kolonnetilordning ut fra vanlige norske banknavn (DNB,
// Sparebanken Vest, Bulder, Sbanken, Nordea bruker alle litt ulik ordlyd),
// slik at ColumnMappingModal kan forhåndsutfylles i stedet for å starte tomt.
// Brukeren bekrefter/retter alltid før import kjøres.
const HEADER_KEYWORDS = {
  date: ['dato', 'bokføringsdato', 'bokforingsdato', 'rentedato', 'date'],
  amount: ['beløp', 'belop', 'amount', 'sum'],
  counterparty: ['til/fra', 'avsender/mottaker', 'motpart', 'navn', 'counterparty'],
  description: ['tekst', 'beskrivelse', 'forklaring', 'melding', 'description'],
};

// "inn"/"ut" er for korte til trygg substreng-matching (ville truffet feil
// kolonner), så de kreves som eksakt kolonnenavn – lengre synonymer
// (innbetaling/kreditert osv.) matches som substreng som normalt.
const CREDIT_EXACT = ['inn'];
const CREDIT_SUBSTRING = ['kredit', 'credit', 'innbetaling'];
const DEBIT_EXACT = ['ut'];
const DEBIT_SUBSTRING = ['debet', 'debit', 'utbetaling'];

function findColumn(headers, exactWords, substringWords) {
  const exactMatch = headers.find((h) => exactWords.includes(h.toLowerCase().trim()));
  if (exactMatch) return exactMatch;
  const substringMatch = headers.find((h) => substringWords.some((w) => h.toLowerCase().includes(w)));
  return substringMatch || null;
}

// Gjetter kolonnetilordning ut fra vanlige norske banknavn (DNB,
// Sparebanken Vest, Bulder, Sbanken, Nordea bruker alle litt ulik ordlyd),
// slik at ColumnMappingModal kan forhåndsutfylles i stedet for å starte tomt.
// Brukeren bekrefter/retter alltid før import kjøres.
export function guessColumnMapping(headers) {
  const mapping = {};
  for (const [field, keywords] of Object.entries(HEADER_KEYWORDS)) {
    const match = headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k)));
    if (match) mapping[field] = match;
  }
  // Noen banker (f.eks. SR-Bank) eksporterer "Inn"/"Ut" som to separate
  // kolonner i stedet for ett fortegnet beløp – prøv dette kun hvis vi ikke
  // allerede fant en enkelt beløp-kolonne.
  if (!mapping.amount) {
    const creditColumn = findColumn(headers, CREDIT_EXACT, CREDIT_SUBSTRING);
    const debitColumn = findColumn(headers, DEBIT_EXACT, DEBIT_SUBSTRING);
    if (creditColumn || debitColumn) {
      mapping.creditColumn = creditColumn;
      mapping.debitColumn = debitColumn;
    }
  }
  return mapping;
}

export function getBankMapping(familyId, bankName) {
  const row = db
    .prepare('SELECT column_map FROM finance_bank_mappings WHERE family_id = ? AND bank_name = ?')
    .get(familyId, bankName);
  return row ? JSON.parse(row.column_map) : null;
}

export function saveBankMapping(familyId, bankName, columnMap) {
  db.prepare(
    `INSERT INTO finance_bank_mappings (family_id, bank_name, column_map)
     VALUES (?, ?, ?)
     ON CONFLICT(family_id, bank_name) DO UPDATE SET column_map = excluded.column_map`
  ).run(familyId, bankName, JSON.stringify(columnMap));
}

// Eksportert slik at enableBankingSync.js kan bruke SAMME nøkkel-formel –
// en reell transaksjon skal aldri kunne importeres to ganger uansett om den
// kommer inn via CSV eller Enable Banking-synk.
export function dedupKey(accountId, date, amount, counterparty) {
  const normalized = `${accountId}|${date}|${amount.toFixed(2)}|${(counterparty || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Selve CSV-bufferen lever kun i minnet gjennom hele denne funksjonen
// (multer memoryStorage i financeImport.js-ruten skriver den aldri til
// disk) – kun de parsede transaksjonene under blir liggende i databasen,
// slik kravet om at opplastede filer ikke skal bevares er oppfylt uten noen
// egen sletting-etterpå-logikk.
export function importCsv(familyId, accountId, { filename, bankName, buffer, mapping, source = 'csv' }) {
  const account = db.prepare('SELECT id FROM finance_accounts WHERE id = ? AND family_id = ?').get(accountId, familyId);
  if (!account) throw new Error('Konto ikke funnet');

  const { transactions, errors } = parseTransactions(buffer, mapping);

  const insertImport = db.prepare(
    `INSERT INTO finance_imports (family_id, account_id, filename, new_count, duplicate_count)
     VALUES (?, ?, ?, 0, 0)`
  );
  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO finance_transactions
       (family_id, account_id, date, amount, counterparty, raw_description, source, import_id, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateImportCounts = db.prepare('UPDATE finance_imports SET new_count = ?, duplicate_count = ? WHERE id = ?');

  const run = db.transaction(() => {
    const importInfo = insertImport.run(familyId, accountId, filename || null);
    const importId = importInfo.lastInsertRowid;
    let newCount = 0;
    let duplicateCount = 0;
    for (const tx of transactions) {
      const key = dedupKey(accountId, tx.date, tx.amount, tx.counterparty);
      const info = insertTx.run(
        familyId,
        accountId,
        tx.date,
        tx.amount,
        tx.counterparty || null,
        tx.rawDescription || null,
        source,
        importId,
        key
      );
      if (info.changes > 0) newCount += 1;
      else duplicateCount += 1;
    }
    updateImportCounts.run(newCount, duplicateCount, importId);
    return { importId, newCount, duplicateCount };
  });

  const { importId, newCount, duplicateCount } = run();

  if (bankName && mapping) saveBankMapping(familyId, bankName, mapping);

  return {
    importId,
    newCount,
    duplicateCount,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    totalRows: transactions.length + errors.length,
  };
}

export function listImports(familyId, accountId) {
  if (accountId) {
    return db
      .prepare('SELECT * FROM finance_imports WHERE family_id = ? AND account_id = ? ORDER BY imported_at DESC')
      .all(familyId, accountId);
  }
  return db.prepare('SELECT * FROM finance_imports WHERE family_id = ? ORDER BY imported_at DESC').all(familyId);
}

export function undoImport(familyId, importId) {
  const importRow = db.prepare('SELECT * FROM finance_imports WHERE id = ? AND family_id = ?').get(importId, familyId);
  if (!importRow) throw new Error('Import ikke funnet');
  if (importRow.status === 'rolled_back') throw new Error('Importen er allerede angret');

  const run = db.transaction(() => {
    db.prepare('DELETE FROM finance_transactions WHERE import_id = ?').run(importId);
    db.prepare("UPDATE finance_imports SET status = 'rolled_back', rolled_back_at = datetime('now') WHERE id = ?").run(
      importId
    );
  });
  run();
  return { ok: true };
}
