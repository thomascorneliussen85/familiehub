import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import ActivityDetailModal from '../Garmin/ActivityDetailModal';
import './StravaPanel.css';

const TYPE_ICONS = {
  Run: '🏃',
  TrailRun: '🏃',
  Ride: '🚴',
  MountainBikeRide: '🚴',
  VirtualRide: '🚴',
  Walk: '🚶',
  Hike: '🥾',
  Swim: '🏊',
  WeightTraining: '🏋️',
  Workout: '🏋️',
  Yoga: '🧘',
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
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function StravaPanel() {
  const [configured, setConfigured] = useState(true);
  const [activities, setActivities] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [openActivityId, setOpenActivityId] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/strava/status'), api.get('/strava/activities')])
      .then(([status, list]) => {
        setConfigured(status.configured);
        setActivities(list);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    function onUpdate(list) {
      setActivities(list);
    }
    socket.on('strava:update', onUpdate);
    return () => socket.off('strava:update', onUpdate);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      const result = await api.post('/strava/sync');
      setActivities(result.activities);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="panel panel-strava">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🟠</span> Strava
        </div>
        {configured && (
          <button className="btn btn-icon" onClick={handleSync} disabled={syncing} aria-label="Synkroniser">
            {syncing ? '⏳' : '🔄'}
          </button>
        )}
      </div>
      <div className="panel-body strava-body">
        {loaded && !configured && (
          <div className="empty-hint">Strava er ikke koblet til ennå. Gå til ⚙️ → Enheter for å koble til.</div>
        )}
        {error && <div className="strava-error">{error}</div>}
        {configured && loaded && activities.length === 0 && !error && (
          <div className="empty-hint">Ingen treningsøkter hentet ennå. Trykk 🔄 for å synkronisere.</div>
        )}
        <ul className="strava-list">
          {activities.map((a) => (
            <li
              key={a.strava_activity_id}
              className="strava-activity strava-activity-clickable"
              onClick={() => setOpenActivityId(a.strava_activity_id)}
            >
              <span className="strava-activity-icon">{activityIcon(a.activity_type)}</span>
              <div className="strava-activity-info">
                <div className="strava-activity-name">{a.name}</div>
                <div className="strava-activity-meta">
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
      {openActivityId != null && (
        <ActivityDetailModal
          activityId={openActivityId}
          onClose={() => setOpenActivityId(null)}
          basePath="/strava"
          showCoach={false}
        />
      )}
    </section>
  );
}
