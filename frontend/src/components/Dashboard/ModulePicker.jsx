import { useState } from 'react';

const GROUPS = {
  Familie: ['messages', 'kids', 'rewards', 'gps', 'telemedicine'],
  Hjem: ['dinner-planner', 'weatherbus', 'smarthome', 'powerprice', 'timer', 'cameras'],
  Fritid: ['play-outside', 'coloring'],
  Trening: ['garmin', 'strava'],
};
export default function ModulePicker({ panels, preferences, onChange, openPanel }) {
  const [editing, setEditing] = useState(false);
  function toggle(list, key) {
    onChange({ ...preferences, [list]: preferences[list].includes(key) ? preferences[list].filter(item => item !== key) : [...preferences[list], key] });
  }
  return <div className="module-picker">
    <button className="btn" onClick={() => setEditing(value => !value)}>{editing ? 'Ferdig' : 'Tilpass meny og favoritter'}</button>
    {editing && <p className="empty-hint">Valgene lagres for kontoen din i denne nettleseren. Skjulte funksjoner kan alltid vises igjen her.</p>}
    {Object.entries(GROUPS).map(([label, keys]) => {
      const visible = panels.filter(panel => keys.includes(panel.key) && (editing || !preferences.hidden.includes(panel.key)));
      return visible.length > 0 && <section key={label}><h2>{label}</h2><div className="dashboard-more-grid">
        {visible.map(({ key, icon, label }) => <div key={key} className="module-card">
          <button className="dashboard-more-item" onClick={() => openPanel(key)}><span className="dashboard-more-item-icon">{icon}</span>{label}</button>
          {editing && <div className="module-options">
            <button className="btn" aria-label={`${label} som favoritt`} aria-pressed={preferences.favorites.includes(key)} onClick={() => toggle('favorites', key)}>{preferences.favorites.includes(key) ? '★ Favoritt' : '☆ Favoritt'}</button>
            <label><input type="checkbox" aria-label={`Vis ${label}`} checked={!preferences.hidden.includes(key)} onChange={() => toggle('hidden', key)} /> Vis</label>
          </div>}
        </div>)}
      </div></section>;
    })}
  </div>;
}
