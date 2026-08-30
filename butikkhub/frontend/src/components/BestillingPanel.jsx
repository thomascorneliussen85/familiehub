import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { useAnsatt } from '../context/AnsattContext';

const STATUS_LABEL = { meldt: 'Meldt', bestilt: 'Bestilt', mottatt: 'Mottatt' };
const NEXT_LABEL = { meldt: 'Merk som bestilt', bestilt: 'Merk som mottatt' };

export default function BestillingPanel() {
  const { aktivId } = useAnsatt();
  const [rader, setRader] = useState([]);
  const [error, setError] = useState('');
  const [vare, setVare] = useState('');
  const [notat, setNotat] = useState('');

  useEffect(() => {
    api.get('/bestillinger').then(setRader).catch((err) => setError(err.message));
    socket.on('bestillinger:update', setRader);
    return () => socket.off('bestillinger:update', setRader);
  }, []);

  async function meldFra() {
    if (!vare.trim()) return;
    try {
      await api.post('/bestillinger', { vare: vare.trim(), notat: notat.trim() || null, ansattId: aktivId });
      setVare('');
      setNotat('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function nesteStatus(id) {
    await api.post(`/bestillinger/${id}/neste-status`).catch((err) => setError(err.message));
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📦 Bestillinger (tomt for noe)</div>
      </div>
      {error && <div className="error-text">{error}</div>}

      <div className="beskjed-add">
        <input placeholder="Vare (f.eks. Lettmelk 1,5L)" value={vare} onChange={(e) => setVare(e.target.value)} />
        <input placeholder="Notat" value={notat} onChange={(e) => setNotat(e.target.value)} className="bestilling-notat-input" />
        <button className="btn btn-accent" onClick={meldFra} disabled={!vare.trim()}>
          Meld fra
        </button>
      </div>

      {rader.length === 0 && <div className="empty-hint">Ingen aktive bestillinger.</div>}
      <div className="bestilling-list">
        {rader.map((b) => (
          <div key={b.id} className="bestilling-item">
            <div className="bestilling-info">
              <strong>{b.vare}</strong>
              {b.notat && <span className="bestilling-notat"> — {b.notat}</span>}
              <div className="bestilling-meta">Meldt av {b.meldt_av_navn || 'ukjent'}</div>
            </div>
            <span className={`pill pill-${b.status}`}>{STATUS_LABEL[b.status]}</span>
            <button className="btn" onClick={() => nesteStatus(b.id)}>
              {NEXT_LABEL[b.status]}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
