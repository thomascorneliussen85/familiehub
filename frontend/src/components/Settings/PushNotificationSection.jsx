import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// Push-abonnement er knyttet til DENNE nettleseren/enheten, ikke til
// familien som helhet – hvert familiemedlem må skru dette på fra sin egen
// telefon for selv å få varsler dit.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationSection() {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setSubscribed(Boolean(sub)))
    );
  }, []);

  async function enable() {
    setBusy(true);
    setMessage('');
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMessage('Du må tillate varsler i nettleseren for at dette skal fungere.');
        return;
      }
      const { publicKey } = await api.get('/push/vapid-public-key');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.post('/push/subscribe', sub.toJSON());
      setSubscribed(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage('');
    try {
      await api.post('/push/test', {});
      setMessage('Test-varsel sendt – sjekk om det dukket opp.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="settings-section">
        <div className="settings-subtitle">Varsler</div>
        <div className="empty-hint">Denne nettleseren støtter ikke push-varsler.</div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Varsler på denne enheten</div>
      <div className="empty-hint">
        F.eks. når røykvarsleren utløses. Må skrus på fra hver enkelt telefon/nettbrett som skal få varsler.
      </div>
      <div className="settings-location-item">
        <span>{subscribed ? '🔔 Varsler er på for denne enheten' : '🔕 Varsler er av for denne enheten'}</span>
        {subscribed ? (
          <button className="btn" onClick={disable} disabled={busy}>
            Skru av
          </button>
        ) : (
          <button className="btn btn-accent" onClick={enable} disabled={busy}>
            Skru på
          </button>
        )}
      </div>
      {subscribed && (
        <button className="btn" onClick={sendTest} disabled={busy}>
          Send test-varsel
        </button>
      )}
      {permission === 'denied' && (
        <div className="settings-message">
          Varsler er blokkert for denne siden i nettleseren. Du må slå det på i nettleserens
          side-innstillinger (klikk hengelås-ikonet i adressefeltet) for å prøve igjen.
        </div>
      )}
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
