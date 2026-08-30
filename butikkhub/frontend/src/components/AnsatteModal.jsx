import { useState } from 'react';
import { withPin } from '../lib/api';
import { useAnsatt } from '../context/AnsattContext';

const FARGER = ['#e5484d', '#5b8def', '#3ecf8e', '#e6b422', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#6366f1'];

export default function AnsatteModal({ pin, onClose }) {
  const { ansatte, reloadAnsatte } = useAnsatt();
  const [navn, setNavn] = useState('');
  const [rolle, setRolle] = useState('medarbeider');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const api = withPin(pin);

  async function leggTil() {
    if (!navn.trim()) return;
    setBusy(true);
    try {
      const farge = FARGER[ansatte.length % FARGER.length];
      await api.post('/ansatte', { navn: navn.trim(), rolle, farge });
      setNavn('');
      reloadAnsatte();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function fjern(id) {
    await api.delete(`/ansatte/${id}`).catch((err) => setError(err.message));
    reloadAnsatte();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <h2>Ansatte</h2>
        {error && <div className="error-text">{error}</div>}
        <div className="ansatte-list">
          {ansatte.map((a) => (
            <div key={a.id} className="ansatte-item">
              <span className="ansatt-chip-avatar" style={{ background: a.farge }}>
                {a.navn[0]}
              </span>
              <div className="ansatte-item-info">
                <div>{a.navn}</div>
                <div className="ansatte-item-rolle">{a.rolle}</div>
              </div>
              <button className="turnus-slett" onClick={() => fjern(a.id)} aria-label="Fjern ansatt">
                🗑️
              </button>
            </div>
          ))}
        </div>
        <div className="turnus-add">
          <input placeholder="Navn" value={navn} onChange={(e) => setNavn(e.target.value)} />
          <select value={rolle} onChange={(e) => setRolle(e.target.value)}>
            <option value="medarbeider">Medarbeider</option>
            <option value="assistent">Assistent</option>
            <option value="butikksjef">Butikksjef</option>
          </select>
          <button className="btn btn-accent" onClick={leggTil} disabled={busy || !navn.trim()}>
            Legg til ansatt
          </button>
        </div>
      </div>
    </div>
  );
}
