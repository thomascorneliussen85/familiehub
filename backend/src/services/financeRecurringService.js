import { db } from '../db/index.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_OCCURRENCES = 2;
const PRICE_HISTORY_LIMIT = 12;

function normalizeCounterparty(text) {
  return (text || '').trim().toLowerCase();
}

function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY);
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tillater litt variasjon i mellomrommet mellom belastninger (f.eks. strøm
// trekkes ikke alltid på nøyaktig samme dag i måneden), men avviser
// mønstre som er for uregelmessige til å regnes som en fast avtale.
function classifyFrequency(medianIntervalDays) {
  if (medianIntervalDays >= 5 && medianIntervalDays <= 9) return 'weekly';
  if (medianIntervalDays >= 25 && medianIntervalDays <= 35) return 'monthly';
  if (medianIntervalDays >= 350 && medianIntervalDays <= 380) return 'yearly';
  return null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Kjøres etter hver CSV-import (billig – ren SQL/JS, ingen API-kall) og før
// ukebriefen genereres. Grupperer transaksjoner på motpart, og gjenkjenner
// et gjentakende mønster hvis mellomrommet mellom belastningene er stabilt
// nok til å klassifiseres som ukentlig/månedlig/årlig.
export function detectRecurring(familyId) {
  const rows = db
    .prepare(
      `SELECT counterparty, date, amount FROM finance_transactions
       WHERE family_id = ? AND counterparty IS NOT NULL AND counterparty != ''
       ORDER BY date ASC`
    )
    .all(familyId);

  const groups = new Map();
  for (const row of rows) {
    const key = normalizeCounterparty(row.counterparty);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const existingRows = db.prepare('SELECT id, counterparty FROM finance_recurring WHERE family_id = ?').all(familyId);
  const existingByKey = new Map(existingRows.map((r) => [normalizeCounterparty(r.counterparty), r.id]));

  const update = db.prepare(
    `UPDATE finance_recurring
     SET counterparty = @counterparty, amount = @amount, frequency = @frequency,
         next_due_date = @nextDueDate, price_history = @priceHistory, updated_at = datetime('now')
     WHERE id = @id`
  );
  const insert = db.prepare(
    `INSERT INTO finance_recurring (family_id, counterparty, amount, frequency, next_due_date, price_history)
     VALUES (@familyId, @counterparty, @amount, @frequency, @nextDueDate, @priceHistory)`
  );

  const detected = [];
  for (const [key, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES) continue;
    const dates = txs.map((t) => t.date);
    const intervals = [];
    for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]));
    const medianInterval = median(intervals);
    const frequency = classifyFrequency(medianInterval);
    if (!frequency) continue;

    const last = txs[txs.length - 1];
    const nextDueDate = addDays(last.date, Math.round(medianInterval));
    const priceHistory = txs.slice(-PRICE_HISTORY_LIMIT).map((t) => ({ date: t.date, amount: t.amount }));

    const record = {
      familyId,
      counterparty: last.counterparty,
      amount: last.amount,
      frequency,
      nextDueDate,
      priceHistory: JSON.stringify(priceHistory),
    };

    const existingId = existingByKey.get(key);
    if (existingId) {
      update.run({ ...record, id: existingId });
    } else {
      insert.run(record);
    }
    detected.push({ ...record, priceHistory });
  }

  return detected;
}

// Brukes av nivå-1-widgeten ("14-day bill radar") – kun regningsnavn, beløp
// og forfallsdato, ALDRI saldoer eller enkelttransaksjoner, per kravet om at
// nivå 1 skal være trygt å vise uten PIN-opplåsing.
export function getUpcomingBills(familyId, withinDays = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, withinDays);
  return db
    .prepare(
      `SELECT counterparty, amount, frequency, next_due_date
       FROM finance_recurring
       WHERE family_id = ? AND next_due_date IS NOT NULL AND next_due_date BETWEEN ? AND ?
       ORDER BY next_due_date ASC`
    )
    .all(familyId, today, horizon);
}

// Brukes av FinanceChartsTab: full abonnement-liste med prishistorikk og et
// flagg for om prisen har økt siden forrige belastning (fanger opp f.eks.
// en strømleverandør eller et abonnement som stille har blitt dyrere).
export function getSubscriptionsList(familyId) {
  const rows = db
    .prepare('SELECT * FROM finance_recurring WHERE family_id = ? ORDER BY next_due_date ASC').all(familyId);
  return rows.map((r) => {
    const history = JSON.parse(r.price_history || '[]');
    const priceIncreased =
      history.length >= 2 && Math.abs(history[history.length - 1].amount) > Math.abs(history[history.length - 2].amount);
    return { ...r, price_history: history, priceIncreased };
  });
}
