import { useEffect, useState } from 'react';

export default function FinanceSetupWizard({ adminApi }) {
  const [status, setStatus] = useState(null);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [ebAppId, setEbAppId] = useState('');
  const [ebPem, setEbPem] = useState('');
  const [ebActive, setEbActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    adminApi.get('/finance-setup').then((data) => {
      setStatus(data);
      setDomain(data.domain || '');
      setEbAppId(data.enableBankingAppId || '');
      setEbActive(data.enableBankingActive);
    });
  }

  useEffect(load, [adminApi]);

  async function saveClaudeKey() {
    setSaving(true);
    setMessage('');
    try {
      await adminApi.patch('/finance-setup', { claudeApiKey, domain });
      setClaudeApiKey('');
      setMessage('Lagret ✓');
      load();
    } finally {
      setSaving(false);
    }
  }

  async function saveEnableBanking() {
    setSaving(true);
    setMessage('');
    try {
      const patch = { enableBankingActive: ebActive };
      if (ebAppId) patch.enableBankingAppId = ebAppId;
      if (ebPem) patch.enableBankingPem = ebPem;
      await adminApi.patch('/finance-setup', patch);
      setEbPem('');
      setMessage('Lagret ✓');
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!status) return null;

  return (
    <div className="finance-setup-wizard">
      {!status.encryptionConfigured && (
        <div className="finance-error">
          FINANCE_ENCRYPTION_KEY er ikke satt på serveren. Generer én med <code>openssl rand -hex 32</code> og legg den
          i .env – ellers kan ikke nøkler lagres trygt.
        </div>
      )}

      <div className="finance-section">
        <div className="finance-subtitle">Claude API-nøkkel</div>
        <div className="finance-hint">
          Brukes til kategorisering, ukesbrief og chat. Uten nøkkel vises demo-innhold i stedet. Hent en nøkkel på{' '}
          console.anthropic.com.
        </div>
        <div className="finance-setup-row">
          <input
            type="password"
            placeholder={status.claudeKeyConfigured ? '•••••••••• (satt)' : 'sk-ant-…'}
            value={claudeApiKey}
            onChange={(e) => setClaudeApiKey(e.target.value)}
          />
        </div>
        <div className="finance-setup-row">
          <label className="finance-setup-label">Domene (for tilbakekoblinger)</label>
          <input placeholder="familiehub.eksempel.no" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <button className="btn btn-accent" onClick={saveClaudeKey} disabled={saving}>
          Lagre
        </button>
        {message && <div className="finance-message">{message}</div>}
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Enable Banking (ekte kontotilkobling)</div>
        {!status.globalEnableBankingActive ? (
          <div className="finance-hint">
            Kommer snart – krever en Enable Banking-avtale (Application ID + nøkkel) som ikke er satt opp på denne
            installasjonen ennå. Kontoutskrifter via CSV fungerer i mellomtiden.
          </div>
        ) : (
          <>
            <div className="finance-setup-row">
              <label className="finance-setup-label">Application ID</label>
              <input value={ebAppId} onChange={(e) => setEbAppId(e.target.value)} />
            </div>
            <div className="finance-setup-row">
              <label className="finance-setup-label">
                Privat nøkkel (PEM) {status.enableBankingPemConfigured && '(satt)'}
              </label>
              <textarea
                rows={4}
                placeholder="-----BEGIN PRIVATE KEY-----…"
                value={ebPem}
                onChange={(e) => setEbPem(e.target.value)}
              />
            </div>
            <label className="finance-setup-checkbox">
              <input type="checkbox" checked={ebActive} onChange={(e) => setEbActive(e.target.checked)} />
              Aktiver kontosynk for denne familien
            </label>
            <button className="btn btn-accent" onClick={saveEnableBanking} disabled={saving}>
              Lagre
            </button>
          </>
        )}
      </div>
    </div>
  );
}
