import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './CameraPanel.css';

export default function CameraPanel() {
  const [cameras, setCameras] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get('/cameras')
      .then((list) => {
        setCameras(list);
        setActiveId(list[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const active = cameras.find((c) => c.id === activeId);

  return (
    <section className="panel panel-cameras">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">📹</span> Kameraer
        </div>
      </div>
      <div className="panel-body camera-body">
        {loaded && cameras.length === 0 && (
          <div className="empty-hint">
            Ingen kameraer er satt opp ennå. Legg til RTSP-URL for kameraene i .env på serveren.
          </div>
        )}
        {cameras.length > 0 && (
          <>
            <div className="camera-tabs">
              {cameras.map((c) => (
                <button
                  key={c.id}
                  className={`camera-tab ${activeId === c.id ? 'camera-tab-active' : ''}`}
                  onClick={() => setActiveId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="camera-stream-wrap">
              {active && (
                <img
                  key={active.id}
                  className="camera-stream"
                  src={`/api/cameras/${active.id}/stream`}
                  alt={active.name}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
