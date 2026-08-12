import { useEffect, useState } from 'react';

function formatMoney(n) {
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 0 });
}
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('nb-NO', { month: 'short' });
}
function frequencyLabel(freq) {
  return { weekly: 'Ukentlig', monthly: 'Månedlig', yearly: 'Årlig' }[freq] || freq;
}

export default function FinanceChartsTab({ adminApi }) {
  const [summary, setSummary] = useState(null);
  const [monthlyTotals, setMonthlyTotals] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);

  useEffect(() => {
    adminApi.get('/finance/summary').then(setSummary);
    adminApi.get('/finance/monthly-totals?months=6').then(setMonthlyTotals);
    adminApi.get('/finance/subscriptions').then(setSubscriptions);
  }, [adminApi]);

  const categoriesWithSpend = (summary?.categories || []).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const maxCategorySpend = Math.max(1, ...categoriesWithSpend.map((c) => c.spent));
  const maxMonthlyValue = Math.max(1, ...monthlyTotals.flatMap((m) => [m.income, m.expense]));

  return (
    <div className="finance-charts-tab">
      <div className="finance-section">
        <div className="finance-subtitle">Forbruk per kategori (denne måneden)</div>
        {categoriesWithSpend.length === 0 && <div className="finance-hint">Ingen kategorisert forbruk ennå.</div>}
        <div className="finance-category-bars">
          {categoriesWithSpend.map((c) => (
            <div key={c.category_id} className="finance-category-bar-row">
              <span className="finance-category-bar-label">{c.category_name}</span>
              <div className="finance-category-bar-track">
                <div className="finance-category-bar-fill" style={{ width: `${(c.spent / maxCategorySpend) * 100}%` }} />
              </div>
              <span className="finance-category-bar-value">{formatMoney(c.spent)} kr</span>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Inntekt vs. utgift (siste 6 måneder)</div>
        {monthlyTotals.length === 0 && <div className="finance-hint">Ingen data ennå.</div>}
        <div className="finance-monthly-chart">
          {monthlyTotals.map((m) => (
            <div key={m.month} className="finance-monthly-col" title={`${m.month}: +${formatMoney(m.income)} / -${formatMoney(m.expense)} kr`}>
              <div className="finance-monthly-bars">
                <div
                  className="finance-monthly-bar finance-monthly-bar-income"
                  style={{ height: `${(m.income / maxMonthlyValue) * 100}%` }}
                />
                <div
                  className="finance-monthly-bar finance-monthly-bar-expense"
                  style={{ height: `${(m.expense / maxMonthlyValue) * 100}%` }}
                />
              </div>
              <span className="finance-monthly-label">{monthLabel(m.month)}</span>
            </div>
          ))}
        </div>
        <div className="finance-monthly-legend">
          <span className="finance-legend-income">■ Inntekt</span>
          <span className="finance-legend-expense">■ Utgift</span>
        </div>
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Faste avtaler / abonnementer</div>
        {subscriptions.length === 0 && <div className="finance-hint">Ingen gjentakende betalinger oppdaget ennå.</div>}
        <ul className="finance-subscription-list">
          {subscriptions.map((s) => (
            <li key={s.id} className="finance-subscription-item">
              <span className="finance-subscription-name">{s.counterparty}</span>
              <span className="finance-subscription-freq">{frequencyLabel(s.frequency)}</span>
              <span className="finance-subscription-amount">{formatMoney(Math.abs(s.amount))} kr</span>
              {s.priceIncreased && <span className="finance-subscription-flag">Har blitt dyrere</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
