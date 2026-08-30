import { useEffect, useState } from 'react';
import { api, withPin } from '../lib/api';
import { socket } from '../lib/socket';
import { useAnsatt } from '../context/AnsattContext';
import PinModal from './PinModal';

const SKIFT_LABEL = { apne: 'Åpne-rutine', lukke: 'Lukke-rutine', alle: 'Hele dagen' };

export default function OppgaverPanel() {
  const { aktivId } = useAnsatt();
  const [oppgaver, setOppgaver] = useState([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [nyTittel, setNyTittel] = useState('');
  const [nySkiftType, setNySkiftType] = useState('alle');
  const [showPin, setShowPin] = useState(false);
  const [slettId, setSlettId] = useState(null);

  function load() {
    api
      .get('/oppgaver')
      .then(setOppgaver)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    socket.on('oppgaver:update', setOppgaver);
    return () => socket.off('oppgaver:update', setOppgaver);
  }, []);

  async function toggle(id) {
    try {
      await api.post(`/oppgaver/${id}/toggle`, { ansattId: aktivId });
    } catch (err) {
      setError(err.message);
    }
  }

  async function leggTilMedPin(pin) {
    if (!nyTittel.trim()) return;
    try {
      await withPin(pin).post('/oppgaver', { tittel: nyTittel.trim(), skiftType: nySkiftType });
      setNyTittel('');
      setShowAdd(false);
      setShowPin(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function slettMedPin(pin) {
    if (slettId == null) return;
    await withPin(pin).delete(`/oppgaver/${slettId}`);
    setSlettId(null);
    load();
  }

  const gjenstaende = oppgaver.filter((o) => !o.fullfort).length;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          ✅ Dagens oppgaver {gjenstaende === 0 && oppgaver.length > 0 ? '🎉' : `(${gjenstaende} igjen)`}
        </div>
        <button className="btn btn-icon" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? '✕' : '+'}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}

      {showAdd && (
        <div className="turnus-add">
          <input placeholder="Oppgave (f.eks. Vask kaffemaskin)" value={nyTittel} onChange={(e) => setNyTittel(e.target.value)} />
          <select value={nySkiftType} onChange={(e) => setNySkiftType(e.target.value)}>
            <option value="alle">Hele dagen</option>
            <option value="apne">Åpne-rutine</option>
            <option value="lukke">Lukke-rutine</option>
          </select>
          <button className="btn btn-accent" onClick={() => setShowPin(true)} disabled={!nyTittel.trim()}>
            Legg til oppgave
          </button>
        </div>
      )}

      {oppgaver.length === 0 && <div className="empty-hint">Ingen oppgaver satt opp ennå.</div>}

      <ul className="oppgave-list">
        {oppgaver.map((o) => (
          <li key={o.id} className={`oppgave-item ${o.fullfort ? 'oppgave-fullfort' : ''}`}>
            <label className="oppgave-checkbox">
              <input type="checkbox" checked={o.fullfort} onChange={() => toggle(o.id)} />
              <span>{o.tittel}</span>
            </label>
            <span className="pill">{SKIFT_LABEL[o.skift_type]}</span>
            {o.fullfort && o.fullfort_av_navn && <span className="oppgave-av">av {o.fullfort_av_navn}</span>}
            <button className="turnus-slett" onClick={() => setSlettId(o.id)} aria-label="Fjern oppgave">
              🗑️
            </button>
          </li>
        ))}
      </ul>

      {showPin && <PinModal onSuccess={leggTilMedPin} onClose={() => setShowPin(false)} />}
      {slettId != null && <PinModal onSuccess={slettMedPin} onClose={() => setSlettId(null)} />}
    </div>
  );
}
