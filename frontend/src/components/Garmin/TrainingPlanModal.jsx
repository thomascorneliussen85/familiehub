import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './ActivityDetailModal.css';

export default function TrainingPlanModal({ onClose }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (generate) => {
    setLoading(true);
    setError('');
    try {
      const data = generate ? await api.post('/garmin/plan') : await api.get('/garmin/plan');
      if (!data && !generate) {
        await load(true);
        return;
      }
      setPlan(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="activity-overlay" onClick={onClose}>
      <div className="activity-modal" onClick={(e) => e.stopPropagation()}>
        <button className="activity-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="activity-header">
          <span className="activity-icon">🧭</span>
          <div>
            <div className="activity-title">Treningsplan</div>
            <div className="activity-date">
              {plan ? `Basert på ${plan.activity_count} nylige økter` : ' '}
            </div>
          </div>
        </div>

        {error && <div className="activity-error">{error}</div>}
        {loading && <div className="activity-loading">Lager treningsplan…</div>}
        {!loading && plan && <p className="activity-coach-text">{plan.content}</p>}

        <button className="btn btn-accent" onClick={() => load(true)} disabled={loading}>
          🔄 Lag ny plan
        </button>
      </div>
    </div>
  );
}
