import { useState } from 'react';
import { useTimer } from '../../context/TimerContext';
import './TimerPanel.css';

const PRESETS = [1, 5, 10, 20];

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimerPanel() {
  const timer = useTimer();
  const [customMinutes, setCustomMinutes] = useState('');

  const progress = timer.totalSeconds > 0 ? timer.secondsLeft / timer.totalSeconds : 0;

  return (
    <section className={`panel panel-timer ${timer.finished ? 'panel-timer-finished' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">⏱️</span> Timer
        </div>
      </div>
      <div className="panel-body timer-body">
        {timer.totalSeconds > 0 ? (
          <>
            <div className="timer-display">{formatTime(timer.secondsLeft)}</div>
            <div className="timer-progress-track">
              <div className="timer-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="timer-controls">
              {timer.running ? (
                <button className="btn" onClick={timer.pause}>⏸ Pause</button>
              ) : (
                !timer.finished && <button className="btn" onClick={timer.resume}>▶ Fortsett</button>
              )}
              <button className="btn" onClick={timer.reset}>⏹ Nullstill</button>
            </div>
            {timer.finished && <div className="timer-finished-text">⏰ Ferdig!</div>}
          </>
        ) : (
          <>
            <div className="timer-presets">
              {PRESETS.map((m) => (
                <button key={m} className="btn btn-accent" onClick={() => timer.start(m)}>
                  {m} min
                </button>
              ))}
            </div>
            <form
              className="timer-custom-form"
              onSubmit={(e) => {
                e.preventDefault();
                const val = Number(customMinutes);
                if (val > 0) {
                  timer.start(val);
                  setCustomMinutes('');
                }
              }}
            >
              <input
                type="number"
                min="1"
                placeholder="Minutter"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
              />
              <button type="submit" className="btn">Start</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
