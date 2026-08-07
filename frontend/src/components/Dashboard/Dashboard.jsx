import { useEffect, useRef, useState } from 'react';
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
import TelemedicinePanel from '../Telemedicine/TelemedicinePanel';
import DinnerPlanPanel from '../DinnerPlan/DinnerPlanPanel';
import NextEventBanner from './NextEventBanner';
import GoodMorningCard from '../MorningBrief/GoodMorningCard';
import { useTimeOfDay } from '../../hooks/useTimeOfDay';
import { socket } from '../../lib/socket';
import './Dashboard.css';

const SECONDARY_PANELS = [
  { key: 'weatherbus', icon: '🌦️', label: 'Vær & buss', Component: WeatherBusPanel },
  { key: 'smarthome', icon: '🔌', label: 'Smarthjem', Component: SmartHomePanel },
  { key: 'gps', icon: '📍', label: 'Kart', Component: GpsMapPanel },
  { key: 'powerprice', icon: '⚡', label: 'Strømpris', Component: PowerPricePanel },
  { key: 'messages', icon: '📌', label: 'Beskjedtavle', Component: MessageBoardPanel },
  { key: 'timer', icon: '⏱️', label: 'Timer', Component: TimerPanel },
  { key: 'cameras', icon: '📹', label: 'Kameraer', Component: CameraPanel },
  { key: 'garmin', icon: '⌚', label: 'Garmin', Component: GarminPanel },
  { key: 'play-outside', icon: '🛝', label: 'Ut og leke', Component: PlayOutsidePanel },
  { key: 'telemedicine', icon: '🩺', label: 'DoktorNå', Component: TelemedicinePanel },
];

const GREETING = { morgen: 'God morgen', dag: 'God dag', kveld: 'God kveld' };
const PERIOD_LABEL = { morgen: 'MORGEN', dag: 'DAG', kveld: 'KVELD' };

export default function Dashboard() {
  const [expandedKey, setExpandedKey] = useState(null);
  const [coverUrl, setCoverUrl] = useState(null);
  const fileInputRef = useRef(null);
  const { period } = useTimeOfDay();

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

  const expanded = SECONDARY_PANELS.find((p) => p.key === expandedKey);

  const today = new Date().toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="dashboard-root">
      <div className="dashboard-icon-row">
        {SECONDARY_PANELS.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`dashboard-icon-btn ${expandedKey === key ? 'dashboard-icon-btn-active' : ''}`}
            onClick={() => setExpandedKey(key)}
          >
            <span className="dashboard-icon-btn-icon">{icon}</span>
            <span className="dashboard-icon-btn-label">{label}</span>
          </button>
        ))}
      </div>

      {expanded ? (
        <div className="dashboard-expanded">
          <button className="panel-back-btn" onClick={() => setExpandedKey(null)}>
            ← Tilbake
          </button>
          <div className="dashboard-expanded-content">
            <expanded.Component />
          </div>
        </div>
      ) : (
        <div className="dashboard-home">
          <div className="dashboard-home-header">
            <button
              className="dashboard-home-photo"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Last opp familiebilde"
            >
              {coverUrl ? <img src={coverUrl} alt="Familiebilde" /> : <span>📷</span>}
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} hidden />
            <div className="dashboard-home-greeting">
              <span className="dashboard-home-greeting-label">{GREETING[period]}</span>
              <span className="dashboard-home-date">{today}</span>
            </div>
            <div className="dashboard-home-period">
              {['morgen', 'dag', 'kveld'].map((p) => (
                <span
                  key={p}
                  className={`dashboard-period-pill ${period === p ? 'dashboard-period-pill-active' : ''}`}
                >
                  {PERIOD_LABEL[p]}
                </span>
              ))}
            </div>
          </div>

          <GoodMorningCard />
          <NextEventBanner />

          <div className="dashboard-home-grid">
            <CalendarPanel />
            <ChoresPanel />
            <ShoppingPanel />
            <DinnerPlanPanel />
          </div>
        </div>
      )}
    </div>
  );
}
