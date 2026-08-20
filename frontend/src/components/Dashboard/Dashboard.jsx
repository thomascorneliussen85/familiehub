import { useEffect, useRef, useState } from 'react';
import WeatherBusPanel from '../WeatherBus/WeatherBusPanel';
import PowerPricePanel from '../PowerPrice/PowerPricePanel';
import SmartHomePanel from '../SmartHome/SmartHomePanel';
import GpsMapPanel from '../GpsMap/GpsMapPanel';
import MessageBoardPanel from '../MessageBoard/MessageBoardPanel';
import TimerPanel from '../Timer/TimerPanel';
import MiniTimerBadge from '../Timer/MiniTimerBadge';
import CameraPanel from '../Cameras/CameraPanel';
import GarminPanel from '../Garmin/GarminPanel';
import PlayOutsidePanel from '../PlayOutside/PlayOutsidePanel';
import TelemedicinePanel from '../Telemedicine/TelemedicinePanel';
import RewardsPanel from '../Rewards/RewardsPanel';
import KidsPage from '../Kids/KidsPage';
import ShoppingPanel from '../Shopping/ShoppingPanel';
import ChoresPanel from '../Chores/ChoresPanel';
import CalendarPanel from '../Calendar/CalendarPanel';
import DinnerPlanPanel from '../DinnerPlan/DinnerPlanPanel';
import DinnerWeekPlanner from '../DinnerPlan/DinnerWeekPlanner';
import FinanceWidget from '../Finance/FinanceWidget';
import BabyCameraTile from './BabyCameraTile';
import NextEventBanner from './NextEventBanner';
import HomeworkBanner from './HomeworkBanner';
import GoodMorningCard from '../MorningBrief/GoodMorningCard';
import VoiceButton from '../VoiceControl/VoiceButton';
import FeedbackButton from '../Feedback/FeedbackButton';
import Clock from '../Clock/Clock';
import { useTimeOfDay } from '../../hooks/useTimeOfDay';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './Dashboard.css';

// Den utvidede kalenderen (Uke/Tavle/Kalender-visninger) er kun tilgjengelig
// når panelet er åpnet i fullskjerm – den kompakte kortet på "I dag"-siden
// forblir den enkle ukelisten, siden det ellers ville tatt for mye plass på
// en skjerm som allerede har mye annet.
function ExpandedCalendarPanel() {
  return <CalendarPanel expanded />;
}

const CORE_PANELS = {
  shopping: { icon: '🛒', label: 'Handleliste', Component: ShoppingPanel },
  chores: { icon: '✅', label: 'Gjøremål', Component: ChoresPanel },
  calendar: { icon: '📅', label: 'Kalender', Component: ExpandedCalendarPanel },
};

const MORE_PANELS = [
  { key: 'weatherbus', icon: '🌦️', label: 'Vær & buss', Component: WeatherBusPanel },
  { key: 'smarthome', icon: '🔌', label: 'Smarthjem', Component: SmartHomePanel },
  { key: 'gps', icon: '📍', label: 'Kart', Component: GpsMapPanel },
  { key: 'powerprice', icon: '⚡', label: 'Strømpris', Component: PowerPricePanel },
  { key: 'messages', icon: '📌', label: 'Beskjedtavle', Component: MessageBoardPanel },
  { key: 'dinner-planner', icon: '🍽️', label: 'Middagsplanlegger', Component: DinnerWeekPlanner },
  { key: 'timer', icon: '⏱️', label: 'Timer', Component: TimerPanel },
  { key: 'cameras', icon: '📹', label: 'Kameraer', Component: CameraPanel },
  { key: 'garmin', icon: '⌚', label: 'Garmin', Component: GarminPanel },
  { key: 'play-outside', icon: '🛝', label: 'Ut og leke', Component: PlayOutsidePanel },
  { key: 'telemedicine', icon: '🩺', label: 'DoktorNå', Component: TelemedicinePanel },
  { key: 'rewards', icon: '🏆', label: 'Belønninger', Component: RewardsPanel },
  { key: 'kids', icon: '🧒', label: 'Barn', Component: KidsPage },
];

const ALL_PANELS = { ...CORE_PANELS, ...Object.fromEntries(MORE_PANELS.map((p) => [p.key, p])) };

const GREETING = { morgen: 'God morgen', dag: 'God dag', kveld: 'God kveld' };

function RemainingChoresStatus() {
  const [remaining, setRemaining] = useState(null);

  function load() {
    api.get('/chores').then((chores) => setRemaining(chores.filter((c) => !c.done).length)).catch(() => {});
  }

  useEffect(() => {
    load();
    socket.on('chores:update', load);
    return () => socket.off('chores:update', load);
  }, []);

  if (remaining === null) return null;
  if (remaining === 0) return <div className="dashboard-status-bar">🎉 Alle gjøremål er gjort!</div>;
  return <div className="dashboard-status-bar">☀️ Du har {remaining} gjøremål igjen</div>;
}

export default function Dashboard({ onOpenSettings, onOpenFinance }) {
  const { expandedKey, openPanel, closePanel } = usePanelNavigation();
  const [coverUrl, setCoverUrl] = useState(null);
  const fileInputRef = useRef(null);
  const { period } = useTimeOfDay();

  useEffect(() => {
    fetch('/api/photos/cover', { credentials: 'include' })
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
    const res = await fetch('/api/photos/cover', { method: 'POST', credentials: 'include', body: formData }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setCoverUrl(`${data.url}?t=${Date.now()}`);
    }
  }

  const expanded = expandedKey && expandedKey !== 'more' ? ALL_PANELS[expandedKey] : null;
  const showMorePicker = expandedKey === 'more';

  const today = new Date().toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="dashboard-root">
      <div className="dashboard-top-row">
        <div className="dashboard-home-photo-wrap">
          <button
            className="dashboard-home-photo"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Last opp familiebilde"
          >
            {coverUrl ? <img src={coverUrl} alt="Familiebilde" /> : <span>📷</span>}
          </button>
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} hidden />
          <div className="dashboard-greeting-text">
            <div className="dashboard-greeting-eyebrow">{today}</div>
            <div className="dashboard-greeting-title">
              {expanded ? expanded.label : showMorePicker ? 'Mer' : GREETING[period]}
            </div>
          </div>
        </div>
        <div className="dashboard-top-right">
          <MiniTimerBadge />
          <VoiceButton />
          <FeedbackButton />
          <Clock />
          <button className="dashboard-mobile-settings" onClick={onOpenSettings} aria-label="Innstillinger">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M19.4 13a7.6 7.6 0 000-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 00-1.7 1l-2.3-.9-2 3.4L6.6 11a7.6 7.6 0 000 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 001.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 001.7-1l2.3.9 2-3.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="dashboard-expanded">
          <button className="panel-back-btn" onClick={closePanel}>
            ← Tilbake
          </button>
          <div className="dashboard-expanded-content">
            <expanded.Component />
          </div>
        </div>
      ) : showMorePicker ? (
        <div className="dashboard-expanded">
          <button className="panel-back-btn" onClick={closePanel}>
            ← Tilbake
          </button>
          <div className="dashboard-more-grid">
            {MORE_PANELS.map(({ key, icon, label }) => (
              <button key={key} className="dashboard-more-item" onClick={() => openPanel(key)}>
                <span className="dashboard-more-item-icon">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="dashboard-home">
          <NextEventBanner />
          <HomeworkBanner />
          <GoodMorningCard />

          <div className="dashboard-calendar-hero">
            <CalendarPanel />
          </div>

          <div className="dashboard-fixed-grid">
            <ShoppingPanel />
            <ChoresPanel />
          </div>

          <DinnerPlanPanel />

          <FinanceWidget onOpen={onOpenFinance} />

          <RemainingChoresStatus />

          <BabyCameraTile />
        </div>
      )}
    </div>
  );
}
