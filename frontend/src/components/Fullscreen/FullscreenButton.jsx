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
  const [error, setError] = useState('');

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
    setError('');
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      // Skjer oftest hvis kallet ikke regnes som direkte utløst av et
      // brukertrykk ("user gesture"), eller hvis nettleseren/enheten har
      // fullskjerm avslått via retningslinjer (f.eks. enkelte kiosk-/MDM-
      // oppsett på Windows). Viser den faktiske feilen i stedet for å
      // svelge den stille, slik at årsaken faktisk kan leses av på skjermen.
      setError(err?.message || err?.name || 'Ukjent feil');
      setTimeout(() => setError(''), 8000);
    }
  }

  if (!supported) return null;

  return (
    <div className={showLabel ? 'fullscreen-wrap-row' : 'fullscreen-wrap'}>
      <button
        className={showLabel ? 'fullscreen-trigger fullscreen-trigger-row' : 'fullscreen-trigger'}
        onClick={toggle}
        aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
        title={isFullscreen ? 'Avslutt fullskjerm' : 'Vis i fullskjerm'}
      >
        {isFullscreen ? '🗗' : '⛶'}
        {showLabel && (isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm')}
      </button>
      {error && <div className="fullscreen-error">Fullskjerm feilet: {error}</div>}
    </div>
  );
}
