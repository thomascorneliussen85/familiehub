import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function formatDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Rollout() {
  const [hubs, setHubs] = useState([]);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedHub, setSelectedHub] = useState('');
  const [malversjon, setMalversjon] = useState('');

  const [oneHub, setOneHub] = useState('');
  const [oneVersjon, setOneVersjon] = useState('');

  function load() {
    Promise.all([api.get('/hubs'), api.get('/rollout')])
      .then(([h, s]) => {
        setHubs(h);
        setState(s);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function startTest() {
    if (!selectedHub || !malversjon.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/rollout/start-test', { hubId: selectedHub, malversjon: malversjon.trim() });
      setMessage('Testhub satt ✓');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 4000);
    }
  }

  async function deployRest() {
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/rollout/deploy-rest');
      setMessage(`Rullet ut versjon ${result.malversjon} til ${result.utrullet} hub(er) ✓`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deployOne() {
    if (!oneHub || !oneVersjon.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/rollout/deploy-one', { hubId: oneHub, versjon: oneVersjon.trim() });
      setMessage('Versjon satt for hub ✓');
      setOneVersjon('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 4000);
    }
  }

  return (
    <div>
      <h1>Utrulling</h1>
      {message && <div className="save-msg">{message}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="detail-grid">
        <div className="panel">
          <h2>Obligatorisk arbeidsflyt: test → rull ut</h2>
          <p className="rollout-hint">
            Velg én hub som testhub og en målversjon. Testhuben må være grønn og feilfri i minst 24 timer før du kan
            rulle ut til resten.
          </p>
          <label>Testhub</label>
          <select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
            <option value="">Velg hub…</option>
            {hubs.map((h) => (
              <option key={h.hub_id} value={h.hub_id}>
                {h.kundenavn} ({h.hub_id})
              </option>
            ))}
          </select>
          <label>Målversjon</label>
          <input placeholder="f.eks. 1.5.0" value={malversjon} onChange={(e) => setMalversjon(e.target.value)} />
          <button className="btn btn-accent" onClick={startTest} disabled={busy || !selectedHub || !malversjon.trim()}>
            Start testperiode
          </button>

          {state?.test_hub_id && (
            <div className="rollout-status">
              <div className="kv-grid">
                <span>Testhub</span>
                <span>{hubs.find((h) => h.hub_id === state.test_hub_id)?.kundenavn || state.test_hub_id}</span>
                <span>Målversjon</span>
                <span>{state.malversjon}</span>
                <span>Testperiode startet</span>
                <span>{formatDate(state.test_started_at)}</span>
                <span>Status</span>
                <span className={state.ready ? 'rollout-ready' : 'rollout-not-ready'}>
                  {state.ready ? 'Klar for utrulling ✓' : state.reason}
                </span>
              </div>
              <button className="btn btn-danger" onClick={deployRest} disabled={busy || !state.ready}>
                Rull ut til resten
              </button>
              {!state.ready && (
                <div className="rollout-warning">
                  ⚠️ Knappen er sperret til testperioden er bekreftet fullført og feilfri – dette er en obligatorisk
                  sikkerhetssperre, ikke bare et hint.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Sett versjon for én hub direkte</h2>
          <p className="rollout-hint">Utenom test-arbeidsflyten – for enkelthub-justeringer.</p>
          <label>Hub</label>
          <select value={oneHub} onChange={(e) => setOneHub(e.target.value)}>
            <option value="">Velg hub…</option>
            {hubs.map((h) => (
              <option key={h.hub_id} value={h.hub_id}>
                {h.kundenavn} ({h.hub_id})
              </option>
            ))}
          </select>
          <label>Versjon</label>
          <input placeholder="f.eks. 1.5.0" value={oneVersjon} onChange={(e) => setOneVersjon(e.target.value)} />
          <button className="btn btn-accent" onClick={deployOne} disabled={busy || !oneHub || !oneVersjon.trim()}>
            Sett versjon
          </button>
        </div>
      </div>
    </div>
  );
}
