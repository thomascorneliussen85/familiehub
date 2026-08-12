import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { decryptSecret } from './financeCrypto.js';

const REPORT_CATEGORIES_TOOL = {
  name: 'report_categories',
  description: 'Rapporter hvilken kategori hver transaksjon hører til.',
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Én rad per transaksjon, i samme rekkefølge som de ble gitt.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'Indeksen (0-basert) til transaksjonen dette gjelder' },
            category: { type: 'string', description: 'Navnet på kategorien fra den oppgitte listen som passer best' },
          },
          required: ['index', 'category'],
        },
      },
    },
    required: ['results'],
  },
};

function normalizeCounterparty(text) {
  return (text || '').trim().toLowerCase();
}

export function getFamilyClaudeKey(familyId) {
  const row = db.prepare('SELECT claude_api_key_encrypted FROM finance_config WHERE family_id = ?').get(familyId);
  if (!row?.claude_api_key_encrypted) return null;
  try {
    return decryptSecret(row.claude_api_key_encrypted);
  } catch {
    return null;
  }
}

export function isFinanceClaudeConfigured(familyId) {
  return Boolean(getFamilyClaudeKey(familyId));
}

// "Cachen" er ikke en egen tabell, men et oppslag bygget fra transaksjoner
// som allerede har fått en kategori (enten manuelt eller av AI-en tidligere)
// i samme familie – samme motpart får automatisk samme kategori igjen, uten
// å måtte spørre Claude på nytt for hver eneste Rema 1000-kvittering.
function buildCounterpartyCache(familyId) {
  const rows = db
    .prepare(
      `SELECT counterparty, category_id FROM finance_transactions
       WHERE family_id = ? AND counterparty IS NOT NULL AND category_id IS NOT NULL
       GROUP BY counterparty
       ORDER BY MAX(created_at) DESC`
    )
    .all(familyId);
  const cache = new Map();
  for (const row of rows) {
    const key = normalizeCounterparty(row.counterparty);
    if (key && !cache.has(key)) cache.set(key, row.category_id);
  }
  return cache;
}

const BATCH_SIZE = 40;

// Kategoriserer alle ukategoriserte transaksjoner for familien: først via
// motpart-cachen (gratis, ingen API-kall), deretter i batcher til Claude for
// resten. Personvern: batchen til Claude inneholder KUN motpart + beløp +
// dato per transaksjon – aldri kontonummer, kontonavn eller andre
// personopplysninger (se finance_transactions-skjemaet: de feltene finnes
// ikke engang i objektet som sendes).
export async function categorizeTransactions(familyId) {
  const categories = db.prepare('SELECT id, name FROM finance_categories WHERE family_id = ?').all(familyId);
  if (categories.length === 0) return { cacheHits: 0, aiCategorized: 0, skipped: 0 };
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const fallbackCategoryId = categoryByName.get('annet') ?? categories[categories.length - 1].id;

  const uncategorized = db
    .prepare('SELECT id, counterparty, amount, date FROM finance_transactions WHERE family_id = ? AND category_id IS NULL')
    .all(familyId);
  if (uncategorized.length === 0) return { cacheHits: 0, aiCategorized: 0, skipped: 0 };

  const cache = buildCounterpartyCache(familyId);
  const updateCategory = db.prepare('UPDATE finance_transactions SET category_id = ?, ai_categorized = 1 WHERE id = ?');

  let cacheHits = 0;
  const remaining = [];
  for (const tx of uncategorized) {
    const key = normalizeCounterparty(tx.counterparty);
    if (key && cache.has(key)) {
      updateCategory.run(cache.get(key), tx.id);
      cacheHits += 1;
    } else {
      remaining.push(tx);
    }
  }

  const apiKey = getFamilyClaudeKey(familyId);
  if (!apiKey || remaining.length === 0) {
    return { cacheHits, aiCategorized: 0, skipped: remaining.length };
  }

  const client = new Anthropic({ apiKey });
  const categoryNames = categories.map((c) => c.name);
  let aiCategorized = 0;

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const payload = batch.map((tx, idx) => ({
      index: idx,
      motpart: tx.counterparty || '(ukjent)',
      belop: tx.amount,
      dato: tx.date,
    }));

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system:
          'Du kategoriserer norske banktransaksjoner for en familie. Tilgjengelige kategorier: ' +
          categoryNames.join(', ') +
          '. Bruk report_categories-verktøyet til å svare. Velg alltid den kategorien fra listen som passer best ' +
          '– bruk "Annet" hvis ingen andre passer. Gi kun innsikt basert på motpart/beløp/dato, ' +
          'ikke gjett på personopplysninger som ikke er oppgitt.',
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        tools: [REPORT_CATEGORIES_TOOL],
        tool_choice: { type: 'tool', name: 'report_categories' },
      });
      const toolUse = response.content.find((c) => c.type === 'tool_use');
      const results = toolUse?.input?.results || [];
      for (const r of results) {
        const tx = batch[r.index];
        if (!tx) continue;
        const categoryId = categoryByName.get((r.category || '').toLowerCase()) ?? fallbackCategoryId;
        updateCategory.run(categoryId, tx.id);
        aiCategorized += 1;
      }
    } catch (err) {
      console.error('Finance-kategorisering: Claude-kall feilet for en batch.', err.message);
    }
  }

  return { cacheHits, aiCategorized, skipped: remaining.length - aiCategorized };
}
