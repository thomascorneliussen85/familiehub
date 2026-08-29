import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Sparkline from '../components/Sparkline';

const MODULE_LABELS = {
  kalender: 'Kalender',
  gjoremal: 'Gjøremål',
  handleliste: 'Handleliste',
  prissjekk: 'Prissjekk',
  gps: 'GPS',
  smarthjem: 'Smarthjem',
  strompris: 'Strømpris',
  varme: 'Varme',
  kamera: 'Kamera',
  dorklokke: 'Dørklokke',
  babycall: 'Babycall',
  roykvarsler: 'Røykvarsler',
  vannalarm: 'Vannalarm',
  helse: 'Helse',
  morgenbrief: 'Morgenbrief',
  ut_og_leke: 'Ut og leke',
  fotoramme: 'Fotoramme',
  vaer_buss: 'Vær og buss',
};
const ALL_MODULE_KEYS = Object.keys(MODULE_LABELS);

function formatDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatUptime(seconds) {
  if (seconds == null) return '–';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}t`;
}

export default function HubDetail() {
  const { hubId } = useParams();
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [kundenavn, setKundenavn] = useState('');
  const [kontaktEpost, setKontaktEpost] = useState('');
  const [adresseNotat, setAdresseNotat] = useState('');
  const [notater, setNotater] = useState('');
  const [aktiv, setAktiv] = useState(true);

  const [abonnementStatus, setAbonnementStatus] = useState('aktiv');
  const [oppdateringskanal, setOppdateringskanal] = useState('stabil');
  const [moduler, setModuler] = useState([]);

  function load() {
    api
      .get(`/hubs/${hubId}`)
      .then((data) => {
        setHub(data);
        setKundenavn(data.kundenavn);
        setKontaktEpost(data.kontakt_epost || '');
        setAdresseNotat(data.adresse_notat || '');
        setNotater(data.notater || '');
        setAktiv(Boolean(data.aktiv));
        setAbonnementStatus(data.config?.abonnement_status || 'aktiv');
        setOppdateringskanal(data.config?.oppdateringskanal || 'stabil');
        setModuler(data.config?.moduler || []);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [hubId]);

  function toggleModule(key) {
    setModuler((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  async function saveHubInfo() {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.patch(`/hubs/${hubId}`, { kundenavn, kontaktEpost, adresseNotat, notater, aktiv });
      setSaveMsg('Lagret ✓');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.patch(`/config/${hubId}`, { abonnementStatus, oppdateringskanal, moduler });
      setSaveMsg('Konfigurasjon lagret ✓');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  }

  if (error && !hub) return <div className="error-text">{error}</div>;
  if (!hub) return null;

  const status = hub.status;

  return (
    <div>
      <button className="btn back-btn" onClick={() => navigate('/')}>
        ← Tilbake
      </button>

      <div className="page-header">
        <h1>
          <span className={`status-dot status-dot-${hub.statusFarge}`} /> {hub.kundenavn}
        </h1>
      </div>
      {saveMsg && <div className="save-msg">{saveMsg}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="detail-grid">
        <div className="panel">
          <h2>Status</h2>
          <div className="kv-grid">
            <span>Hub-ID</span>
            <span className="mono">{hub.hub_id}</span>
            <span>Sist sett</span>
            <span>{formatDate(status?.sist_sett)}</span>
            <span>App-versjon</span>
            <span>{status?.app_versjon || '–'}</span>
            <span>Oppetid</span>
            <span>{formatUptime(status?.oppetid_sekunder)}</span>
            <span>Fri diskplass</span>
            <span>{status?.fri_diskplass_mb != null ? `${Math.round(status.fri_diskplass_mb)} MB` : '–'}</span>
            <span>Minnebruk</span>
            <span>{status?.minnebruk_prosent != null ? `${status.minnebruk_prosent.toFixed(1)}%` : '–'}</span>
            <span>Tilkoblede enheter</span>
            <span>{status?.antall_tilkoblede_enheter ?? '–'}</span>
            <span>OS-versjon</span>
            <span>{status?.os_versjon || '–'}</span>
          </div>
          {hub.statusHistory?.length > 1 && (
            <div className="sparkline-block">
              <div className="sparkline-label">Minnebruk (%) siste målinger</div>
              <Sparkline data={hub.statusHistory.map((h) => h.minnebruk_prosent)} color="#5b8def" />
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Kundeinfo</h2>
          <label>Kundenavn</label>
          <input value={kundenavn} onChange={(e) => setKundenavn(e.target.value)} />
          <label>Kontakt-e-post</label>
          <input value={kontaktEpost} onChange={(e) => setKontaktEpost(e.target.value)} />
          <label>Adressenotat</label>
          <input value={adresseNotat} onChange={(e) => setAdresseNotat(e.target.value)} />
          <label>Notater</label>
          <textarea rows={3} value={notater} onChange={(e) => setNotater(e.target.value)} />
          <label className="checkbox-label">
            <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} /> Aktiv
          </label>
          <button className="btn btn-accent" onClick={saveHubInfo} disabled={saving}>
            Lagre kundeinfo
          </button>
        </div>

        <div className="panel">
          <h2>Konfigurasjon</h2>
          <label>Abonnementsstatus</label>
          <select value={abonnementStatus} onChange={(e) => setAbonnementStatus(e.target.value)}>
            <option value="aktiv">Aktiv</option>
            <option value="utlopt">Utløpt</option>
            <option value="pause">Pause</option>
          </select>
          <label>Oppdateringskanal</label>
          <select value={oppdateringskanal} onChange={(e) => setOppdateringskanal(e.target.value)}>
            <option value="stabil">Stabil</option>
            <option value="test">Test</option>
          </select>
          <label>Moduler</label>
          <div className="module-grid">
            {ALL_MODULE_KEYS.map((key) => (
              <label key={key} className="checkbox-label">
                <input type="checkbox" checked={moduler.includes(key)} onChange={() => toggleModule(key)} />
                {MODULE_LABELS[key]}
              </label>
            ))}
          </div>
          <button className="btn btn-accent" onClick={saveConfig} disabled={saving}>
            Lagre konfigurasjon
          </button>
          <div className="config-versjon-hint">
            Config-versjon: {hub.config?.config_versjon} · Ønsket app-versjon: {hub.config?.onsket_app_versjon || '–'}
          </div>
        </div>

        <div className="panel">
          <h2>Siste feil ({hub.errors?.length || 0})</h2>
          {(!hub.errors || hub.errors.length === 0) && <div className="empty-hint">Ingen registrerte feil.</div>}
          <div className="error-list">
            {hub.errors?.map((e) => (
              <div key={e.id} className="error-item">
                <div className="error-item-head">
                  <span className="pill">{e.feiltype}</span>
                  <span className="error-item-time">{formatDate(e.tidspunkt)}</span>
                </div>
                <div className="error-item-msg">{e.melding}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Endringshistorikk</h2>
          {(!hub.configHistory || hub.configHistory.length === 0) && <div className="empty-hint">Ingen endringer registrert.</div>}
          <div className="error-list">
            {hub.configHistory?.map((h) => (
              <div key={h.id} className="error-item">
                <div className="error-item-head">
                  <span className="pill">{h.endret_av}</span>
                  <span className="error-item-time">{formatDate(h.tidspunkt)}</span>
                </div>
                <div className="error-item-msg mono">{h.endring_json}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
