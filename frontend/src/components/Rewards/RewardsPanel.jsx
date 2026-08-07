import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './RewardsPanel.css';

function timeAgo(iso) {
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function RewardsPanel() {
  const [balances, setBalances] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.get('/rewards/balances').then(setBalances).catch(() => {});
    api.get('/rewards').then((list) => setRewards(list.filter((r) => r.active))).catch(() => {});
    api.get('/rewards/redemptions?limit=8').then(setRedemptions).catch(() => {});
  }

  useEffect(() => {
    load();
    socket.on('rewards:update', load);
    return () => socket.off('rewards:update', load);
  }, []);

  const selected = balances.find((m) => m.id === selectedId);

  async function redeem(reward) {
    if (!selected) return;
    setError('');
    try {
      await api.post('/rewards/redeem', { member_id: selected.id, reward_id: reward.id });
      setCelebration({ name: selected.name, title: reward.title });
      setTimeout(() => setCelebration(null), 2600);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel panel-rewards">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🏆</span> Belønninger
        </div>
      </div>
      <div className="panel-body rewards-body">
        <div className="rewards-balances">
          {balances.map((m) => (
            <button
              key={m.id}
              className={`rewards-balance-card ${selectedId === m.id ? 'rewards-balance-card-active' : ''}`}
              style={{ borderColor: m.color }}
              onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
            >
              <span className="rewards-balance-avatar" style={{ background: m.color }}>
                {m.avatar}
              </span>
              <span className="rewards-balance-name">{m.name}</span>
              <span className="rewards-balance-stars">⭐ {m.stars_balance}</span>
              <span className="rewards-balance-week">{m.stars_this_week} denne uken</span>
            </button>
          ))}
        </div>

        {!selected && <div className="rewards-hint">Velg hvem som skal løse inn en belønning ovenfor.</div>}
        {error && <div className="rewards-error">{error}</div>}

        {rewards.length === 0 ? (
          <div className="empty-hint">
            Ingen belønninger er lagt til ennå. Legg til under ⚙️ → Belønninger.
          </div>
        ) : (
          <div className="rewards-grid">
            {rewards.map((r) => {
              const affordable = selected && selected.stars_balance >= r.star_cost;
              return (
                <div key={r.id} className={`reward-card ${!affordable ? 'reward-card-locked' : ''}`}>
                  <div className="reward-card-image">
                    {r.image_url ? <img src={r.image_url} alt={r.title} /> : <span>🎁</span>}
                  </div>
                  <div className="reward-card-title">{r.title}</div>
                  {r.description && <div className="reward-card-desc">{r.description}</div>}
                  <div className="reward-card-cost">⭐ {r.star_cost}</div>
                  <button
                    className="btn btn-accent reward-card-btn"
                    disabled={!affordable}
                    onClick={() => redeem(r)}
                  >
                    {selected ? (affordable ? 'Løs inn' : 'Ikke nok stjerner') : 'Velg person først'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {redemptions.length > 0 && (
          <div className="rewards-history">
            <div className="rewards-history-title">Nylig innløst</div>
            <ul className="rewards-history-list">
              {redemptions.map((r) => (
                <li key={r.id}>
                  {r.member_avatar} {r.member_name} løste inn <strong>{r.reward_title}</strong> ({r.stars_spent}⭐) ·{' '}
                  {timeAgo(r.redeemed_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {celebration && (
        <div className="rewards-celebration">
          <div className="rewards-celebration-emoji">🎉</div>
          <div className="rewards-celebration-text">
            {celebration.name} løste inn<br />
            <strong>{celebration.title}</strong>!
          </div>
        </div>
      )}
    </section>
  );
}
