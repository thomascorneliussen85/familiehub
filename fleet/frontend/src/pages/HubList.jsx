import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

function formatSistSett(iso) {
  if (!iso) return 'Aldri sett';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function HubList() {
  const [hubs, setHubs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [kundenavn, setKundenavn] = useState('');
  const [kontaktEpost, setKontaktEpost] = useState('');
  const [adresseNotat, setAdresseNotat] = useState('');
  const [newHubResult, setNewHubResult] = useState(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api
      .get('/hubs')
      .then(setHubs)
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  async function addHub() {
    if (!kundenavn.trim()) return;
    setAdding(true);
    setError('');
    try {
      const result = await api.post('/hubs/register', {
        kundenavn: kundenavn.trim(),
        kontaktEpost: kontaktEpost.trim() || null,
        adresseNotat: adresseNotat.trim() || null,
      });
      setNewHubResult(result);
      setKundenavn('');
      setKontaktEpost('');
      setAdresseNotat('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Hubber</h1>
        <button className="btn btn-accent" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Avbryt' : '+ Legg til hub'}
        </button>
      </div>

      {showAdd && (
        <div className="panel add-hub-panel">
          <div className="add-hub-fields">
            <input placeholder="Kundenavn" value={kundenavn} onChange={(e) => setKundenavn(e.target.value)} />
            <input placeholder="Kontakt-e-post" value={kontaktEpost} onChange={(e) => setKontaktEpost(e.target.value)} />
            <input placeholder="Adressenotat" value={adresseNotat} onChange={(e) => setAdresseNotat(e.target.value)} />
            <button className="btn btn-accent" onClick={addHub} disabled={adding || !kundenavn.trim()}>
              {adding ? 'Oppretter…' : 'Opprett'}
            </button>
          </div>
          {newHubResult && (
            <div className="new-hub-result">
              <strong>Hub opprettet.</strong> Kopier disse inn i FamilieHub sin .env NÅ – api-nøkkelen vises kun her:
              <div className="new-hub-creds">
                <div>FLEET_HUB_ID={newHubResult.hubId}</div>
                <div>FLEET_API_KEY={newHubResult.apiKey}</div>
              </div>
              <button className="btn" onClick={() => setNewHubResult(null)}>
                Lukk
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-text">{error}</div>}

      {loaded && hubs.length === 0 && <div className="empty-hint">Ingen hubber registrert ennå.</div>}

      <div className="hub-table">
        {hubs.map((hub) => (
          <Link key={hub.hub_id} to={`/hub/${hub.hub_id}`} className="hub-row panel">
            <span className={`status-dot status-dot-${hub.statusFarge}`} title={hub.statusFarge} />
            <div className="hub-row-main">
              <div className="hub-row-name">{hub.kundenavn}</div>
              <div className="hub-row-meta">
                {hub.hub_id} · {formatSistSett(hub.status?.sist_sett)}
              </div>
            </div>
            <div className="hub-row-version">{hub.status?.app_versjon || '–'}</div>
            <span className={`pill pill-${hub.config?.abonnement_status}`}>{hub.config?.abonnement_status}</span>
            {!hub.aktiv && <span className="pill">deaktivert</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
