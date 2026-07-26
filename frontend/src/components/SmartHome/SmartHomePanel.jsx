import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './SmartHomePanel.css';

export default function SmartHomePanel() {
  const [plugs, setPlugs] = useState([]);

  useEffect(() => {
    api.get('/smart-plugs').then(setPlugs).catch(() => {});
    socket.on('plugs:update', setPlugs);
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

  return (
    <section className="panel panel-smarthome">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🔌</span> Smarthjem
        </div>
      </div>
      <div className="panel-body">
        {plugs.length === 0 && <div className="empty-hint">Ingen plugger konfigurert</div>}
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
      </div>
    </section>
  );
}
