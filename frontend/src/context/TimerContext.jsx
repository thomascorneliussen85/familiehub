import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const TimerContext = createContext(null);

function playAlarmBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    let time = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(0.4, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.4);
      time += 0.5;
    }
  } catch {
    // Web Audio ikke tilgjengelig – ignorer stille
  }
}

export function TimerProvider({ children }) {
  const [label, setLabel] = useState('');
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef(null);

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const start = useCallback((minutes, timerLabel = '') => {
    clear();
    const secs = Math.max(1, Math.round(minutes * 60));
    setTotalSeconds(secs);
    setSecondsLeft(secs);
    setLabel(timerLabel);
    setFinished(false);
    setRunning(true);
  }, [clear]);

  const pause = useCallback(() => setRunning(false), []);
  const resume = useCallback(() => secondsLeft > 0 && setRunning(true), [secondsLeft]);

  const reset = useCallback(() => {
    clear();
    setRunning(false);
    setFinished(false);
    setSecondsLeft(0);
    setTotalSeconds(0);
    setLabel('');
  }, [clear]);

  useEffect(() => {
    if (!running) {
      clear();
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clear();
          setRunning(false);
          setFinished(true);
          playAlarmBeep();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return clear;
  }, [running, clear]);

  return (
    <TimerContext.Provider
      value={{ label, totalSeconds, secondsLeft, running, finished, start, pause, resume, reset }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
