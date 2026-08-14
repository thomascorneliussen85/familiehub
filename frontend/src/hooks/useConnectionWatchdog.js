import { useEffect, useRef, useState } from 'react';

const HEALTHY_INTERVAL_MS = 15000;
const DOWN_INTERVAL_MS = 2000;
const FAILURES_BEFORE_DOWN = 2;

// Render sin gratis-plan (og til dels Docker-oppstart generelt) gir et par
// sekunders reelt avbrudd (502) midt i hver deploy, siden gammel instans
// stoppes før den nye er klar. Vi kan ikke fjerne selve avbruddet uten å
// endre Render-planen, men vi kan gjøre skjermen på kjøkkenveggen tålmodig i
// stedet for å vise en rå feilside: poll /api/health, vis en vennlig
// «oppdaterer»-skjerm ved sammenhengende feil, og last siden på nytt (henter
// nyeste frontend-bygg) med en gang backenden svarer igjen.
export function useConnectionWatchdog() {
  const [down, setDown] = useState(false);
  const failuresRef = useRef(0);
  const wasDownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function check() {
      let ok = false;
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (cancelled) return;

      if (ok) {
        failuresRef.current = 0;
        if (wasDownRef.current) {
          window.location.reload();
          return;
        }
        setDown(false);
      } else {
        failuresRef.current += 1;
        if (failuresRef.current >= FAILURES_BEFORE_DOWN) {
          wasDownRef.current = true;
          setDown(true);
        }
      }

      timeoutId = setTimeout(check, ok ? HEALTHY_INTERVAL_MS : DOWN_INTERVAL_MS);
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return down;
}
