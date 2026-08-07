import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import './BabyCameraTile.css';

export default function BabyCameraTile() {
  const [camera, setCamera] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    api
      .get('/cameras')
      .then((list) => {
        const baby = list.find((c) => c.name?.toLowerCase().includes('baby'));
        setCamera(baby || null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === wrapRef.current);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Prøv streamen på nytt med jevne mellomrom hvis kameraet er utilgjengelig
  // (f.eks. slått av eller ikke ferdig koblet til WiFi ennå).
  useEffect(() => {
    if (!streamError) return undefined;
    const id = setInterval(() => {
      setStreamKey((k) => k + 1);
      setStreamError(false);
    }, 15000);
    return () => clearInterval(id);
  }, [streamError]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current?.requestFullscreen();
    }
  }

  if (!loaded || !camera) return null;

  return (
    <section className="panel panel-baby-camera">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🍼</span> {camera.name}
        </div>
        <button className="btn btn-icon" onClick={toggleFullscreen} aria-label="Fullskjerm">
          {isFullscreen ? '⤡' : '⛶'}
        </button>
      </div>
      <div className="panel-body baby-camera-body">
        <div className="baby-camera-stream-wrap" ref={wrapRef}>
          {streamError ? (
            <div className="baby-camera-offline">📷 Kameraet er ikke tilkoblet</div>
          ) : (
            <img
              key={streamKey}
              className="baby-camera-stream"
              src={`/api/cameras/${camera.id}/stream`}
              alt={camera.name}
              onError={() => setStreamError(true)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
