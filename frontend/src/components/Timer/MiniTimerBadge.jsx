import { useTimer } from '../../context/TimerContext';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import './MiniTimerBadge.css';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Vises kun mens en timer faktisk er i gang/ferdig – helt usynlig (ingen
// bredde å kollidere med) resten av tiden, siden dashboard-top-right fra før
// er trang på mobil (se Dashboard.css). Trykk for å hoppe rett til hele
// Timer-panelet under Mer.
export default function MiniTimerBadge() {
  const timer = useTimer();
  const { openPanel } = usePanelNavigation();

  if (!timer || timer.totalSeconds === 0) return null;

  return (
    <button
      className={`mini-timer-badge ${timer.finished ? 'mini-timer-badge-finished' : ''}`}
      onClick={() => openPanel('timer')}
      aria-label="Åpne timer"
    >
      <span className="mini-timer-icon">{timer.finished ? '⏰' : '⏱️'}</span>
      <span className="mini-timer-time">{formatTime(timer.secondsLeft)}</span>
    </button>
  );
}
