import { useEffect, useRef, useState } from 'react';
import ColumnMappingModal from './ColumnMappingModal';

function formatDateTime(iso) {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FinanceUploadTab({ adminApi }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [imports, setImports] = useState([]);
  const [preview, setPreview] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function loadAccounts() {
    adminApi.get('/finance/accounts').then((data) => {
      setAccounts(data);
      if (!accountId && data.length > 0) setAccountId(String(data[0].id));
    });
  }
  function loadImports() {
    adminApi.get('/finance-import/imports').then(setImports);
  }

  useEffect(() => {
    loadAccounts();
    loadImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAccount() {
    if (!newBankName.trim() || !newAccountName.trim()) return;
    const account = await adminApi.post('/finance/accounts', {
      bankName: newBankName.trim(),
      accountName: newAccountName.trim(),
    });
    setAccounts((prev) => [...prev, account]);
    setAccountId(String(account.id));
    setNewBankName('');
    setNewAccountName('');
    setShowNewAccount(false);
  }

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    setError('');
    setMessage('');
    const account = accounts.find((a) => String(a.id) === accountId);
    const form = new FormData();
    form.append('file', file);
    if (account) form.append('bankName', account.bank_name);
    try {
      const result = await adminApi.postForm('/finance-import/preview', form);
      setPreview(result);
      setPendingFile(file);
    } catch (err) {
      setError(err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function confirmImport(mapping) {
    if (!pendingFile || !accountId) return;
    setImporting(true);
    setError('');
    const account = accounts.find((a) => String(a.id) === accountId);
    const form = new FormData();
    form.append('file', pendingFile);
    form.append('accountId', accountId);
    if (account) form.append('bankName', account.bank_name);
    form.append('mapping', JSON.stringify(mapping));
    try {
      const result = await adminApi.postForm('/finance-import/import', form);
      setMessage(`${result.newCount} nye transaksjoner importert (${result.duplicateCount} duplikater hoppet over).`);
      setPreview(null);
      setPendingFile(null);
      loadImports();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function undoImport(id) {
    await adminApi.post(`/finance-import/imports/${id}/undo`);
    loadImports();
  }

  return (
    <div className="finance-upload-tab">
      <div className="finance-section">
        <div className="finance-subtitle">Konto</div>
        <div className="finance-account-row">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 && <option value="">Ingen kontoer ennå</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name} – {a.account_name}
              </option>
            ))}
          </select>
          <button className="btn btn-icon" onClick={() => setShowNewAccount((v) => !v)}>
            + Ny konto
          </button>
        </div>
        {showNewAccount && (
          <div className="finance-new-account">
            <input placeholder="Bank (f.eks. DNB)" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
            <input
              placeholder="Kontonavn (f.eks. Brukskonto)"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
            <button className="btn btn-accent" onClick={createAccount}>
              Opprett
            </button>
          </div>
        )}
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Last opp CSV-fil</div>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileSelected} disabled={!accountId} />
        {!accountId && <div className="finance-hint">Velg eller opprett en konto først.</div>}
        {message && <div className="finance-message">{message}</div>}
        {error && <div className="finance-error">{error}</div>}
      </div>

      <div className="finance-section">
        <div className="finance-subtitle">Importhistorikk</div>
        {imports.length === 0 && <div className="finance-hint">Ingen importer ennå.</div>}
        <ul className="finance-import-list">
          {imports.map((imp) => (
            <li key={imp.id} className="finance-import-item">
              <span className="finance-import-filename">{imp.filename || 'Uten navn'}</span>
              <span className="finance-import-meta">
                {formatDateTime(imp.imported_at)} · {imp.new_count} nye, {imp.duplicate_count} duplikater
              </span>
              {imp.status === 'active' ? (
                <button className="btn btn-icon" onClick={() => undoImport(imp.id)}>
                  Angre
                </button>
              ) : (
                <span className="finance-import-rolledback">Angret</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {preview && (
        <ColumnMappingModal
          preview={preview}
          importing={importing}
          onConfirm={confirmImport}
          onClose={() => {
            setPreview(null);
            setPendingFile(null);
          }}
        />
      )}
    </div>
  );
}
