import { useEffect, useState } from 'react';
import { api, withPin } from '../lib/api';
import { socket } from '../lib/socket';
import { useAnsatt } from '../context/AnsattContext';
import PinModal from './PinModal';

function formatTid(iso) {
  if (!iso) return 'Aldri målt';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TemperaturPanel() {
  const { aktivId } = useAnsatt();
  const [enheter, setEnheter] = useState([]);
  const [error, setError] = useState('');
  const [malingId, setMalingId] = useState(null);
  const [malingVerdi, setMalingVerdi] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [nyNavn, setNyNavn] = useState('');
  const [nyMin, setNyMin] = useState('');
  const [nyMax, setNyMax] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showShellyInfo, setShowShellyInfo] = useState(false);

  function load() {
    api
      .get('/temperatur/enheter')
      .then(setEnheter)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    socket.on('temperatur:update', setEnheter);
    return () => socket.off('temperatur:update', setEnheter);
  }, []);

  async function loggMaling() {
    if (malingId == null || malingVerdi === '') return;
    try {
      await api.post(`/temperatur/enheter/${malingId}/mal`, { temperatur: Number(malingVerdi), ansattId: aktivId });
      setMalingId(null);
      setMalingVerdi('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function leggTilEnhetMedPin(pin) {
    if (!nyNavn.trim() || nyMin === '' || nyMax === '') return;
    try {
      await withPin(pin).post('/temperatur/enheter', { navn: nyNavn.trim(), minTemp: Number(nyMin), maxTemp: Number(nyMax) });
      setNyNavn('');
      setNyMin('');
      setNyMax('');
      setShowAdd(false);
      setShowPin(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">🌡️ Temperaturkontroll</div>
        <div className="temp-header-actions">
          <button className="btn temp-shelly-btn" onClick={() => setShowShellyInfo((v) => !v)}>
            🔌 Koble til sensor
          </button>
          <button className="btn btn-icon" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '✕' : '+'}
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}

      {showShellyInfo && (
        <div className="temp-shelly-info">
          <strong>Kommer snart: automatisk logging med Shelly-sensor</strong>
          <p>
            Koble en Shelly Plus Add-On med en DS18B20-temperaturprobe til en av enhetene over, så logges
            temperaturen automatisk – ingen manuell «Logg måling» nødvendig. Ikke tilgjengelig ennå, si ifra når
            dere har en sensor klar.
          </p>
          <button className="btn" onClick={() => setShowShellyInfo(false)}>
            Lukk
          </button>
        </div>
      )}

      {showAdd && (
        <div className="turnus-add">
          <input placeholder="Navn (f.eks. Fryser 2)" value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} />
          <div className="turnus-add-row">
            <input type="number" placeholder="Min °C" value={nyMin} onChange={(e) => setNyMin(e.target.value)} />
            <input type="number" placeholder="Maks °C" value={nyMax} onChange={(e) => setNyMax(e.target.value)} />
          </div>
          <button className="btn btn-accent" onClick={() => setShowPin(true)} disabled={!nyNavn.trim()}>
            Legg til enhet
          </button>
        </div>
      )}

      {enheter.length === 0 && <div className="empty-hint">Ingen temperaturenheter satt opp ennå.</div>}

      <div className="temp-list">
        {enheter.map((e) => (
          <div key={e.id} className={`temp-item ${e.sisteMaling?.avvik ? 'temp-avvik' : ''}`}>
            <div className="temp-item-head">
              <strong>{e.navn}</strong>
              <span className="temp-range">
                {e.min_temp}° til {e.max_temp}°
              </span>
            </div>
            <div className="temp-item-body">
              <span className={`temp-value ${e.sisteMaling?.avvik ? 'temp-value-avvik' : ''}`}>
                {e.sisteMaling ? `${e.sisteMaling.temperatur}°C` : '–'}
              </span>
              <span className="temp-meta">
                {formatTid(e.sisteMaling?.malt_at)}
                {e.sisteMaling?.malt_av_navn && ` · ${e.sisteMaling.malt_av_navn}`}
              </span>
            </div>
            {Boolean(e.sisteMaling?.avvik) && <div className="temp-warning">⚠️ Avvik fra grenseverdi</div>}
            {malingId === e.id ? (
              <div className="turnus-add-row">
                <input
                  type="number"
                  step="0.1"
                  autoFocus
                  placeholder="°C"
                  value={malingVerdi}
                  onChange={(ev) => setMalingVerdi(ev.target.value)}
                  onKeyDown={(ev) => ev.key === 'Enter' && loggMaling()}
                />
                <button className="btn btn-accent" onClick={loggMaling}>
                  Lagre
                </button>
                <button className="btn" onClick={() => setMalingId(null)}>
                  Avbryt
                </button>
              </div>
            ) : (
              <button className="btn" onClick={() => setMalingId(e.id)}>
                Logg måling
              </button>
            )}
          </div>
        ))}
      </div>

      {showPin && <PinModal onSuccess={leggTilEnhetMedPin} onClose={() => setShowPin(false)} />}
    </div>
  );
}
