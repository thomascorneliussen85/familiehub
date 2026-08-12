import { useEffect, useState } from 'react';
import { createAdminApi } from '../../lib/adminApi';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import FinanceUploadTab from './FinanceUploadTab';
import FinanceOverviewTab from './FinanceOverviewTab';
import FinanceBudgetTab from './FinanceBudgetTab';
import FinanceChartsTab from './FinanceChartsTab';
import FinanceBriefTab from './FinanceBriefTab';
import FinanceSetupWizard from './FinanceSetupWizard';
import './FinancePage.css';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'tøm', '0', '⌫'];
const RELOCK_IDLE_MINUTES = 2;

const TABS = [
  { key: 'oversikt', label: 'Oversikt' },
  { key: 'opplasting', label: 'Opplasting' },
  { key: 'budsjett', label: 'Budsjett' },
  { key: 'diagrammer', label: 'Diagrammer' },
  { key: 'brief', label: 'Brief & chat' },
  { key: 'oppsett', label: 'Oppsett' },
];

export default function FinancePage({ onClose }) {
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [adminApi, setAdminApi] = useState(null);
  const [tab, setTab] = useState('oversikt');

  // Nivå 2 (kontoer/transaksjoner/budsjett) låser seg automatisk igjen etter
  // 2 minutter uten aktivitet – en egen, uavhengig useIdleTimer-instans fra
  // fotoramme-modusens (5 min i App.jsx), siden den kun skal telle mens
  // denne siden faktisk er åpen og låst opp.
  const idle = useIdleTimer(RELOCK_IDLE_MINUTES);
  useEffect(() => {
    if (idle && adminApi) {
      setAdminApi(null);
      setPin('');
    }
  }, [idle, adminApi]);

  async function submitPin(candidate) {
    const res = await fetch('/api/relay/verify-pin', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: candidate }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false }));

    if (res.ok) {
      setAdminApi(() => createAdminApi(candidate));
    } else {
      setPinError(true);
      setTimeout(() => {
        setPin('');
        setPinError(false);
      }, 500);
    }
  }

  function pressKey(key) {
    if (key === 'tøm') return setPin('');
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) submitPin(next);
  }

  if (!adminApi) {
    return (
      <div className="finance-overlay">
        <div className="finance-modal finance-pin-modal">
          <button className="finance-close" onClick={onClose} aria-label="Lukk">
            ✕
          </button>
          <div className="finance-pin-title">💰 Skriv inn foreldre-PIN</div>
          <div className={`finance-pin-dots ${pinError ? 'finance-pin-error' : ''}`}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span key={i} className={`finance-pin-dot ${i < pin.length ? 'finance-pin-dot-filled' : ''}`} />
            ))}
          </div>
          <div className="finance-pin-keypad">
            {KEYS.map((k) => (
              <button key={k} onClick={() => pressKey(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="finance-overlay">
      <div className="finance-modal">
        <button className="finance-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="finance-header-row">
          <span className="finance-title">💰 Økonomi</span>
        </div>
        <div className="finance-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`finance-tab ${tab === t.key ? 'finance-tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="finance-tab-content">
          {tab === 'oversikt' && <FinanceOverviewTab adminApi={adminApi} />}
          {tab === 'opplasting' && <FinanceUploadTab adminApi={adminApi} />}
          {tab === 'budsjett' && <FinanceBudgetTab adminApi={adminApi} />}
          {tab === 'diagrammer' && <FinanceChartsTab adminApi={adminApi} />}
          {tab === 'brief' && <FinanceBriefTab adminApi={adminApi} />}
          {tab === 'oppsett' && <FinanceSetupWizard adminApi={adminApi} />}
        </div>
      </div>
    </div>
  );
}
