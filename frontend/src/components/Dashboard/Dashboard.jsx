import { useEffect, useRef, useState } from 'react';
import { socket } from '../../lib/socket';
import CalendarPanel from '../Calendar/CalendarPanel';
import ChoresPanel from '../Chores/ChoresPanel';
import ShoppingPanel from '../Shopping/ShoppingPanel';
import WeatherBusPanel from '../WeatherBus/WeatherBusPanel';
import PowerPricePanel from '../PowerPrice/PowerPricePanel';
import SmartHomePanel from '../SmartHome/SmartHomePanel';
import GpsMapPanel from '../GpsMap/GpsMapPanel';
import MessageBoardPanel from '../MessageBoard/MessageBoardPanel';
import TimerPanel from '../Timer/TimerPanel';
import CameraPanel from '../Cameras/CameraPanel';
import GarminPanel from '../Garmin/GarminPanel';
import PlayOutsidePanel from '../PlayOutside/PlayOutsidePanel';
import './Dashboard.css';

const PANELS = [
  { key: 'calendar', icon: '📅', label: 'Kalender', Component: CalendarPanel },
  { key: 'chores', icon: '✅', label: 'Gjøremål', Component: ChoresPanel },
  { key: 'shopping', icon: '🛒', label: 'Handleliste', Component: ShoppingPanel },
  { key: 'weatherbus', icon: '🌦️', label: 'Vær & buss', Component: WeatherBusPanel },
  { key: 'smarthome', icon: '🔌', label: 'Smarthjem', Component: SmartHomePanel },
  { key: 'gps', icon: '📍', label: 'Kart', Component: GpsMapPanel },
  { key: 'powerprice', icon: '⚡', label: 'Strømpris', Component: PowerPricePanel },
  { key: 'messages', icon: '📌', label: 'Beskjedtavle', Component: MessageBoardPanel },
  { key: 'timer', icon: '⏱️', label: 'Timer', Component: TimerPanel },
  { key: 'cameras', icon: '📹', label: 'Kameraer', Component: CameraPanel },
  { key: 'garmin', icon: '⌚', label: 'Garmin', Component: GarminPanel },
  { key: 'play-outside', icon: '🛝', label: 'Ut og leke', Component: PlayOutsidePanel },
];

const RADIUS_PERCENT = 43;

export default function Dashboard() {
  const [expandedKey, setExpandedKey] = useState(null);
  const [coverUrl, setCoverUrl] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/photos/cover')
      .then((res) => res.json())
      .then((data) => setCoverUrl(data.url))
      .catch(() => {});

    function onCoverUpdate(data) {
      setCoverUrl(data.url);
    }
    socket.on('photos:cover-update', onCoverUpdate);
    return () => socket.off('photos:cover-update', onCoverUpdate);
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch('/api/photos/cover', { method: 'POST', body: formData }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setCoverUrl(`${data.url}?t=${Date.now()}`);
    }
  }

  const expanded = PANELS.find((p) => p.key === expandedKey);

  if (expanded) {
    const { Component } = expanded;
    return (
      <div className="dashboard-expanded">
        <button className="panel-back-btn" onClick={() => setExpandedKey(null)}>
          ← Tilbake
        </button>
        <div className="dashboard-expanded-content">
          <Component />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-icons">
      <div className="dashboard-ring">
        <button
          className="dashboard-center-photo"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Last opp familiebilde"
        >
          {coverUrl ? (
            <img src={coverUrl} alt="Familiebilde" />
          ) : (
            <span className="dashboard-center-photo-placeholder">
              📷
              <br />
              Last opp bilde
            </span>
          )}
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          hidden
        />

        {PANELS.map(({ key, icon, label }, i) => {
          const angle = (360 / PANELS.length) * i - 90;
          const rad = (angle * Math.PI) / 180;
          const x = 50 + RADIUS_PERCENT * Math.cos(rad);
          const y = 50 + RADIUS_PERCENT * Math.sin(rad);
          return (
            <button
              key={key}
              className="dashboard-icon-tile"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => setExpandedKey(key)}
            >
              <span className="dashboard-icon-tile-icon">{icon}</span>
              <span className="dashboard-icon-tile-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
