import { useEffect, useState } from 'react';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowInstructions((v) => !v);
  }

  return (
    <div className="install-app">
      <button type="button" className="install-app-link" onClick={handleClick}>
        📲 Last ned appen her
      </button>
      {showInstructions && !deferredPrompt && (
        <div className="install-app-steps">
          {isIOS() ? (
            <>
              <div className="install-app-steps-title">På iPhone/iPad (Safari):</div>
              <ol>
                <li>Trykk på Del-ikonet (firkant med pil opp) nederst i Safari</li>
                <li>Velg «Legg til på Hjem-skjerm»</li>
                <li>Trykk «Legg til» øverst til høyre</li>
              </ol>
            </>
          ) : (
            <>
              <div className="install-app-steps-title">På Android (Chrome) eller PC:</div>
              <ol>
                <li>Trykk på menyknappen (⋮) øverst til høyre i nettleseren</li>
                <li>Velg «Installer app» eller «Legg til på startskjermen»</li>
                <li>Bekreft installasjonen</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
