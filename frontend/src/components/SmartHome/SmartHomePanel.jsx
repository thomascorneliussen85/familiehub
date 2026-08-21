import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './SmartHomePanel.css';

export default function SmartHomePanel() {
  const [plugs, setPlugs] = useState([]);
  const [vacuums, setVacuums] = useState([]);
  const [busyVacuumId, setBusyVacuumId] = useState(null);

  function loadVacuums() {
    api.get('/vacuum').then(setVacuums).catch(() => {});
  }

  useEffect(() => {
    api.get('/smart-plugs').then(setPlugs).catch(() => {});
    socket.on('plugs:update', setPlugs);
    loadVacuums();
    return () => socket.off('plugs:update', setPlugs);
  }, []);

  async function toggle(plug) {
    setPlugs((prev) =>
      prev.map((p) => (p.id === plug.id ? { ...p, is_on: p.is_on ? 0 : 1 } : p))
    );
    await api.post(`/smart-plugs/${plug.id}/toggle`, { on: !plug.is_on }).catch(() => {
      api.get('/smart-plugs').then(setPlugs).catch(() => {});
    });
  }

  async function vacuumAction(id, action) {
    setBusyVacuumId(id);
    await api.post(`/vacuum/${id}/${action}`).catch(() => {});
    setTimeout(() => {
      loadVacuums();
      setBusyVacuumId(null);
    }, 1500);
  }

  return (
    <section className="panel panel-smarthome">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🔌</span> Smarthjem
        </div>
      </div>
      <div className="panel-body">
        {plugs.length === 0 && vacuums.length === 0 && <div className="empty-hint">Ingen enheter konfigurert</div>}
        <div className="plug-grid">
          {plugs.map((plug) => (
            <button
              key={plug.id}
              className={`plug-card ${plug.is_on ? 'plug-card-on' : ''} ${!plug.online ? 'plug-card-offline' : ''}`}
              onClick={() => toggle(plug)}
            >
              <span className="plug-name">{plug.name}</span>
              <span className="plug-power">
                {plug.online
                  ? plug.is_on
                    ? `${plug.last_watt != null ? plug.last_watt.toFixed(0) : '–'} W`
                    : 'Av'
                  : 'Utilgjengelig'}
              </span>
              <span className={`plug-dot ${plug.is_on ? 'plug-dot-on' : ''}`} />
            </button>
          ))}
        </div>

        {vacuums.length > 0 && (
          <div className="vacuum-list">
            {vacuums.map((v) => (
              <div key={v.id} className={`vacuum-card ${!v.online ? 'vacuum-card-offline' : ''}`}>
                <div className="vacuum-card-header">
                  <span className="vacuum-card-icon">🤖</span>
                  <span className="vacuum-card-label">{v.label}</span>
                  {v.online && v.battery != null && <span className="vacuum-card-battery">🔋 {v.battery}%</span>}
                </div>
                <div className="vacuum-card-status">
                  {v.online ? v.statusLabel : 'Ikke tilgjengelig på nettverket'}
                </div>
                {v.online && (
                  <div className="vacuum-card-actions">
                    <button
                      className="btn btn-icon"
                      onClick={() => vacuumAction(v.id, 'start')}
                      disabled={busyVacuumId === v.id}
                      aria-label="Start rengjøring"
                    >
                      ▶️
                    </button>
                    <button
                      className="btn btn-icon"
                      onClick={() => vacuumAction(v.id, 'stop')}
                      disabled={busyVacuumId === v.id}
                      aria-label="Stopp"
                    >
                      ⏸️
                    </button>
                    <button
                      className="btn btn-icon"
                      onClick={() => vacuumAction(v.id, 'home')}
                      disabled={busyVacuumId === v.id}
                      aria-label="Send til lader"
                    >
                      🏠
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
