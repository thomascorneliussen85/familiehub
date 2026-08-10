import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';

export default function DevicesTab({ adminApi }) {
  const [cameras, setCameras] = useState([]);
  const [newCameraName, setNewCameraName] = useState('');
  const [newCameraRtsp, setNewCameraRtsp] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [pendingNames, setPendingNames] = useState({});

  const [bridgeStatus, setBridgeStatus] = useState(null);
  const [newBridgeKey, setNewBridgeKey] = useState(null);
  const [bridgeError, setBridgeError] = useState('');

  const [plugs, setPlugs] = useState([]);
  const [newPlugName, setNewPlugName] = useState('');
  const [newPlugIp, setNewPlugIp] = useState('');
  const [plugError, setPlugError] = useState('');

  function loadCameras() {
    fetch('/api/cameras', { credentials: 'include' }).then((r) => r.json()).then(setCameras).catch(() => {});
  }
  function loadBridgeStatus() {
    fetch('/api/camera-bridge/status', { credentials: 'include' }).then((r) => r.json()).then(setBridgeStatus).catch(() => {});
  }

  useEffect(() => {
    loadCameras();
    loadBridgeStatus();
    fetch('/api/smart-plugs', { credentials: 'include' }).then((r) => r.json()).then(setPlugs).catch(() => {});

    socket.on('cameras:update', loadCameras);
    socket.on('camera-bridge:status', loadBridgeStatus);
    return () => {
      socket.off('cameras:update', loadCameras);
      socket.off('camera-bridge:status', loadBridgeStatus);
    };
  }, []);

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
    </div>
  );
}
