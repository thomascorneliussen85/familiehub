import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { usePinnedCamera } from '../../context/PinnedCameraContext';
import './CameraPanel.css';

export default function CameraPanel() {
  const [cameras, setCameras] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const streamWrapRef = useRef(null);
  const { pinnedCamera, pinCamera, unpinCamera } = usePinnedCamera();

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

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === streamWrapRef.current);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const active = cameras.find((c) => c.id === activeId);
  const isPinned = active && pinnedCamera?.id === active.id;

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      streamWrapRef.current?.requestFullscreen();
    }
  }

  function togglePin() {
    if (isPinned) {
      unpinCamera();
    } else if (active) {
      pinCamera({ id: active.id, name: active.name });
    }
  }

  return (
    <section className="panel panel-cameras">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">📹</span> Kameraer
        </div>
        {active && (
          <div className="camera-header-actions">
            <button className="btn btn-icon" onClick={togglePin} aria-label="Vis kamera flytende">
              {isPinned ? '📌' : '📍'}
            </button>
            <button className="btn btn-icon" onClick={toggleFullscreen} aria-label="Fullskjerm">
              {isFullscreen ? '⤡' : '⛶'}
            </button>
          </div>
        )}
      </div>
      <div className="panel-body camera-body">
        {loaded && cameras.length === 0 && (
          <div className="empty-hint">
            Ingen kameraer er satt opp ennå. Legg til kamera under ⚙️ → Enheter.
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
            <div className="camera-stream-wrap" ref={streamWrapRef}>
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
