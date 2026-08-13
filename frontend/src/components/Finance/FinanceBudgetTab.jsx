import { useEffect, useState } from 'react';

function formatMoney(n) {
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 0 });
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
}

const STATUS_LABEL = { ok: 'OK', warning: 'Nærmer seg', over: 'Over budsjett', unconfigured: 'Ikke satt' };

export default function FinanceBudgetTab({ adminApi }) {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [categories, setCategories] = useState([]);
  const [nameDrafts, setNameDrafts] = useState({});
  const [newCategoryName, setNewCategoryName] = useState('');

  function load() {
    adminApi.get(`/finance/summary?month=${month}`).then((data) => {
      setSummary(data);
      const nextDrafts = {};
      data.categories.forEach((c) => {
        nextDrafts[c.category_id] = c.budget > 0 ? String(c.budget) : '';
      });
      setDrafts(nextDrafts);
    });
  }
  function loadCategories() {
    adminApi.get('/finance/categories').then((data) => {
      setCategories(data);
      const nextNameDrafts = {};
      data.forEach((c) => {
        nextNameDrafts[c.id] = c.name;
      });
      setNameDrafts(nextNameDrafts);
    });
  }

  useEffect(load, [adminApi, month]);
  useEffect(loadCategories, [adminApi]);

  async function saveBudget(categoryId) {
    const amount = Number(drafts[categoryId] || 0);
    await adminApi.patch('/finance/budgets', { categoryId, month, amount });
    load();
  }

  async function renameCategory(categoryId) {
    const name = (nameDrafts[categoryId] || '').trim();
    const existing = categories.find((c) => c.id === categoryId);
    if (!name || name === existing?.name) return;
    await adminApi.patch(`/finance/categories/${categoryId}`, { name });
    loadCategories();
    load();
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    await adminApi.post('/finance/categories', { name });
    setNewCategoryName('');
    loadCategories();
    load();
  }

  async function deleteCategory(categoryId) {
    await adminApi.delete(`/finance/categories/${categoryId}`);
    loadCategories();
    load();
  }

  return (
    <div className="finance-budget-tab">
      <div className="finance-section">
        <div className="finance-month-nav">
          <button className="btn btn-icon" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </button>
          <span className="finance-month-label">{monthLabel(month)}</span>
          <button className="btn btn-icon" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            ›
          </button>
        </div>
        {summary && (
          <div className="finance-budget-total">
            Totalt: {formatMoney(summary.spentTotal)} kr av {formatMoney(summary.budgetTotal)} kr
          </div>
        )}
      </div>

      <div className="finance-section">
        <ul className="finance-budget-list">
          {summary?.categories.map((c) => (
            <li key={c.category_id} className="finance-budget-item">
              <span className="finance-budget-name">{c.category_name}</span>
              <span className={`finance-budget-status finance-budget-status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
              <span className="finance-budget-spent">{formatMoney(c.spent)} kr brukt</span>
              <input
                type="number"
                min="0"
                className="finance-budget-input"
                value={drafts[c.category_id] ?? ''}
                placeholder="0"
                onChange={(e) => setDrafts((d) => ({ ...d, [c.category_id]: e.target.value }))}
                onBlur={() => saveBudget(c.category_id)}
              />
              <span>kr</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Kategorier</div>
        <ul className="finance-category-manage-list">
          {categories.map((c) => (
            <li key={c.id} className="finance-category-manage-item">
              <input
                className="finance-category-name-input"
                value={nameDrafts[c.id] ?? ''}
                onChange={(e) => setNameDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                onBlur={() => renameCategory(c.id)}
              />
              <button className="btn btn-icon" onClick={() => deleteCategory(c.id)} aria-label={`Slett ${c.name}`}>
                🗑️
              </button>
            </li>
          ))}
        </ul>
        <form
          className="finance-category-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addCategory();
          }}
        >
          <input
            placeholder="Ny kategori…"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <button type="submit" className="btn btn-accent">
            Legg til
          </button>
        </form>
      </div>
    </div>
  );
}
