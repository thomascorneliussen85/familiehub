import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import 'leaflet/dist/leaflet.css';
import './GpsMapPanel.css';

const childIcon = L.divIcon({
  html: '<div class="gps-marker">🧒</div>',
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function Recenter({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lon != null) map.setView([lat, lon]);
  }, [lat, lon, map]);
  return null;
}

function InvalidateOnResize({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 160);
    return () => clearTimeout(id);
  }, [trigger, map]);
  return null;
}

function timeAgo(dateStr) {
  // SQLite lagrer "YYYY-MM-DD HH:MM:SS" i UTC uten tidssone; Traccar sender ISO 8601 med tidssone.
  const iso = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const then = new Date(iso);
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'akkurat nå';
  if (diffMin < 60) return `${diffMin} min siden`;
  return then.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export default function GpsMapPanel({ isExpanded }) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(false);
  const [arrivedMsg, setArrivedMsg] = useState('');

  function load() {
    api.get('/gps/latest').then(setPosition).catch(() => setError(true));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);

    function onUpdate(update) {
      setPosition((prev) => ({ ...prev, ...update, recorded_at: update.recordedAt }));
    }
    function onArrivedHome() {
      setArrivedMsg('Adelia er hjemme! 🏠');
      setTimeout(() => setArrivedMsg(''), 15000);
    }
    socket.on('gps:update', onUpdate);
    socket.on('gps:arrived-home', onArrivedHome);
    return () => {
      clearInterval(id);
      socket.off('gps:update', onUpdate);
      socket.off('gps:arrived-home', onArrivedHome);
    };
  }, []);

  return (
    <section className="panel panel-gps">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">📍</span> Adelia
        </div>
        {position && (
          <span className="gps-updated">
            {position.isHome ? '🏠 Hjemme' : '📡'} · sist sett {timeAgo(position.recorded_at)}
          </span>
        )}
      </div>
      <div className="panel-body gps-body">
        {arrivedMsg && <div className="gps-toast">{arrivedMsg}</div>}
        {error && <div className="empty-hint">Fant ingen posisjonsdata ennå</div>}
        {position && (
          <MapContainer
            center={[position.lat, position.lon]}
            zoom={15}
            scrollWheelZoom={false}
            className="gps-map"
          >
            <TileLayer
              attribution='&copy; OpenStreetMap-bidragsytere'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[position.lat, position.lon]} icon={childIcon} />
            {position.home && (
              <Circle
                center={[position.home.lat, position.home.lon]}
                radius={position.home.radiusM}
                pathOptions={{ color: '#6ee7a0', fillOpacity: 0.08 }}
              />
            )}
            <Recenter lat={position.lat} lon={position.lon} />
            <InvalidateOnResize trigger={isExpanded} />
          </MapContainer>
        )}
      </div>
    </section>
  );
}
