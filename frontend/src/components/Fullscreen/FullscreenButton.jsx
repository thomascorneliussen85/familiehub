import { useEffect, useState } from 'react';
import './FullscreenButton.css';

// Nettbrettets egen adressefelt/verktøylinje tar opp plass og kan i noen
// tilfeller dekke over knapper i appen (se f.eks. innstillinger-fiksen for
// mobil) – ekte fullskjermmodus via nettleserens Fullscreen-API fjerner det
// helt, i motsetning til CSS-triks som bare kompenserer for det. Støttes
// ikke i Safari på iPhone (Apple tillater det ikke der) – knappen skjules da.
export default function FullscreenButton({ showLabel = false }) {
  const [supported, setSupported] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    if (!document.documentElement.requestFullscreen) {
      setSupported(false);
      return;
    }
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Krever ofte at brukeren nettopp har trykket på noe (en "user gesture")
      // – hvis nettleseren avviser forespørselen er det stort sett derfor.
    }
  }

  if (!supported) return null;

  return (
    <button
      className={showLabel ? 'fullscreen-trigger fullscreen-trigger-row' : 'fullscreen-trigger'}
      onClick={toggle}
      aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
      title={isFullscreen ? 'Avslutt fullskjerm' : 'Vis i fullskjerm'}
    >
      {isFullscreen ? '🗗' : '⛶'}
      {showLabel && (isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm')}
    </button>
  );
}
