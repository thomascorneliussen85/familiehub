import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { getFamilyClaudeKey } from './financeCategorizer.js';
import { getUpcomingBills, getSubscriptionsList } from './financeRecurringService.js';

// Strengt begrenset til innsikt/generelle observasjoner om familiens EGET
// forbruk – ALDRI investeringsråd eller anbefalinger om aksjer/fond/kryptoi
// tråd med kravet om at Claude-laget kun skal gi innsikt, ikke rådgivning.
const SYSTEM_PROMPT =
  'Du er en hjelpsom, varm norsk økonomiassistent for en familie. Du får aggregerte tall om ' +
  'familiens eget forbruk (kategorier, budsjett, kommende faste regninger). Gi konkrete ' +
  'observasjoner og innsikt basert KUN på disse tallene – for eksempel om budsjettet holder, ' +
  'om noe har blitt dyrere, eller om en kategori peker seg ut. ALDRI gi investeringsråd, ' +
  'spareråd om aksjer/fond/kryptovaluta, eller andre finansielle anbefalinger utover ' +
  'observasjoner om det oppgitte forbruket. Maks 200 ord, naturlig muntlig språk.';

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

// Bygger den aggregerte konteksten som sendes til Claude – kun kategorinavn,
// summer og regningsnavn/datoer, aldri kontonumre eller enkelttransaksjoner
// med personnavn.
function gatherFinanceContext(familyId) {
  const today = new Date().toISOString().slice(0, 10);
  const month = monthOf(today);
  const weekStart = mondayOf(today);

  const spentThisWeek = db
    .prepare(
      `SELECT COALESCE(SUM(-amount), 0) AS total FROM finance_transactions
       WHERE family_id = ? AND amount < 0 AND date >= ?`
    )
    .get(familyId, weekStart).total;

  const categorySpend = db
    .prepare(
      `SELECT c.name AS category, COALESCE(SUM(-t.amount), 0) AS spent, COALESCE(b.amount, 0) AS budget
       FROM finance_categories c
       LEFT JOIN finance_transactions t
         ON t.category_id = c.id AND t.family_id = c.family_id AND t.amount < 0 AND substr(t.date, 1, 7) = ?
       LEFT JOIN finance_budgets b ON b.category_id = c.id AND b.family_id = c.family_id AND b.month = ?
       WHERE c.family_id = ?
       GROUP BY c.id
       ORDER BY spent DESC`
    )
    .all(month, month, familyId);

  const upcomingBills = getUpcomingBills(familyId, 14);
  const priceIncreases = getSubscriptionsList(familyId).filter((s) => s.priceIncreased);

  return { today, month, weekStart, spentThisWeek, categorySpend, upcomingBills, priceIncreases };
}

function formatContextForPrompt(ctx) {
  const lines = [`Denne ukens forbruk hittil: ${ctx.spentThisWeek.toFixed(0)} kr.`];
  lines.push('Forbruk denne måneden per kategori (brukt / budsjett):');
  for (const c of ctx.categorySpend) {
    if (c.spent > 0 || c.budget > 0) {
      lines.push(`- ${c.category}: ${c.spent.toFixed(0)} kr / ${c.budget > 0 ? c.budget.toFixed(0) + ' kr' : 'ikke satt'}`);
    }
  }
  if (ctx.upcomingBills.length > 0) {
    lines.push('Faste regninger neste 14 dager:');
    ctx.upcomingBills.forEach((b) => lines.push(`- ${b.counterparty}: ${Math.abs(b.amount).toFixed(0)} kr, ${b.next_due_date}`));
  }
  if (ctx.priceIncreases.length > 0) {
    lines.push('Abonnementer som har blitt dyrere:');
    ctx.priceIncreases.forEach((s) => lines.push(`- ${s.counterparty}`));
  }
  return lines.join('\n');
}

function buildDemoBrief(ctx) {
  const overspent = ctx.categorySpend.find((c) => c.budget > 0 && c.spent > c.budget);
  const parts = [`Denne uken har dere brukt ca. ${ctx.spentThisWeek.toFixed(0)} kr.`];
  if (overspent) parts.push(`${overspent.category} har passert budsjettet denne måneden.`);
  if (ctx.upcomingBills.length > 0) {
    parts.push(`${ctx.upcomingBills.length} faste regning(er) forfaller de neste 14 dagene.`);
  }
  if (ctx.priceIncreases.length > 0) {
    parts.push(`${ctx.priceIncreases.map((s) => s.counterparty).join(', ')} har blitt dyrere.`);
  }
  parts.push('(Demo-brief – legg til en Claude API-nøkkel i Oppsett for AI-genererte observasjoner.)');
  return parts.join(' ');
}

async function callClaude(apiKey, contextText, question) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question ? `${contextText}\n\nSpørsmål: ${question}` : contextText }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text?.trim() || '';
}

// Genererer (eller regenererer) ukens brief og cacher den i finance_ai_briefs.
export async function generateWeeklyBrief(familyId) {
  const ctx = gatherFinanceContext(familyId);
  const contextText = formatContextForPrompt(ctx);
  const apiKey = getFamilyClaudeKey(familyId);

  let content;
  let isDemo = false;
  if (apiKey) {
    try {
      content = await callClaude(apiKey, contextText);
      if (!content) throw new Error('Tomt svar fra Claude');
    } catch (err) {
      console.error('Økonomibrief: Claude-kall feilet, bruker demobrief.', err.message);
      content = buildDemoBrief(ctx);
      isDemo = true;
    }
  } else {
    content = buildDemoBrief(ctx);
    isDemo = true;
  }

  db.prepare(
    `INSERT INTO finance_ai_briefs (family_id, week_start, content)
     VALUES (?, ?, ?)
     ON CONFLICT(family_id, week_start) DO UPDATE SET content = excluded.content, created_at = datetime('now')`
  ).run(familyId, ctx.weekStart, content);

  return { weekStart: ctx.weekStart, content, isDemo };
}

export function getBriefHistory(familyId, limit = 12) {
  return db
    .prepare('SELECT * FROM finance_ai_briefs WHERE family_id = ? ORDER BY week_start DESC LIMIT ?')
    .all(familyId, limit);
}

// Chat: enkelt enkelt-turs spørsmål/svar om familiens EGNE aggregerte tall
// (samme kontekst som briefen) – ingen samtalehistorikk lagres.
export async function askFinanceChat(familyId, question) {
  const apiKey = getFamilyClaudeKey(familyId);
  if (!apiKey) {
    throw new Error('Legg til en Claude API-nøkkel under Oppsett for å bruke chatten.');
  }
  const ctx = gatherFinanceContext(familyId);
  const contextText = formatContextForPrompt(ctx);
  return callClaude(apiKey, contextText, question);
}
