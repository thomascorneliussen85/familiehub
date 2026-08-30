import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { useAnsatt } from '../context/AnsattContext';

function formatTid(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function BeskjedPanel() {
  const { aktiv } = useAnsatt();
  const [beskjeder, setBeskjeder] = useState([]);
  const [tekst, setTekst] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/beskjeder').then(setBeskjeder).catch((err) => setError(err.message));
    socket.on('beskjeder:update', setBeskjeder);
    return () => socket.off('beskjeder:update', setBeskjeder);
  }, []);

  async function send() {
    if (!tekst.trim()) return;
    try {
      await api.post('/beskjeder', { tekst: tekst.trim(), forfatter: aktiv?.navn || null });
      setTekst('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📌 Beskjedtavle</div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="beskjed-add">
        <input
          placeholder="Skriv en beskjed til neste skift…"
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-accent" onClick={send} disabled={!tekst.trim()}>
          Send
        </button>
      </div>
      {beskjeder.length === 0 && <div className="empty-hint">Ingen beskjeder ennå.</div>}
      <div className="beskjed-list">
        {beskjeder.map((b) => (
          <div key={b.id} className="beskjed-item">
            <div className="beskjed-item-head">
              <strong>{b.forfatter || 'Ukjent'}</strong>
              <span className="beskjed-item-time">{formatTid(b.created_at)}</span>
            </div>
            <div>{b.tekst}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
