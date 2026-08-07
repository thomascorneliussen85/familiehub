import { useEffect, useRef, useState } from 'react';

export default function PhotosSettingsTab({ adminApi }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef(null);

  const [googleMessage, setGoogleMessage] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const pollRef = useRef(null);

  function loadPhotos() {
    fetch('/api/photos')
      .then((r) => r.json())
      .then(setPhotos)
      .catch(() => {});
  }

  useEffect(() => {
    loadPhotos();
    return () => clearInterval(pollRef.current);
  }, []);

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setUploadMessage('');
    try {
      const formData = new FormData();
      for (const file of files) formData.append('photos', file);
      const saved = await adminApi.postForm('/photos', formData);
      setUploadMessage(`${saved.length} bilde${saved.length === 1 ? '' : 'r'} lastet opp ✓`);
      loadPhotos();
    } catch (err) {
      setUploadMessage(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(name) {
    setPhotos((prev) => prev.filter((p) => p.name !== name));
    await adminApi.delete(`/photos/${encodeURIComponent(name)}`).catch(() => loadPhotos());
  }

  async function connectGoogle() {
    setGoogleMessage('');
    try {
      const { url } = await adminApi.get('/photos/google/auth-url');
      const popup = window.open(url, 'google-photos-picker', 'width=480,height=720');
      if (!popup) {
        setGoogleMessage('Nettleseren blokkerte popup-vinduet. Tillat popup for denne siden og prøv igjen.');
        return;
      }
      setGoogleBusy(true);
      setGoogleMessage('Velg bilder i vinduet som åpnet seg…');
      pollRef.current = setInterval(async () => {
        try {
          const status = await adminApi.get('/photos/google/session-status');
          if (status.mediaItemsSet) {
            clearInterval(pollRef.current);
            setGoogleMessage('Laster ned valgte bilder…');
            const result = await adminApi.post('/photos/google/import');
            setGoogleMessage(`${result.imported} bilde${result.imported === 1 ? '' : 'r'} lagt til ✓`);
            setGoogleBusy(false);
            loadPhotos();
          } else if (!status.active) {
            clearInterval(pollRef.current);
            setGoogleBusy(false);
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setGoogleBusy(false);
          setGoogleMessage(err.message);
        }
      }, 3000);
    } catch (err) {
      setGoogleMessage(err.message);
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Fotoramme-bilder</div>
      <p className="empty-hint" style={{ padding: 0 }}>
        Last opp så mange bilder du vil – fotoramme-modusen (etter litt inaktivitet) bytter bilde
        hvert 10. sekund.
      </p>
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        hidden
      />
      <button className="btn btn-accent" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        {uploading ? 'Laster opp…' : '📤 Last opp bilder'}
      </button>
      {uploadMessage && <div className="settings-message">{uploadMessage}</div>}

      {photos.length > 0 && (
        <div className="settings-photo-grid">
          {photos.map((p) => (
            <div key={p.name} className="settings-photo-item">
              <img src={p.url} alt="" />
              <button className="btn btn-icon settings-photo-remove" onClick={() => removePhoto(p.name)} aria-label="Fjern">
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="settings-subtitle" style={{ marginTop: 18 }}>
        Google Photos
      </div>
      <p className="empty-hint" style={{ padding: 0 }}>
        Google tillater ikke lenger løpende tilkobling til en mappe/et album – du velger bilder
        manuelt i Googles eget vindu hver gang, og FamilieHub laster dem ned hit. Gjenta når du
        vil legge til flere.
      </p>
      <button className="btn btn-accent" onClick={connectGoogle} disabled={googleBusy}>
        {googleBusy ? 'Venter…' : '📷 Koble til Google Photos'}
      </button>
      {googleMessage && <div className="settings-message">{googleMessage}</div>}
    </div>
  );
}
