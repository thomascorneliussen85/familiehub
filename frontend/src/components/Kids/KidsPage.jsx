import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './KidsPage.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const WEEKDAYS = [
  ['mon', 'Man'],
  ['tue', 'Tir'],
  ['wed', 'Ons'],
  ['thu', 'Tor'],
  ['fri', 'Fre'],
  ['sat', 'Lør'],
  ['sun', 'Søn'],
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyChoreForm = { title: '', type: 'daily', weekday: 'mon', stars: 1 };

export default function KidsPage() {
  const { members } = useFamilyMembers();
  const kids = useMemo(() => members.filter((m) => m.role === 'barn'), [members]);
  const [selectedId, setSelectedId] = useState(null);

  const [chores, setChores] = useState([]);
  const [weeklyGrid, setWeeklyGrid] = useState([]);
  const [balances, setBalances] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [savingsGoal, setSavingsGoal] = useState(null);
  const [longTermGoals, setLongTermGoals] = useState([]);

  const [showAddChore, setShowAddChore] = useState(false);
  const [choreForm, setChoreForm] = useState(emptyChoreForm);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', star_cost: 20 });
  const [newLongTerm, setNewLongTerm] = useState('');
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    if (!selectedId && kids.length > 0) setSelectedId(kids[0].id);
  }, [kids, selectedId]);

  function loadAll() {
    if (!selectedId) return;
    api.get('/chores').then(setChores).catch(() => {});
    api.get(`/chores/weekly-grid?member_id=${selectedId}`).then(setWeeklyGrid).catch(() => {});
    api.get('/rewards/balances').then(setBalances).catch(() => {});
    api.get('/rewards').then((list) => setRewards(list.filter((r) => r.active))).catch(() => {});
    api
      .get(`/family-goals/savings?member_id=${selectedId}`)
      .then((list) => setSavingsGoal(list[0] || null))
      .catch(() => {});
    api.get(`/family-goals/long-term?member_id=${selectedId}`).then(setLongTermGoals).catch(() => {});
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    socket.on('chores:update', loadAll);
    socket.on('rewards:update', loadAll);
    socket.on('family-goals:update', loadAll);
    return () => {
      socket.off('chores:update', loadAll);
      socket.off('rewards:update', loadAll);
      socket.off('family-goals:update', loadAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectedBalance = balances.find((b) => b.id === selectedId);
  const otherChores = chores.filter((c) => c.member_id === selectedId && c.recurrence !== 'daily');

  async function toggleChore(id) {
    await api.post(`/chores/${id}/toggle`).catch(() => {});
  }

  async function toggleGridDay(choreId, date) {
    await api.post(`/chores/${choreId}/toggle`, { date }).catch(() => {});
  }

  async function addChore(e) {
    e.preventDefault();
    const title = choreForm.title.trim();
    if (!title || !selectedId) return;
    const recurrence = choreForm.type === 'daily' ? 'daily' : choreForm.type === 'weekly' ? `weekly:${choreForm.weekday}` : 'once';
    await api
      .post('/chores', { title, member_id: selectedId, recurrence, stars: choreForm.stars })
      .catch(() => {});
    setChoreForm(emptyChoreForm);
    setShowAddChore(false);
  }

  async function removeChore(id, e) {
    e.stopPropagation();
    await api.delete(`/chores/${id}`).catch(() => {});
  }

  async function saveGoal(e) {
    e.preventDefault();
    const title = goalForm.title.trim();
    if (!title || !selectedId) return;
    await api.post('/family-goals/savings', { member_id: selectedId, title, star_cost: goalForm.star_cost }).catch(() => {});
    setGoalForm({ title: '', star_cost: 20 });
    setShowGoalForm(false);
  }

  async function redeemGoal() {
    if (!savingsGoal) return;
    setError('');
    try {
      await api.post(`/family-goals/savings/${savingsGoal.id}/redeem`);
      setCelebration(savingsGoal.title);
      setTimeout(() => setCelebration(null), 2600);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelGoal() {
    if (!savingsGoal) return;
    await api.delete(`/family-goals/savings/${savingsGoal.id}`).catch(() => {});
  }

  async function addLongTerm(e) {
    e.preventDefault();
    const title = newLongTerm.trim();
    if (!title || !selectedId) return;
    await api.post('/family-goals/long-term', { member_id: selectedId, title }).catch(() => {});
    setNewLongTerm('');
  }

  async function toggleLongTerm(id) {
    await api.patch(`/family-goals/long-term/${id}/toggle`).catch(() => {});
  }

  async function removeLongTerm(id, e) {
    e.stopPropagation();
    await api.delete(`/family-goals/long-term/${id}`).catch(() => {});
  }

  async function redeemReward(reward) {
    if (!selectedId) return;
    setError('');
    try {
      await api.post('/rewards/redeem', { member_id: selectedId, reward_id: reward.id });
      setCelebration(reward.title);
      setTimeout(() => setCelebration(null), 2600);
    } catch (err) {
      setError(err.message);
    }
  }

  if (kids.length === 0) {
    return (
      <section className="panel panel-kids">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">🧒</span> Barn
          </div>
        </div>
        <div className="panel-body">
          <div className="empty-hint">
            Ingen familiemedlemmer er markert som «barn» ennå. Legg til under ⚙️ → Familie.
          </div>
        </div>
      </section>
    );
  }

  const today = todayStr();
  const goalProgress = savingsGoal && selectedBalance ? Math.min(1, selectedBalance.stars_balance / savingsGoal.star_cost) : 0;
  const goalAffordable = savingsGoal && selectedBalance && selectedBalance.stars_balance >= savingsGoal.star_cost;

  return (
    <section className="panel panel-kids">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🧒</span> Barn
        </div>
      </div>
      <div className="panel-body kids-body">
        <div className="kids-tabs">
          {kids.map((k) => (
            <button
              key={k.id}
              className={`kids-tab ${selectedId === k.id ? 'kids-tab-active' : ''}`}
              style={{ borderColor: k.color }}
              onClick={() => setSelectedId(k.id)}
            >
              <span className="kids-tab-avatar" style={{ background: k.color }}>
                {k.avatar}
              </span>
              {k.name}
            </button>
          ))}
        </div>

        {selectedBalance && (
          <div className="kids-stats">
            <div className="kids-stat-card">
              <span className="kids-stat-label">Poeng denne uken</span>
              <span className="kids-stat-value">⭐ {selectedBalance.stars_this_week}</span>
            </div>
            <div className="kids-stat-card">
              <span className="kids-stat-label">Saldo (kan løses inn)</span>
              <span className="kids-stat-value">⭐ {selectedBalance.stars_balance}</span>
            </div>
          </div>
        )}

        {error && <div className="kids-error">{error}</div>}

        <div className="kids-section">
          <div className="kids-section-header">
            <span>Sparemål</span>
          </div>
          {savingsGoal ? (
            <div className="kids-goal-card">
              <div className="kids-goal-title">{savingsGoal.title}</div>
              <div className="kids-goal-track">
                <div className="kids-goal-track-fill" style={{ width: `${goalProgress * 100}%` }} />
              </div>
              <div className="kids-goal-meta">
                ⭐ {selectedBalance?.stars_balance ?? 0} / {savingsGoal.star_cost}
              </div>
              <div className="kids-goal-actions">
                <button className="btn" onClick={cancelGoal}>
                  Avbryt mål
                </button>
                <button className="btn btn-accent" onClick={redeemGoal} disabled={!goalAffordable}>
                  {goalAffordable ? '🎉 Løs inn' : 'Ikke nok stjerner'}
                </button>
              </div>
            </div>
          ) : showGoalForm ? (
            <form className="kids-goal-form" onSubmit={saveGoal}>
              <input
                type="text"
                placeholder="Hva sparer du til?"
                value={goalForm.title}
                onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                autoFocus
              />
              <input
                type="number"
                min="1"
                value={goalForm.star_cost}
                onChange={(e) => setGoalForm((f) => ({ ...f, star_cost: Number(e.target.value) }))}
              />
              <button type="button" className="btn" onClick={() => setShowGoalForm(false)}>
                Avbryt
              </button>
              <button type="submit" className="btn btn-accent">
                Lagre mål
              </button>
            </form>
          ) : (
            <button className="btn kids-goal-add-btn" onClick={() => setShowGoalForm(true)}>
              + Sett et sparemål
            </button>
          )}
        </div>

        <div className="kids-section">
          <div className="kids-section-header">
            <span>Langsiktige mål</span>
          </div>
          <ul className="kids-longterm-list">
            {longTermGoals.length === 0 && <li className="empty-hint">Ingen mål ennå – f.eks. «Les en hel bok»</li>}
            {longTermGoals.map((g) => (
              <li
                key={g.id}
                className={`kids-longterm-item ${g.done ? 'kids-longterm-item-done' : ''}`}
                onClick={() => toggleLongTerm(g.id)}
              >
                <span className="kids-longterm-check">{g.done ? '✔' : ''}</span>
                <span className="kids-longterm-title">{g.title}</span>
                <button className="kids-longterm-remove" onClick={(e) => removeLongTerm(g.id, e)} aria-label="Slett">
                  🗑️
                </button>
              </li>
            ))}
          </ul>
          <form className="kids-longterm-form" onSubmit={addLongTerm}>
            <input
              type="text"
              placeholder="Nytt mål…"
              value={newLongTerm}
              onChange={(e) => setNewLongTerm(e.target.value)}
            />
            <button type="submit" className="btn btn-accent">
              Legg til
            </button>
          </form>
        </div>

        <div className="kids-section">
          <div className="kids-section-header">
            <span>Hver dag</span>
            <button className="kids-add-chore-btn" onClick={() => (showAddChore ? setShowAddChore(false) : setShowAddChore(true))}>
              {showAddChore ? '✕' : '+ Nytt gjøremål'}
            </button>
          </div>

          {showAddChore && (
            <form className="kids-chore-form" onSubmit={addChore}>
              <input
                type="text"
                placeholder="Tittel…"
                value={choreForm.title}
                onChange={(e) => setChoreForm((f) => ({ ...f, title: e.target.value }))}
                required
                autoFocus
              />
              <div className="kids-chore-type-row">
                <button
                  type="button"
                  className={`kids-chore-type-btn ${choreForm.type === 'daily' ? 'kids-chore-type-btn-active' : ''}`}
                  onClick={() => setChoreForm((f) => ({ ...f, type: 'daily' }))}
                >
                  🔁 Hver dag
                </button>
                <button
                  type="button"
                  className={`kids-chore-type-btn ${choreForm.type === 'weekly' ? 'kids-chore-type-btn-active' : ''}`}
                  onClick={() => setChoreForm((f) => ({ ...f, type: 'weekly' }))}
                >
                  📅 Én ukedag
                </button>
                <button
                  type="button"
                  className={`kids-chore-type-btn ${choreForm.type === 'once' ? 'kids-chore-type-btn-active' : ''}`}
                  onClick={() => setChoreForm((f) => ({ ...f, type: 'once' }))}
                >
                  ✅ Bare gjør
                </button>
              </div>
              {choreForm.type === 'weekly' && (
                <select value={choreForm.weekday} onChange={(e) => setChoreForm((f) => ({ ...f, weekday: e.target.value }))}>
                  {WEEKDAYS.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <div className="kids-chore-stars-row">
                {[1, 2, 3].map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={`kids-chore-star-btn ${choreForm.stars === n ? 'kids-chore-star-btn-active' : ''}`}
                    onClick={() => setChoreForm((f) => ({ ...f, stars: n }))}
                  >
                    {'⭐'.repeat(n)}
                  </button>
                ))}
              </div>
              <button type="submit" className="btn btn-accent">
                Legg til
              </button>
            </form>
          )}

          {weeklyGrid.length === 0 && !showAddChore && (
            <div className="empty-hint">Ingen daglige gjøremål ennå</div>
          )}
          {weeklyGrid.map((chore) => (
            <div key={chore.id} className="kids-grid-row">
              <div className="kids-grid-row-title">
                {chore.title} <span className="kids-grid-row-stars">{'⭐'.repeat(chore.stars)}</span>
              </div>
              <div className="kids-grid-row-days">
                {chore.days.map((d, i) => (
                  <button
                    key={d.date}
                    className={`kids-grid-checkbox ${d.done ? 'kids-grid-checkbox-done' : ''} ${d.date === today ? 'kids-grid-checkbox-today' : ''}`}
                    onClick={() => toggleGridDay(chore.id, d.date)}
                    aria-label={`${DAY_LABELS[i]} ${d.done ? 'gjort' : 'ikke gjort'}`}
                  >
                    {d.done ? '✓' : DAY_LABELS[i][0]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {otherChores.length > 0 && (
          <div className="kids-section">
            <div className="kids-section-header">
              <span>Andre gjøremål</span>
            </div>
            <ul className="kids-other-list">
              {otherChores.map((c) => (
                <li
                  key={c.id}
                  className={`kids-other-item ${c.done ? 'kids-other-item-done' : ''}`}
                  onClick={() => toggleChore(c.id)}
                >
                  <span className="kids-other-check">{c.done ? '✔' : ''}</span>
                  <span className="kids-other-title">{c.title}</span>
                  <span className="kids-other-stars">{'⭐'.repeat(c.stars)}</span>
                  <button className="kids-other-remove" onClick={(e) => removeChore(c.id, e)} aria-label="Slett">
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="kids-section">
          <div className="kids-section-header">
            <span>Belønninger</span>
          </div>
          {rewards.length === 0 ? (
            <div className="empty-hint">Ingen belønninger er lagt til ennå. Legg til under ⚙️ → Belønninger.</div>
          ) : (
            <div className="kids-rewards-grid">
              {rewards.map((r) => {
                const affordable = selectedBalance && selectedBalance.stars_balance >= r.star_cost;
                return (
                  <div key={r.id} className={`kids-reward-card ${!affordable ? 'kids-reward-card-locked' : ''}`}>
                    <div className="kids-reward-card-image">
                      {r.image_url ? <img src={r.image_url} alt={r.title} /> : <span>🎁</span>}
                    </div>
                    <div className="kids-reward-card-title">{r.title}</div>
                    <div className="kids-reward-card-cost">⭐ {r.star_cost}</div>
                    <button
                      className="btn btn-accent kids-reward-card-btn"
                      disabled={!affordable}
                      onClick={() => redeemReward(r)}
                    >
                      {affordable ? 'Løs inn' : 'Ikke nok'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {celebration && (
        <div className="kids-celebration">
          <div className="kids-celebration-emoji">🎉</div>
          <div className="kids-celebration-text">
            Fikk <strong>{celebration}</strong>!
          </div>
        </div>
      )}
    </section>
  );
}
