import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './FinanceWidget.css';

const STATUS_ICON = { ok: '🟢', warning: '🟡', over: '🔴', unconfigured: '⚪' };
const STALE_DAYS = 14;

function formatMoney(n) {
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 0 });
}
function formatDueDate(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' });
}
function daysSince(iso) {
  return Math.floor((Date.now() - new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z').getTime()) / (24 * 60 * 60 * 1000));
}

// Nivå 1: kun aggregerte tall (budsjett-status, sum brukt, regningsnavn +
// forfallsdato) – ALDRI saldoer eller enkelttransaksjoner, siden dette
// kortet vises på hoveddashbordet uten PIN-opplåsing. Full oversikt krever
// PIN via FinancePage (åpnes ved klikk).
export default function FinanceWidget({ onOpen }) {
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [powerPrice, setPowerPrice] = useState(null);

  useEffect(() => {
    api.get('/finance/summary').then(setSummary).catch(() => {});
    api.get('/finance/upcoming-bills').then(setBills).catch(() => {});
    api.get('/power-price').then(setPowerPrice).catch(() => {});
  }, []);

  if (!summary) return null;

  const stale = summary.lastImportAt && daysSince(summary.lastImportAt) > STALE_DAYS;
  const noData = !summary.lastImportAt;
  const currentPricePerKwh = powerPrice?.today?.[powerPrice.currentHour]?.nokPerKwh;

  return (
    <section className="panel panel-finance" onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }} role="button" tabIndex={0}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">💰</span> Økonomi
        </div>
        <span className="finance-widget-status">{stale || noData ? '⚪' : STATUS_ICON[summary.status]}</span>
      </div>
      <div className="panel-body">
        {noData ? (
          <div className="finance-widget-empty">Ingen data ennå – trykk for å laste opp kontoutskrift.</div>
        ) : stale ? <div className="hub-inline-warning"><strong>Økonomien må oppdateres</strong><p>Siste import er {daysSince(summary.lastImportAt)} dager gammel. Åpne økonomi for å oppdatere tallene.</p></div> : (
          <>
            <div className="finance-widget-spend-row">
              <span>{formatMoney(summary.spentTotal)} kr brukt</span>
              {summary.budgetTotal > 0 && <span className="finance-widget-budget">av {formatMoney(summary.budgetTotal)} kr</span>}
            </div>
            {summary.budgetTotal > 0 && (
              <div className="finance-widget-bar-track">
                <div
                  className={`finance-widget-bar-fill finance-widget-bar-${summary.status}`}
                  style={{ width: `${Math.min(100, (summary.spentTotal / summary.budgetTotal) * 100)}%` }}
                />
              </div>
            )}

            {bills.length > 0 && (
              <div className="finance-widget-bills">
                {bills.slice(0, 3).map((b, i) => (
                  <span key={i} className="finance-widget-bill">
                    {b.counterparty} {formatDueDate(b.next_due_date)}
                  </span>
                ))}
              </div>
            )}

            {currentPricePerKwh != null && (
              <div className="finance-widget-power">Strøm nå: {currentPricePerKwh.toFixed(2)} kr/kWh</div>
            )}

            {stale && <div className="finance-widget-stale">Ingen ny data på {daysSince(summary.lastImportAt)} dager</div>}
          </>
        )}
      </div>
    </section>
  );
}
