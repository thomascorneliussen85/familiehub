import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import PushNotificationSection from './PushNotificationSection';

export default function DevicesTab({ adminApi }) {
  const [cameras, setCameras] = useState([]);
  const [newCameraName, setNewCameraName] = useState('');
  const [newCameraRtsp, setNewCameraRtsp] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [pendingNames, setPendingNames] = useState({});

  const [shellyDevices, setShellyDevices] = useState([]);
  const [pendingShellyNames, setPendingShellyNames] = useState({});
  const [shellyError, setShellyError] = useState('');

  const [bridgeStatus, setBridgeStatus] = useState(null);
  const [newBridgeKey, setNewBridgeKey] = useState(null);
  const [bridgeError, setBridgeError] = useState('');

  const [plugs, setPlugs] = useState([]);
  const [newPlugName, setNewPlugName] = useState('');
  const [newPlugIp, setNewPlugIp] = useState('');
  const [plugError, setPlugError] = useState('');

  const [vacuums, setVacuums] = useState([]);
  const [newVacuumLabel, setNewVacuumLabel] = useState('');
  const [newVacuumIp, setNewVacuumIp] = useState('');
  const [newVacuumToken, setNewVacuumToken] = useState('');
  const [vacuumError, setVacuumError] = useState('');
  const [addingVacuum, setAddingVacuum] = useState(false);

  const [garminStatus, setGarminStatus] = useState(null);
  const [garminUsername, setGarminUsername] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminError, setGarminError] = useState('');
  const [connectingGarmin, setConnectingGarmin] = useState(false);

  const [stravaStatus, setStravaStatus] = useState(null);
  const [stravaError, setStravaError] = useState('');

  function loadCameras() {
    fetch('/api/cameras', { credentials: 'include' }).then((r) => r.json()).then(setCameras).catch(() => {});
  }
  function loadBridgeStatus() {
    fetch('/api/camera-bridge/status', { credentials: 'include' }).then((r) => r.json()).then(setBridgeStatus).catch(() => {});
  }
  function loadShellyDevices() {
    fetch('/api/shelly-devices', { credentials: 'include' }).then((r) => r.json()).then(setShellyDevices).catch(() => {});
  }

  useEffect(() => {
    loadCameras();
    loadBridgeStatus();
    loadShellyDevices();
    fetch('/api/smart-plugs', { credentials: 'include' }).then((r) => r.json()).then(setPlugs).catch(() => {});
    fetch('/api/vacuum', { credentials: 'include' }).then((r) => r.json()).then(setVacuums).catch(() => {});
    fetch('/api/garmin/status', { credentials: 'include' }).then((r) => r.json()).then(setGarminStatus).catch(() => {});
    fetch('/api/strava/status', { credentials: 'include' }).then((r) => r.json()).then(setStravaStatus).catch(() => {});

    socket.on('cameras:update', loadCameras);
    socket.on('camera-bridge:status', loadBridgeStatus);
    socket.on('shelly:update', loadShellyDevices);
    return () => {
      socket.off('cameras:update', loadCameras);
      socket.off('camera-bridge:status', loadBridgeStatus);
      socket.off('shelly:update', loadShellyDevices);
    };
  }, []);

  async function approveShellyDevice(id) {
    const name = (pendingShellyNames[id] || '').trim();
    if (!name) return;
    setShellyError('');
    try {
      await adminApi.patch(`/shelly-devices/${id}`, { name });
      loadShellyDevices();
    } catch (err) {
      setShellyError(err.message);
    }
  }

  async function removeShellyDevice(id) {
    await adminApi.delete(`/shelly-devices/${id}`).catch(() => {});
    setShellyDevices((prev) => prev.filter((d) => d.id !== id));
  }

  const pendingShelly = shellyDevices.filter((d) => d.status === 'pending');
  const activeShelly = shellyDevices.filter((d) => d.status !== 'pending');

  async function generateBridgeKey() {
    setBridgeError('');
    try {
      const result = await adminApi.post('/camera-bridge/token', {});
      setNewBridgeKey(result);
      loadBridgeStatus();
    } catch (err) {
      setBridgeError(err.message);
    }
  }

  async function removeBridge(id) {
    await adminApi.delete(`/camera-bridge/${id}`).catch(() => {});
    loadBridgeStatus();
  }

  async function approveCamera(id) {
    const name = (pendingNames[id] || '').trim();
    if (!name) return;
    setCameraError('');
    try {
      await adminApi.patch(`/cameras/${id}`, { name });
      loadCameras();
    } catch (err) {
      setCameraError(err.message);
    }
  }

  async function addCamera() {
    setCameraError('');
    if (!newCameraName.trim() || !newCameraRtsp.trim()) return;
    try {
      const camera = await adminApi.post('/cameras', {
        name: newCameraName.trim(),
        rtspUrl: newCameraRtsp.trim(),
      });
      setCameras((prev) => [...prev, { ...camera, status: 'active' }]);
      setNewCameraName('');
      setNewCameraRtsp('');
    } catch (err) {
      setCameraError(err.message);
    }
  }

  async function removeCamera(id) {
    await adminApi.delete(`/cameras/${id}`).catch(() => {});
    setCameras((prev) => prev.filter((c) => c.id !== id));
  }

  const pendingCameras = cameras.filter((c) => c.status === 'pending');
  const activeCameras = cameras.filter((c) => c.status !== 'pending');

  async function addPlug() {
    setPlugError('');
    if (!newPlugName.trim() || !newPlugIp.trim()) return;
    try {
      const plug = await adminApi.post('/smart-plugs', {
        name: newPlugName.trim(),
        ip: newPlugIp.trim(),
      });
      setPlugs((prev) => [...prev, plug]);
      setNewPlugName('');
      setNewPlugIp('');
    } catch (err) {
      setPlugError(err.message);
    }
  }

  async function removePlug(id) {
    await adminApi.delete(`/smart-plugs/${id}`).catch(() => {});
    setPlugs((prev) => prev.filter((p) => p.id !== id));
  }

  async function addVacuum() {
    setVacuumError('');
    if (!newVacuumLabel.trim() || !newVacuumIp.trim() || !newVacuumToken.trim()) return;
    setAddingVacuum(true);
    try {
      await adminApi.post('/vacuum', {
        label: newVacuumLabel.trim(),
        ip: newVacuumIp.trim(),
        token: newVacuumToken.trim(),
      });
      setNewVacuumLabel('');
      setNewVacuumIp('');
      setNewVacuumToken('');
      fetch('/api/vacuum', { credentials: 'include' }).then((r) => r.json()).then(setVacuums).catch(() => {});
    } catch (err) {
      setVacuumError(err.message);
    } finally {
      setAddingVacuum(false);
    }
  }

  async function removeVacuum(id) {
    await adminApi.delete(`/vacuum/${id}`).catch(() => {});
    setVacuums((prev) => prev.filter((v) => v.id !== id));
  }

  async function connectGarmin() {
    setGarminError('');
    if (!garminUsername.trim() || !garminPassword.trim()) return;
    setConnectingGarmin(true);
    try {
      await adminApi.post('/garmin/connect', { username: garminUsername.trim(), password: garminPassword.trim() });
      setGarminUsername('');
      setGarminPassword('');
      fetch('/api/garmin/status', { credentials: 'include' }).then((r) => r.json()).then(setGarminStatus).catch(() => {});
    } catch (err) {
      setGarminError(err.message);
    } finally {
      setConnectingGarmin(false);
    }
  }

  async function disconnectGarmin() {
    await adminApi.delete('/garmin/connect').catch(() => {});
    setGarminStatus({ configured: false, lastSyncAt: null });
  }

  async function connectStrava() {
    setStravaError('');
    try {
      const { url } = await adminApi.get('/strava/auth-url');
      window.location.href = url;
    } catch (err) {
      setStravaError(err.message);
    }
  }

  async function disconnectStrava() {
    await adminApi.delete('/strava/connect').catch(() => {});
    setStravaStatus({ configured: false, lastSyncAt: null });
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Kamera-bro</div>
      <div className="empty-hint">
        En kamera-bro (kjører f.eks. på en Raspberry Pi hjemme) lar FamilieHub finne Tapo-kameraer
        på hjemmenettet automatisk og vise video fra dem. Se <code>camera-bridge/README.md</code> for oppsett.
      </div>
      <div className="settings-location-item">
        <span>{bridgeStatus?.online ? '🟢 Bro tilkoblet' : '⚪ Ingen bro tilkoblet'}</span>
      </div>
      {bridgeStatus?.bridges?.length > 0 && (
        <div className="settings-locations-list">
          {bridgeStatus.bridges.map((b) => (
            <div key={b.id} className="settings-location-item">
              <span>🔑 {b.name}</span>
              <button className="btn btn-icon" onClick={() => removeBridge(b.id)} aria-label="Fjern">
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
      {newBridgeKey ? (
        <div className="settings-message">
          Lim disse inn i broens <code>.env</code> (vises kun nå):
          <br />
          BRIDGE_ID={newBridgeKey.bridgeId}
          <br />
          BRIDGE_API_KEY={newBridgeKey.apiKey}
          <br />
          <button className="btn" onClick={() => setNewBridgeKey(null)}>
            Lukk
          </button>
        </div>
      ) : (
        <button className="btn btn-accent" onClick={generateBridgeKey}>
          Generer bro-nøkkel
        </button>
      )}
      {bridgeError && <div className="settings-message">{bridgeError}</div>}

      <div className="settings-subtitle">Kameraer</div>
      {pendingCameras.length > 0 && (
        <div className="settings-locations-list">
          {pendingCameras.map((c) => (
            <div key={c.id} className="settings-location-item">
              <span>
                🆕 {c.manufacturer ? `${c.manufacturer} ${c.model || ''}` : 'Nytt kamera'} ({c.local_ip})
              </span>
              <input
                type="text"
                placeholder="Gi kameraet et navn…"
                value={pendingNames[c.id] || ''}
                onChange={(e) => setPendingNames((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button className="btn btn-accent" onClick={() => approveCamera(c.id)}>
                Legg til
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="settings-locations-list">
        {activeCameras.length === 0 && <div className="empty-hint">Ingen kameraer lagt til ennå.</div>}
        {activeCameras.map((c) => (
          <div key={c.id} className="settings-location-item">
            <span>📹 {c.name}</span>
            <button className="btn btn-icon" onClick={() => removeCamera(c.id)} aria-label="Fjern">
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="settings-location-add">
        <input
          type="text"
          placeholder="Navn (f.eks. Babyrom)"
          value={newCameraName}
          onChange={(e) => setNewCameraName(e.target.value)}
        />
        <input
          type="text"
          placeholder="rtsp://bruker:passord@ip:port/sti"
          value={newCameraRtsp}
          onChange={(e) => setNewCameraRtsp(e.target.value)}
        />
        <button className="btn btn-accent" onClick={addCamera}>
          Legg til
        </button>
      </div>
      <div className="empty-hint">Manuelt lagt inn RTSP-lenke fungerer kun hvis FamilieHub kjører på samme nettverk som kameraet (ikke via skyhosting).</div>
      {cameraError && <div className="settings-message">{cameraError}</div>}

      <div className="settings-subtitle">Shelly-enheter (f.eks. røykvarsler)</div>
      <div className="empty-hint">Broen finner Shelly-enheter på hjemmenettet automatisk – gi dem et navn under for å ta dem i bruk.</div>
      {pendingShelly.length > 0 && (
        <div className="settings-locations-list">
          {pendingShelly.map((d) => (
            <div key={d.id} className="settings-location-item">
              <span>
                🆕 {d.model || 'Ukjent enhet'} ({d.local_ip}){d.device_type === 'smoke' && ' – røykvarsler'}
              </span>
              <input
                type="text"
                placeholder="Gi enheten et navn…"
                value={pendingShellyNames[d.id] || ''}
                onChange={(e) => setPendingShellyNames((prev) => ({ ...prev, [d.id]: e.target.value }))}
              />
              <button className="btn btn-accent" onClick={() => approveShellyDevice(d.id)}>
                Legg til
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="settings-locations-list">
        {activeShelly.length === 0 && <div className="empty-hint">Ingen Shelly-enheter lagt til ennå.</div>}
        {activeShelly.map((d) => (
          <div key={d.id} className="settings-location-item">
            <span>
              {d.device_type === 'smoke' ? (d.alarm ? '🚨' : '🟢') : '🔌'} {d.name}
              {d.device_type === 'smoke' && (d.alarm ? ' – ALARM!' : ' – normal')}
            </span>
            <button className="btn btn-icon" onClick={() => removeShellyDevice(d.id)} aria-label="Fjern">
              🗑️
            </button>
          </div>
        ))}
      </div>
      {shellyError && <div className="settings-message">{shellyError}</div>}

      <div className="settings-subtitle">Smartplugger</div>
      <div className="settings-locations-list">
        {plugs.length === 0 && <div className="empty-hint">Ingen smartplugger lagt til ennå.</div>}
        {plugs.map((p) => (
          <div key={p.id} className="settings-location-item">
            <span>🔌 {p.name} ({p.ip})</span>
            <button className="btn btn-icon" onClick={() => removePlug(p.id)} aria-label="Fjern">
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="settings-location-add">
        <input
          type="text"
          placeholder="Navn (f.eks. Kaffetrakter)"
          value={newPlugName}
          onChange={(e) => setNewPlugName(e.target.value)}
        />
        <input
          type="text"
          placeholder="IP-adresse"
          value={newPlugIp}
          onChange={(e) => setNewPlugIp(e.target.value)}
        />
        <button className="btn btn-accent" onClick={addPlug}>
          Legg til
        </button>
      </div>
      {plugError && <div className="settings-message">{plugError}</div>}

      <div className="settings-subtitle">Robotstøvsuger</div>
      <div className="empty-hint">
        Ingen offisiell app-tilkobling finnes – IP-adresse og "token" må hentes ut manuelt, f.eks. med det
        frittstående verktøyet «Xiaomi Cloud Tokens Extractor» (søk det opp), og kun på samme hjemmenettverk.
      </div>
      <div className="settings-locations-list">
        {vacuums.length === 0 && <div className="empty-hint">Ingen støvsuger lagt til ennå.</div>}
        {vacuums.map((v) => (
          <div key={v.id} className="settings-location-item">
            <span>🤖 {v.label} ({v.ip})</span>
            <button className="btn btn-icon" onClick={() => removeVacuum(v.id)} aria-label="Fjern">
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="settings-location-add">
        <input
          type="text"
          placeholder="Navn (f.eks. Stuen)"
          value={newVacuumLabel}
          onChange={(e) => setNewVacuumLabel(e.target.value)}
        />
        <input
          type="text"
          placeholder="IP-adresse"
          value={newVacuumIp}
          onChange={(e) => setNewVacuumIp(e.target.value)}
        />
        <input
          type="text"
          placeholder="Token (32 hex-tegn)"
          value={newVacuumToken}
          onChange={(e) => setNewVacuumToken(e.target.value)}
        />
        <button className="btn btn-accent" onClick={addVacuum} disabled={addingVacuum}>
          {addingVacuum ? 'Kobler til…' : 'Legg til'}
        </button>
      </div>
      {vacuumError && <div className="settings-message">{vacuumError}</div>}

      <div className="settings-subtitle">Garmin-klokke</div>
      <div className="empty-hint">
        Samme innlogging som Garmin Connect-appen din. Ingen offisiell tilkobling – dette bruker det uoffisielle
        API-et Garmin Connect-appen selv snakker med.
      </div>
      <div className="settings-locations-list">
        {garminStatus?.configured ? (
          <div className="settings-location-item">
            <span>
              ⌚ Koblet til
              {garminStatus.lastSyncAt && ` · sist synket ${new Date(garminStatus.lastSyncAt.replace(' ', 'T') + 'Z').toLocaleString('nb-NO')}`}
            </span>
            <button className="btn btn-icon" onClick={disconnectGarmin} aria-label="Koble fra">
              🗑️
            </button>
          </div>
        ) : (
          <div className="empty-hint">Ingen Garmin-konto koblet til ennå.</div>
        )}
      </div>
      {!garminStatus?.configured && (
        <div className="settings-location-add">
          <input
            type="text"
            placeholder="Brukernavn/e-post"
            value={garminUsername}
            onChange={(e) => setGarminUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Passord"
            value={garminPassword}
            onChange={(e) => setGarminPassword(e.target.value)}
          />
          <button className="btn btn-accent" onClick={connectGarmin} disabled={connectingGarmin}>
            {connectingGarmin ? 'Kobler til…' : 'Koble til'}
          </button>
        </div>
      )}
      {garminError && <div className="settings-message">{garminError}</div>}

      <div className="settings-subtitle">Strava</div>
      <div className="empty-hint">
        Har dere en Garmin-klokke som allerede laster opp til Strava automatisk, koble kun til én av dem her –
        ellers dukker samme treningsøkt opp to ganger.
      </div>
      <div className="settings-locations-list">
        {stravaStatus?.configured ? (
          <div className="settings-location-item">
            <span>
              🟠 Koblet til
              {stravaStatus.lastSyncAt && ` · sist synket ${new Date(stravaStatus.lastSyncAt.replace(' ', 'T') + 'Z').toLocaleString('nb-NO')}`}
            </span>
            <button className="btn btn-icon" onClick={disconnectStrava} aria-label="Koble fra">
              🗑️
            </button>
          </div>
        ) : (
          <div className="empty-hint">Ingen Strava-konto koblet til ennå.</div>
        )}
      </div>
      {!stravaStatus?.configured && (
        <button className="btn btn-accent" onClick={connectStrava}>
          Koble til Strava
        </button>
      )}
      {stravaError && <div className="settings-message">{stravaError}</div>}

      <PushNotificationSection />
    </div>
  );
}
