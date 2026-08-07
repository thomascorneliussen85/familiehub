import { useEffect, useRef, useState } from 'react';

export default function PhotosSettingsTab({ adminApi }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function connectGoogle() {
    setMessage('');
    try {
      const { url } = await adminApi.get('/photos/google/auth-url');
      const popup = window.open(url, 'google-photos-picker', 'width=480,height=720');
      if (!popup) {
        setMessage('Nettleseren blokkerte popup-vinduet. Tillat popup for denne siden og prøv igjen.');
        return;
      }
      setBusy(true);
      setMessage('Velg bilder i vinduet som åpnet seg…');
      pollRef.current = setInterval(async () => {
        try {
          const status = await adminApi.get('/photos/google/session-status');
          if (status.mediaItemsSet) {
            clearInterval(pollRef.current);
            setMessage('Laster ned valgte bilder…');
            const result = await adminApi.post('/photos/google/import');
            setMessage(`${result.imported} bilde${result.imported === 1 ? '' : 'r'} lagt til ✓`);
            setBusy(false);
          } else if (!status.active) {
            clearInterval(pollRef.current);
            setBusy(false);
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setBusy(false);
          setMessage(err.message);
        }
      }, 3000);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Google Photos</div>
      <p className="empty-hint" style={{ padding: 0 }}>
        Google tillater ikke lenger løpende tilkobling til en mappe/et album – du velger bilder
        manuelt i Googles eget vindu hver gang, og FamilieHub laster dem ned til fotoramme-mappen.
        Gjenta når du vil legge til flere.
      </p>
      <button className="btn btn-accent" onClick={connectGoogle} disabled={busy}>
        {busy ? 'Venter…' : '📷 Koble til Google Photos'}
      </button>
      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
