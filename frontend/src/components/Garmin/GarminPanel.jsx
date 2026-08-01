import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './GarminPanel.css';

const TYPE_ICONS = {
  street_running: '🏃',
  running: '🏃',
  trail_running: '🏃',
  indoor_running: '🏃',
  cycling: '🚴',
  indoor_cycling: '🚴',
  walking: '🚶',
  hiking: '🥾',
  swimming: '🏊',
  strength_training: '🏋️',
  fitness_equipment: '🏋️',
  yoga: '🧘',
  water_sports: '🏄',
};

function activityIcon(type) {
  return TYPE_ICONS[type] || '🏅';
}

function formatDuration(seconds) {
  if (seconds == null) return '–';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}t ${String(m).padStart(2, '0')}min`;
  return `${m} min`;
}

function formatDistance(meters) {
  if (!meters) return null;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDate(iso) {
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GarminPanel() {
  const [configured, setConfigured] = useState(true);
  const [activities, setActivities] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/garmin/status'), api.get('/garmin/activities')])
      .then(([status, list]) => {
        setConfigured(status.configured);
        setActivities(list);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    function onUpdate(list) {
      setActivities(list);
    }
    socket.on('garmin:update', onUpdate);
    return () => socket.off('garmin:update', onUpdate);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      const result = await api.post('/garmin/sync');
      setActivities(result.activities);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="panel panel-garmin">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">⌚</span> Garmin
        </div>
        {configured && (
          <button className="btn btn-icon" onClick={handleSync} disabled={syncing} aria-label="Synkroniser">
            {syncing ? '⏳' : '🔄'}
          </button>
        )}
      </div>
      <div className="panel-body garmin-body">
        {loaded && !configured && (
          <div className="empty-hint">
            Garmin er ikke koblet til ennå. Legg til GARMIN_USERNAME og GARMIN_PASSWORD i .env på
            serveren for å koble til klokken din.
          </div>
        )}
        {error && <div className="garmin-error">{error}</div>}
        {configured && loaded && activities.length === 0 && !error && (
          <div className="empty-hint">Ingen treningsøkter hentet ennå. Trykk 🔄 for å synkronisere.</div>
        )}
        <ul className="garmin-list">
          {activities.map((a) => (
            <li key={a.garmin_activity_id} className="garmin-activity">
              <span className="garmin-activity-icon">{activityIcon(a.activity_type)}</span>
              <div className="garmin-activity-info">
                <div className="garmin-activity-name">{a.name}</div>
                <div className="garmin-activity-meta">
                  {formatDate(a.start_time)} · {formatDuration(a.duration_seconds)}
                  {formatDistance(a.distance_m) && ` · ${formatDistance(a.distance_m)}`}
                  {a.calories ? ` · ${Math.round(a.calories)} kcal` : ''}
                  {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
