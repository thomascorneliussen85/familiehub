import { useEffect } from 'react';

const RELOAD_HOUR = 4; // 04:00
const STORAGE_KEY = 'familiehub_last_daily_reload';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Skjermer som står montert på veggen laster ofte aldri siden på nytt av seg
// selv, og service workeren (sw.js) henter kun nyeste versjon når siden
// faktisk lastes – uten dette kunne et nettbrett i praksis blitt hengende på
// en gammel versjon i det uendelige. Laster siden på nytt én gang per natt
// i stedet, uansett hvor lenge fanen har stått åpen.
function checkAndReload() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (localStorage.getItem(STORAGE_KEY) === todayStr) return;
  if (now.getHours() < RELOAD_HOUR) return;
  localStorage.setItem(STORAGE_KEY, todayStr);
  window.location.reload();
}

export function useDailyReload() {
  useEffect(() => {
    checkAndReload();
    const id = setInterval(checkAndReload, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
