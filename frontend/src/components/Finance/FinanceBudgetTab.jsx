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

  useEffect(load, [adminApi, month]);

  async function saveBudget(categoryId) {
    const amount = Number(drafts[categoryId] || 0);
    await adminApi.patch('/finance/budgets', { categoryId, month, amount });
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
    </div>
  );
}
