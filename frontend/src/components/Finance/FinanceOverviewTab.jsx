import { useEffect, useState } from 'react';

function formatMoney(n) {
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function FinanceOverviewTab({ adminApi }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeMessage, setCategorizeMessage] = useState('');

  useEffect(() => {
    adminApi.get('/finance/accounts').then(setAccounts);
    adminApi.get('/finance/categories').then(setCategories);
  }, [adminApi]);

  function buildParams(pageNum) {
    const params = new URLSearchParams();
    if (accountFilter) params.set('accountId', accountFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (search.trim()) params.set('q', search.trim());
    params.set('page', String(pageNum));
    return params;
  }

  // Filterendringer starter alltid på nytt fra side 1 og erstatter listen;
  // "Last inn flere" (loadMore) henter neste side og legger til i stedet.
  useEffect(() => {
    adminApi.get(`/finance/transactions?${buildParams(1).toString()}`).then((data) => {
      setTransactions(data.transactions);
      setTotal(data.total);
      setPage(1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminApi, accountFilter, categoryFilter, search]);

  async function loadMore() {
    const nextPage = page + 1;
    const data = await adminApi.get(`/finance/transactions?${buildParams(nextPage).toString()}`);
    setTransactions((prev) => [...prev, ...data.transactions]);
    setTotal(data.total);
    setPage(nextPage);
  }

  // Kjøres normalt automatisk etter hver import – denne knappen er for
  // transaksjoner som ble importert FØR en Claude-nøkkel var på plass (de
  // blir ikke kategorisert i ettertid av seg selv).
  async function categorizeNow() {
    setCategorizing(true);
    setCategorizeMessage('');
    try {
      const result = await adminApi.post('/finance-ai/categorize');
      setCategorizeMessage(
        result.aiCategorized || result.cacheHits
          ? `${result.aiCategorized + result.cacheHits} transaksjon(er) kategorisert.`
          : result.skipped > 0
            ? 'Ingen Claude-nøkkel funnet – legg til én under Oppsett.'
            : 'Ingenting å kategorisere.'
      );
      const data = await adminApi.get(`/finance/transactions?${buildParams(1).toString()}`);
      setTransactions(data.transactions);
      setTotal(data.total);
      setPage(1);
    } finally {
      setCategorizing(false);
    }
  }

  async function changeCategory(txId, categoryId) {
    const updated = await adminApi.patch(`/finance/transactions/${txId}`, {
      categoryId: categoryId ? Number(categoryId) : null,
    });
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txId
          ? { ...t, category_id: updated.category_id, category_name: categories.find((c) => c.id === updated.category_id)?.name || null }
          : t
      )
    );
  }

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  return (
    <div className="finance-overview-tab">
      <div className="finance-section">
        <div className="finance-subtitle">Kontoer</div>
        {accounts.length === 0 && <div className="finance-hint">Ingen kontoer ennå – legg til under Opplasting.</div>}
        <ul className="finance-account-list">
          {accounts.map((a) => (
            <li key={a.id} className="finance-account-list-item">
              <span>
                {a.bank_name} – {a.account_name}
              </span>
              <span className={a.balance < 0 ? 'finance-amount-negative' : ''}>
                {a.balance != null ? `${formatMoney(a.balance)} kr` : '–'}
              </span>
            </li>
          ))}
        </ul>
        {accounts.length > 0 && (
          <div className="finance-total-balance">Sum: {formatMoney(totalBalance)} kr</div>
        )}
      </div>

      <div className="finance-section">
        <div className="finance-header-row">
          <div className="finance-subtitle">Transaksjoner</div>
          <button className="btn btn-icon" onClick={categorizeNow} disabled={categorizing}>
            {categorizing ? 'Kategoriserer…' : 'Kategoriser ukategoriserte nå'}
          </button>
        </div>
        {categorizeMessage && <div className="finance-message">{categorizeMessage}</div>}
        <div className="finance-filter-row">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="">Alle kontoer</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name} – {a.account_name}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Alle kategorier</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input placeholder="Søk…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {transactions.length === 0 && <div className="finance-hint">Ingen transaksjoner funnet.</div>}
        <ul className="finance-transaction-list">
          {transactions.map((t) => (
            <li key={t.id} className="finance-transaction-item">
              <span className="finance-tx-date">{formatDate(t.date)}</span>
              <span className="finance-tx-counterparty">{t.counterparty || t.raw_description || '–'}</span>
              <span className={`finance-tx-amount ${t.amount < 0 ? 'finance-amount-negative' : 'finance-amount-positive'}`}>
                {formatMoney(t.amount)} kr
              </span>
              <select value={t.category_id || ''} onChange={(e) => changeCategory(t.id, e.target.value)}>
                <option value="">Ukategorisert</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        {total > transactions.length && (
          <button className="btn btn-icon" onClick={loadMore}>
            Last inn flere ({transactions.length} av {total})
          </button>
        )}
      </div>
    </div>
  );
}
