import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

function formatDato(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function KalenderPanel() {
  const [hendelser, setHendelser] = useState([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [tittel, setTittel] = useState('');
  const [dato, setDato] = useState(new Date().toISOString().slice(0, 10));
  const [notat, setNotat] = useState('');

  function load() {
    api
      .get('/kalender')
      .then((rows) => setHendelser(rows.filter((h) => new Date(h.slutt_at) >= new Date()).slice(0, 10)))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    socket.on('kalender:update', load);
    return () => socket.off('kalender:update', load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function leggTil() {
    if (!tittel.trim()) return;
    try {
      await api.post('/kalender', {
        tittel: tittel.trim(),
        startAt: `${dato}T00:00:00`,
        sluttAt: `${dato}T23:59:59`,
        allDay: true,
        notat: notat.trim() || null,
      });
      setTittel('');
      setNotat('');
      setShowAdd(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function slett(id) {
    await api.delete(`/kalender/${id}`).catch(() => {});
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📅 Kalender</div>
        <button className="btn btn-icon" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? '✕' : '+'}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}

      {showAdd && (
        <div className="turnus-add">
          <input placeholder="Tittel (f.eks. Varetelling)" value={tittel} onChange={(e) => setTittel(e.target.value)} />
          <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} />
          <input placeholder="Notat (valgfritt)" value={notat} onChange={(e) => setNotat(e.target.value)} />
          <button className="btn btn-accent" onClick={leggTil} disabled={!tittel.trim()}>
            Legg til
          </button>
        </div>
      )}

      {hendelser.length === 0 && <div className="empty-hint">Ingen kommende hendelser.</div>}
      <div className="kalender-list">
        {hendelser.map((h) => (
          <div key={h.id} className="kalender-item">
            <span className="kalender-dato">{formatDato(h.start_at)}</span>
            <div className="kalender-info">
              <div>{h.tittel}</div>
              {h.notat && <div className="kalender-notat">{h.notat}</div>}
            </div>
            <button className="turnus-slett" onClick={() => slett(h.id)} aria-label="Slett">
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
