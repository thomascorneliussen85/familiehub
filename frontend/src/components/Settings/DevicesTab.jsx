import { useEffect, useState } from 'react';

export default function DevicesTab({ adminApi }) {
  const [cameras, setCameras] = useState([]);
  const [newCameraName, setNewCameraName] = useState('');
  const [newCameraRtsp, setNewCameraRtsp] = useState('');
  const [cameraError, setCameraError] = useState('');

  const [plugs, setPlugs] = useState([]);
  const [newPlugName, setNewPlugName] = useState('');
  const [newPlugIp, setNewPlugIp] = useState('');
  const [plugError, setPlugError] = useState('');

  useEffect(() => {
    fetch('/api/cameras').then((r) => r.json()).then(setCameras).catch(() => {});
    fetch('/api/smart-plugs').then((r) => r.json()).then(setPlugs).catch(() => {});
  }, []);

  async function addCamera() {
    setCameraError('');
    if (!newCameraName.trim() || !newCameraRtsp.trim()) return;
    try {
      const camera = await adminApi.post('/cameras', {
        name: newCameraName.trim(),
        rtspUrl: newCameraRtsp.trim(),
      });
      setCameras((prev) => [...prev, camera]);
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
      <div className="settings-subtitle">Kameraer</div>
      <div className="settings-locations-list">
        {cameras.length === 0 && <div className="empty-hint">Ingen kameraer lagt til ennå.</div>}
        {cameras.map((c) => (
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
