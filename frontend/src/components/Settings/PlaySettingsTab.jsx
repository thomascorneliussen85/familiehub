import { useEffect, useState } from 'react';

export default function PlaySettingsTab({ adminApi }) {
  const [locations, setLocations] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('📍');
  const [expiryHours, setExpiryHours] = useState(2);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    fetch('/api/play-locations')
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
    adminApi
      .get('/play-admin/expiry-hours')
      .then((d) => setExpiryHours(d.hours))
      .catch(() => {});
  }, [adminApi]);

  async function addLocation() {
    if (!newLabel.trim()) return;
    const loc = await adminApi
      .post('/play-admin/locations', { label: newLabel.trim(), emoji: newEmoji || '📍' })
      .catch(() => null);
    if (loc) {
      setLocations((prev) => [...prev, loc]);
      setNewLabel('');
      setNewEmoji('📍');
    }
  }

  async function removeLocation(id) {
    await adminApi.delete(`/play-admin/locations/${id}`).catch(() => {});
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  async function saveExpiry() {
    setSavedMsg('');
    const parsed = Number(expiryHours);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    await adminApi.patch('/play-admin/expiry-hours', { hours: parsed }).catch(() => {});
    setSavedMsg('Lagret ✓');
    setTimeout(() => setSavedMsg(''), 2500);
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Steder</div>
      <div className="settings-locations-list">
        {locations.map((loc) => (
          <div key={loc.id} className="settings-location-item">
            <span>
              {loc.emoji} {loc.label}
            </span>
            <button
              className="btn btn-icon"
              onClick={() => removeLocation(loc.id)}
              aria-label="Fjern"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="settings-location-add">
        <input
          type="text"
          placeholder="Emoji"
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value)}
          className="settings-emoji-input"
        />
        <input
          type="text"
          placeholder="Nytt sted…"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button className="btn btn-accent" onClick={addLocation}>
          Legg til
        </button>
      </div>

      <div className="settings-subtitle">Automatisk utløpstid</div>
      <div className="settings-expiry">
        <input
          type="number"
          min="1"
          value={expiryHours}
          onChange={(e) => setExpiryHours(e.target.value)}
        />
        <span>timer</span>
        <button className="btn btn-accent" onClick={saveExpiry}>
          Lagre
        </button>
        {savedMsg && <span className="settings-saved-msg">{savedMsg}</span>}
      </div>
    </div>
  );
}
