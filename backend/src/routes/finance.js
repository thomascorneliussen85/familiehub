import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { ensureDefaultCategories } from '../services/financeImportService.js';
import { getUpcomingBills, getSubscriptionsList } from '../services/financeRecurringService.js';

const router = Router();
router.use(requireAuth);

// ---- Kontoer, transaksjoner, kategori- og budsjett-administrasjon krever
// familiens PIN (nivå 2) – dette er der saldoer, kontonavn og enkeltlinjer
// vises, som IKKE skal være synlig uten opplåsing (se FinanceWidget/nivå 1
// under, som kun bruker /summary). ----
const level2 = Router();
level2.use(requireFamilyPin);

// ---- Kontoer ----
level2.get('/accounts', (req, res) => {
  res.json(db.prepare('SELECT * FROM finance_accounts WHERE family_id = ? ORDER BY created_at ASC').all(req.familyId));
});

level2.post('/accounts', (req, res) => {
  const { bankName, accountName, accountType, balance, ownerMemberId } = req.body || {};
  if (!bankName || !accountName) return res.status(400).json({ error: 'bankName og accountName er påkrevd' });
  const info = db
    .prepare(
      `INSERT INTO finance_accounts (family_id, bank_name, account_name, account_type, balance, owner_member_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.familyId, bankName, accountName, accountType || 'brukskonto', balance ?? null, ownerMemberId || null);
  res.status(201).json(db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(info.lastInsertRowid));
});

level2.patch('/accounts/:id', (req, res) => {
  const account = db.prepare('SELECT * FROM finance_accounts WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!account) return res.status(404).json({ error: 'Konto ikke funnet' });
  const { bankName, accountName, accountType, balance, ownerMemberId } = req.body || {};
  db.prepare(
    `UPDATE finance_accounts SET
       bank_name = COALESCE(?, bank_name),
       account_name = COALESCE(?, account_name),
       account_type = COALESCE(?, account_type),
       balance = CASE WHEN ? THEN ? ELSE balance END,
       owner_member_id = CASE WHEN ? THEN ? ELSE owner_member_id END
     WHERE id = ?`
  ).run(
    bankName ?? null,
    accountName ?? null,
    accountType ?? null,
    balance !== undefined ? 1 : 0,
    balance ?? null,
    ownerMemberId !== undefined ? 1 : 0,
    ownerMemberId ?? null,
    account.id
  );
  res.json(db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(account.id));
});

level2.delete('/accounts/:id', (req, res) => {
  const info = db.prepare('DELETE FROM finance_accounts WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  if (info.changes === 0) return res.status(404).json({ error: 'Konto ikke funnet' });
  res.status(204).end();
});

// ---- Kategorier ----
level2.get('/categories', (req, res) => {
  ensureDefaultCategories(req.familyId);
  res.json(
    db.prepare('SELECT * FROM finance_categories WHERE family_id = ? ORDER BY sort_order ASC, id ASC').all(req.familyId)
  );
});

level2.post('/categories', (req, res) => {
  const { name, parentId, sortOrder } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name er påkrevd' });
  const info = db
    .prepare('INSERT INTO finance_categories (family_id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.familyId, name, parentId || null, sortOrder ?? 0);
  res.status(201).json(db.prepare('SELECT * FROM finance_categories WHERE id = ?').get(info.lastInsertRowid));
});

level2.patch('/categories/:id', (req, res) => {
  const category = db
    .prepare('SELECT * FROM finance_categories WHERE id = ? AND family_id = ?')
    .get(req.params.id, req.familyId);
  if (!category) return res.status(404).json({ error: 'Kategori ikke funnet' });
  const { name, sortOrder } = req.body || {};
  db.prepare('UPDATE finance_categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?').run(
    name ?? null,
    sortOrder ?? null,
    category.id
  );
  res.json(db.prepare('SELECT * FROM finance_categories WHERE id = ?').get(category.id));
});

level2.delete('/categories/:id', (req, res) => {
  const info = db.prepare('DELETE FROM finance_categories WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  if (info.changes === 0) return res.status(404).json({ error: 'Kategori ikke funnet' });
  res.status(204).end();
});

// ---- Transaksjoner ----
level2.get('/transactions', (req, res) => {
  const { accountId, categoryId, from, to, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (Math.max(Number(req.query.page) || 1, 1) - 1) * limit;

  const clauses = ['t.family_id = ?'];
  const params = [req.familyId];
  if (accountId) {
    clauses.push('t.account_id = ?');
    params.push(Number(accountId));
  }
  if (categoryId) {
    clauses.push('t.category_id = ?');
    params.push(Number(categoryId));
  }
  if (from) {
    clauses.push('t.date >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('t.date <= ?');
    params.push(to);
  }
  if (q) {
    clauses.push('(t.counterparty LIKE ? OR t.raw_description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = clauses.join(' AND ');

  const rows = db
    .prepare(
      `SELECT t.*, c.name AS category_name, a.account_name, a.bank_name
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
       JOIN finance_accounts a ON a.id = t.account_id
       WHERE ${where}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM finance_transactions t WHERE ${where}`).get(...params).n;
  res.json({ transactions: rows, total, page: Math.floor(offset / limit) + 1, limit });
});

level2.patch('/transactions/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!tx) return res.status(404).json({ error: 'Transaksjon ikke funnet' });
  const { categoryId } = req.body || {};
  // ai_categorized settes til 0 når et menneske overstyrer – kategoriseringsjobben
  // (financeCategorizer.js) skal aldri overskrive et manuelt valg senere.
  db.prepare('UPDATE finance_transactions SET category_id = ?, ai_categorized = 0 WHERE id = ?').run(
    categoryId ?? null,
    tx.id
  );
  res.json(db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(tx.id));
});

level2.delete('/transactions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM finance_transactions WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  if (info.changes === 0) return res.status(404).json({ error: 'Transaksjon ikke funnet' });
  res.status(204).end();
});

// ---- Budsjett ----
level2.get('/budgets', (req, res) => {
  ensureDefaultCategories(req.familyId);
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db
    .prepare(
      `SELECT cat.id AS category_id, cat.name AS category_name, b.amount
       FROM finance_categories cat
       LEFT JOIN finance_budgets b ON b.category_id = cat.id AND b.family_id = cat.family_id AND b.month = ?
       WHERE cat.family_id = ?
       ORDER BY cat.sort_order ASC, cat.id ASC`
    )
    .all(month, req.familyId);
  res.json({ month, budgets: rows });
});

level2.patch('/budgets', (req, res) => {
  const { categoryId, month, amount } = req.body || {};
  if (!categoryId || !month || amount === undefined) {
    return res.status(400).json({ error: 'categoryId, month og amount er påkrevd' });
  }
  const category = db
    .prepare('SELECT id FROM finance_categories WHERE id = ? AND family_id = ?')
    .get(categoryId, req.familyId);
  if (!category) return res.status(404).json({ error: 'Kategori ikke funnet' });
  db.prepare(
    `INSERT INTO finance_budgets (family_id, category_id, month, amount)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(family_id, category_id, month) DO UPDATE SET amount = excluded.amount`
  ).run(req.familyId, categoryId, month, amount);
  res.json({ categoryId, month, amount });
});

// Brukt av FinanceChartsTab til "inntekt vs. utgift over tid" – aggregert
// per måned, aldri enkelttransaksjoner.
level2.get('/monthly-totals', (req, res) => {
  const months = Math.min(Number(req.query.months) || 6, 24);
  const rows = db
    .prepare(
      `SELECT
         substr(date, 1, 7) AS month,
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS expense
       FROM finance_transactions
       WHERE family_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`
    )
    .all(req.familyId, months);
  res.json(rows.reverse());
});

// Brukt av FinanceChartsTab: full abonnement-/regningsliste med
// prishistorikk og flagg for prisøkning.
level2.get('/subscriptions', (req, res) => {
  res.json(getSubscriptionsList(req.familyId));
});

// ---- Nivå 1: dashboard-sammendrag (ingen PIN) ----
// Kun aggregerte tall (budsjett-status, sum brukt) – ALDRI saldoer,
// kontonavn eller enkelttransaksjoner, per kravet om at nivå 1 skal være
// trygt å vise fram uten opplåsing (gjester, barn foran skjermen). Denne
// ruten MÅ registreres FØR router.use(level2) under – level2 sin
// requireFamilyPin-middleware kjører for ALLE forespørsler som når
// underrouteren (Express' use() uten sti matcher alt), uavhengig av om noen
// av dens egne ruter faktisk matcher etterpå. Så lenge /summary er
// registrert på den ytre routeren FØRST, blir den ferdig besvart før
// forespørselen noensinne når level2 sin PIN-sjekk.
router.get('/summary', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  ensureDefaultCategories(req.familyId);

  const categories = db
    .prepare(
      `SELECT
         cat.id AS category_id,
         cat.name AS category_name,
         COALESCE(b.amount, 0) AS budget,
         COALESCE((
           SELECT SUM(-t.amount) FROM finance_transactions t
           WHERE t.family_id = cat.family_id AND t.category_id = cat.id
             AND t.amount < 0 AND substr(t.date, 1, 7) = ?
         ), 0) AS spent
       FROM finance_categories cat
       LEFT JOIN finance_budgets b ON b.category_id = cat.id AND b.family_id = cat.family_id AND b.month = ?
       WHERE cat.family_id = ?
       ORDER BY cat.sort_order ASC, cat.id ASC`
    )
    .all(month, month, req.familyId);

  const budgetTotal = categories.reduce((sum, c) => sum + c.budget, 0);
  const spentTotal = categories.reduce((sum, c) => sum + c.spent, 0);

  let status = 'unconfigured';
  if (budgetTotal > 0) {
    const ratio = spentTotal / budgetTotal;
    status = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok';
  }

  // Kun tidsstempelet, for FinanceWidgetens "ferskhet"-hint – aldri
  // filnavn eller andre detaljer som hører til nivå 2.
  const lastImport = db
    .prepare('SELECT imported_at FROM finance_imports WHERE family_id = ? ORDER BY imported_at DESC LIMIT 1')
    .get(req.familyId);

  res.json({
    month,
    budgetTotal,
    spentTotal,
    status,
    lastImportAt: lastImport?.imported_at || null,
    categories: categories.map((c) => ({
      ...c,
      status: c.budget > 0 ? (c.spent / c.budget >= 1 ? 'over' : c.spent / c.budget >= 0.8 ? 'warning' : 'ok') : 'unconfigured',
    })),
  });
});

// Nivå 1 (ingen PIN) – kun regningsnavn/beløp/forfallsdato for kommende
// faste regninger, brukt av FinanceWidgetens "14-dagers regningsradar". Må
// også stå FØR router.use(level2) av samme grunn som /summary over.
router.get('/upcoming-bills', (req, res) => {
  res.json(getUpcomingBills(req.familyId, 14));
});

router.use(level2);

export default router;
