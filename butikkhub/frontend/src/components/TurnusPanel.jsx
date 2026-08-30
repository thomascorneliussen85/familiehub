import { useEffect, useState } from 'react';
import { api, withPin } from '../lib/api';
import { useAnsatt } from '../context/AnsattContext';
import PinModal from './PinModal';

const TYPE_LABEL = { apne: 'Åpner', lukke: 'Stenger', normal: 'Normal' };

function weekDates() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function formatDag(dato) {
  const d = new Date(dato + 'T00:00:00');
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function TurnusPanel() {
  const { ansatte } = useAnsatt();
  const [skift, setSkift] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ansattId: '', dato: weekDates()[0], startTid: '08:00', sluttTid: '16:00', type: 'normal' });

  const dager = weekDates();

  function load() {
    api
      .get(`/skift?fra=${dager[0]}&til=${dager[6]}`)
      .then(setSkift)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function submitWithPin(pin) {
    setShowPin(false);
    try {
      await withPin(pin).post('/skift', form);
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const [slettId, setSlettId] = useState(null);

  async function slettMedPin(pin) {
    if (slettId == null) return;
    await withPin(pin).delete(`/skift/${slettId}`);
    setSlettId(null);
    load();
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📋 Turnusliste (denne uken)</div>
        <button className="btn btn-icon" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? '✕' : '+'}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}

      {showAdd && (
        <div className="turnus-add">
          <select value={form.ansattId} onChange={(e) => setForm({ ...form, ansattId: e.target.value })}>
            <option value="">Velg ansatt…</option>
            {ansatte.map((a) => (
              <option key={a.id} value={a.id}>
                {a.navn}
              </option>
            ))}
          </select>
          <select value={form.dato} onChange={(e) => setForm({ ...form, dato: e.target.value })}>
            {dager.map((d) => (
              <option key={d} value={d}>
                {formatDag(d)}
              </option>
            ))}
          </select>
          <div className="turnus-add-row">
            <input type="time" value={form.startTid} onChange={(e) => setForm({ ...form, startTid: e.target.value })} />
            <input type="time" value={form.sluttTid} onChange={(e) => setForm({ ...form, sluttTid: e.target.value })} />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="apne">Åpner</option>
              <option value="normal">Normal</option>
              <option value="lukke">Stenger</option>
            </select>
          </div>
          <button className="btn btn-accent" onClick={() => setShowPin(true)} disabled={!form.ansattId}>
            Legg til skift
          </button>
        </div>
      )}

      <div className="turnus-list">
        {dager.map((dato) => {
          const dagensSkift = skift.filter((s) => s.dato === dato);
          return (
            <div key={dato} className="turnus-dag">
              <div className="turnus-dag-label">{formatDag(dato)}</div>
              {dagensSkift.length === 0 && <div className="turnus-tomt">–</div>}
              {dagensSkift.map((s) => (
                <div key={s.id} className="turnus-rad">
                  <span className="ansatt-chip-avatar" style={{ background: s.ansatt_farge }}>
                    {s.ansatt_navn?.[0]}
                  </span>
                  <span>{s.ansatt_navn}</span>
                  <span className="turnus-tid">
                    {s.start_tid}–{s.slutt_tid}
                  </span>
                  <span className="pill">{TYPE_LABEL[s.type]}</span>
                  <button className="turnus-slett" onClick={() => setSlettId(s.id)} aria-label="Slett skift">
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {showPin && <PinModal onSuccess={submitWithPin} onClose={() => setShowPin(false)} />}
      {slettId != null && <PinModal onSuccess={slettMedPin} onClose={() => setSlettId(null)} />}
    </div>
  );
}
