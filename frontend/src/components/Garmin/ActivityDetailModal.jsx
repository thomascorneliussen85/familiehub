import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './ActivityDetailModal.css';

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

function formatDuration(seconds) {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}t ${String(m).padStart(2, '0')}min`;
  return `${m} min ${String(s).padStart(2, '0')}s`;
}

function formatDistance(meters) {
  if (!meters) return null;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatSpeed(mps) {
  if (!mps) return null;
  return `${(mps * 3.6).toFixed(1)} km/t`;
}

function formatPace(mps) {
  if (!mps) return null;
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} min/km`;
}

function formatDate(iso) {
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('nb-NO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Stat({ label, value }) {
  if (value == null) return null;
  return (
    <div className="activity-stat">
      <span className="activity-stat-value">{value}</span>
      <span className="activity-stat-label">{label}</span>
    </div>
  );
}

export default function ActivityDetailModal({ activityId, onClose }) {
  const [activity, setActivity] = useState(null);
  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCoach = useCallback(async (generate) => {
    setCoachLoading(true);
    try {
      const note = generate
        ? await api.post(`/garmin/activities/${activityId}/coach`)
        : await api.get(`/garmin/activities/${activityId}/coach`);
      if (!note && !generate) {
        await loadCoach(true);
        return;
      }
      setCoach(note);
    } catch (err) {
      setError(err.message);
    } finally {
      setCoachLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  useEffect(() => {
    api
      .get(`/garmin/activities/${activityId}`)
      .then(setActivity)
      .catch((err) => setError(err.message));
    loadCoach(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  if (!activity && !error) {
    return (
      <div className="activity-overlay" onClick={onClose}>
        <div className="activity-modal" onClick={(e) => e.stopPropagation()}>
          <div className="activity-loading">Laster…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-overlay" onClick={onClose}>
      <div className="activity-modal" onClick={(e) => e.stopPropagation()}>
        <button className="activity-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        {error && <div className="activity-error">{error}</div>}
        {activity && (
          <>
            <div className="activity-header">
              <span className="activity-icon">{TYPE_ICONS[activity.activity_type] || '🏅'}</span>
              <div>
                <div className="activity-title">{activity.name}</div>
                <div className="activity-date">{formatDate(activity.start_time)}</div>
              </div>
            </div>

            <div className="activity-stats-grid">
              <Stat label="Varighet" value={formatDuration(activity.duration_seconds)} />
              <Stat label="Distanse" value={formatDistance(activity.distance_m)} />
              <Stat label="Kalorier" value={activity.calories ? `${Math.round(activity.calories)} kcal` : null} />
              <Stat label="Snittpuls" value={activity.avg_hr ? `${Math.round(activity.avg_hr)} bpm` : null} />
              <Stat label="Makspuls" value={activity.max_hr ? `${Math.round(activity.max_hr)} bpm` : null} />
              <Stat label="Snittfart" value={formatSpeed(activity.avg_speed_mps)} />
              <Stat label="Snittempo" value={formatPace(activity.avg_speed_mps)} />
              <Stat label="Makshastighet" value={formatSpeed(activity.max_speed_mps)} />
              <Stat label="Høydemeter opp" value={activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m)} m` : null} />
              <Stat label="Høydemeter ned" value={activity.elevation_loss_m ? `${Math.round(activity.elevation_loss_m)} m` : null} />
              <Stat label="Kadens" value={activity.avg_cadence ? `${Math.round(activity.avg_cadence)} spm` : null} />
              <Stat label="Skrittlengde" value={activity.avg_stride_length_m ? `${activity.avg_stride_length_m.toFixed(2)} m` : null} />
              <Stat label="VO2max" value={activity.vo2max || null} />
              <Stat label="Aerob effekt" value={activity.aerobic_effect || null} />
              <Stat label="Anaerob effekt" value={activity.anaerobic_effect || null} />
              <Stat label="Runder" value={activity.lap_count || null} />
              <Stat label="Enhet" value={activity.device_name || null} />
            </div>

            <div className="activity-coach">
              <div className="activity-coach-header">
                <span className="activity-coach-title">🧑‍🏫 Treningscoach</span>
                <button
                  className="btn btn-icon"
                  onClick={() => loadCoach(true)}
                  disabled={coachLoading}
                  aria-label="Oppdater kommentar"
                >
                  {coachLoading ? '⏳' : '🔄'}
                </button>
              </div>
              {coachLoading && !coach && <div className="activity-loading">Analyserer økten…</div>}
              {coach && <p className="activity-coach-text">{coach.commentary}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
