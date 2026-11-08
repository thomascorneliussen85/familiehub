import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { speak } from '../../lib/speech';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './KidsPage.css';
import DailyRoutines from './DailyRoutines';

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
  return new Date().toLocaleDateString('sv-SE');
}

function starWord(n) {
  return n === 1 ? 'stjerne' : 'stjerner';
}

function tasksForToday(chores, memberId) {
  const today = todayStr();
  return chores.filter((c) => c.member_id === memberId && c.period_key === today);
}

const emptyChoreForm = { title: '', type: 'daily', weekday: 'mon', stars: 1, rewardText: '' };

export default function KidsPage() {
  const { members } = useFamilyMembers();
  const kids = useMemo(() => members.filter((m) => m.role === 'barn'), [members]);
  const [selectedId, setSelectedId] = useState(null);
  const [funMode, setFunMode] = useState(true);
  const [funEntered, setFunEntered] = useState(false);

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
  const celebrationTimeout = useRef(null);
  const prevAllDoneRef = useRef({ id: null, allDone: false });

  useEffect(() => {
    if (!selectedId && kids.length > 0) setSelectedId(kids[0].id);
  }, [kids, selectedId]);

  function loadAll() {
    api.get('/chores').then(setChores).catch(() => {});
    api.get('/rewards/balances').then(setBalances).catch(() => {});
    api.get('/rewards').then((list) => setRewards(list.filter((r) => r.active))).catch(() => {});
    if (!selectedId) return;
    api.get(`/chores/weekly-grid?member_id=${selectedId}`).then(setWeeklyGrid).catch(() => {});
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
  const selectedKid = kids.find((k) => k.id === selectedId) || null;
  const otherChores = chores.filter((c) => c.member_id === selectedId && c.recurrence !== 'daily');
  const funTasks = selectedId ? tasksForToday(chores, selectedId) : [];

  function fireCelebration(text, bonus = false) {
    if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
    setCelebration({ text, bonus });
    celebrationTimeout.current = setTimeout(() => setCelebration(null), bonus ? 3400 : 2600);
  }

  // Oppdager når et barn akkurat har fullført alt for dagen i gøy-modus, og
  // feirer det litt ekstra – "prev.id === selectedId" sørger for at vi ikke
  // feirer bare fordi vi byttet til et barn som allerede var ferdig fra før.
  useEffect(() => {
    if (!selectedId) return;
    const todays = tasksForToday(chores, selectedId);
    const allDone = todays.length > 0 && todays.every((t) => t.done);
    const prev = prevAllDoneRef.current;
    if (funMode && funEntered && prev.id === selectedId && allDone && !prev.allDone) {
      speak(`Hurra, ${selectedKid?.name}! Du er ferdig med alt i dag!`);
      fireCelebration('Alle oppgaver ferdig i dag! 🏆', true);
    }
    prevAllDoneRef.current = { id: selectedId, allDone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chores, selectedId, funMode, funEntered]);

  // Leser en hilsen når et barn velger seg selv i gøy-modus
  function enterFunKid(id) {
    setSelectedId(id);
    setFunEntered(true);
    const kid = kids.find((k) => k.id === id);
    const undone = tasksForToday(chores, id).filter((t) => !t.done).length;
    if (kid) {
      speak(
        undone > 0
          ? `Hei, ${kid.name}! Du har ${undone} ${undone === 1 ? 'oppgave' : 'oppgaver'} i dag.`
          : `Hei, ${kid.name}! Du er ferdig med alt i dag. Kjempebra!`
      );
    }
  }

  function readTask(task) {
    speak(`${task.title}. Du får ${task.stars} ${starWord(task.stars)}!`);
  }

  async function toggleChore(id) {
    await api.post(`/chores/${id}/toggle`).catch(() => {});
  }

  async function completeFunTask(task) {
    await toggleChore(task.id);
    if (!task.done) {
      const text = task.reward_text
        ? `Kjempebra! Du fikk ${task.stars} ${starWord(task.stars)}. Belønningen din er: ${task.reward_text}`
        : `Kjempebra! Du fikk ${task.stars} ${starWord(task.stars)}!`;
      speak(text);
      fireCelebration(task.reward_text || 'Bra jobba! 🎉');
    }
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
      .post('/chores', {
        title,
        member_id: selectedId,
        recurrence,
        stars: choreForm.stars,
        reward_text: choreForm.rewardText.trim() || null,
      })
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
      fireCelebration(`Fikk ${savingsGoal.title}!`);
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
      fireCelebration(`Fikk ${reward.title}!`);
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
    <section className={`panel panel-kids ${funMode ? 'panel-kids-fun' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🧒</span> Barn
        </div>
        <button
          type="button"
          className="kids-mode-toggle"
          onClick={() => {
            setFunMode((v) => !v);
            setFunEntered(false);
          }}
        >
          {funMode ? '🔧 Detaljvisning' : '🌟 Gøy-modus'}
        </button>
      </div>

      {funMode ? (
        <div className="panel-body kids-fun-body">
          {!funEntered ? (
            <div className="kids-fun-picker">
              <h2 className="kids-fun-picker-title">Hvem er du? 🌟</h2>
              <div className="kids-fun-picker-grid">
                {kids.map((kid) => {
                  const balance = balances.find((b) => b.id === kid.id);
                  return (
                    <button
                      key={kid.id}
                      type="button"
                      className="kids-fun-picker-card"
                      style={{ '--kid-color': kid.color }}
                      onClick={() => enterFunKid(kid.id)}
                    >
                      <span
                        className="kids-fun-photo"
                        style={kid.photo_url ? { backgroundImage: `url(${kid.photo_url})` } : undefined}
                      >
                        {!kid.photo_url && (kid.avatar || '🧒')}
                      </span>
                      <span className="kids-fun-picker-name">{kid.name}</span>
                      {balance && <span className="kids-fun-picker-stars">⭐ {balance.stars_balance}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            selectedKid && (
              <div className="kids-fun-detail" style={{ '--kid-color': selectedKid.color }}>
                <div className="kids-fun-detail-top">
                  <button type="button" className="kids-fun-back" onClick={() => setFunEntered(false)}>
                    ⬅ Bytt barn
                  </button>
                  <button
                    type="button"
                    className="kids-fun-photo-btn"
                    onClick={() => speak(`Hei, ${selectedKid.name}!`)}
                  >
                    <span
                      className="kids-fun-photo kids-fun-photo-lg"
                      style={selectedKid.photo_url ? { backgroundImage: `url(${selectedKid.photo_url})` } : undefined}
                    >
                      {!selectedKid.photo_url && (selectedKid.avatar || '🧒')}
                    </span>
                  </button>
                  <div className="kids-fun-name">{selectedKid.name}</div>
                  {selectedBalance && <div className="kids-fun-balance">⭐ {selectedBalance.stars_balance} stjerner</div>}
                </div>

                <div className="kids-fun-task-grid">
                  {funTasks.length === 0 && <div className="empty-hint">Ingen oppgaver i dag. Fri dag! 🎉</div>}
                  {funTasks.map((task) => (
                    <div key={task.id} className={`kids-fun-task-card ${task.done ? 'kids-fun-task-card-done' : ''}`}>
                      <button type="button" className="kids-fun-task-main" onClick={() => !task.done && readTask(task)}>
                        {task.title}
                      </button>
                      <button
                        type="button"
                        className="kids-fun-task-star-btn"
                        onClick={() => completeFunTask(task)}
                        aria-label={task.done ? 'Merk som ikke ferdig' : 'Merk som ferdig'}
                      >
                        {task.done ? '✔️' : '⭐'.repeat(task.stars)}
                      </button>
                    </div>
                  ))}
                </div>

                {rewards.length > 0 && (
                  <div className="kids-fun-rewards-row">
                    {rewards.map((r) => {
                      const affordable = selectedBalance && selectedBalance.stars_balance >= r.star_cost;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`kids-fun-reward-chip ${affordable ? 'kids-fun-reward-chip-unlocked' : ''}`}
                          onClick={() =>
                            speak(
                              affordable
                                ? `Du har nok stjerner til å få ${r.title}! Spør en voksen.`
                                : `Du trenger ${r.star_cost - (selectedBalance?.stars_balance ?? 0)} flere stjerner for å få ${r.title}.`
                            )
                          }
                        >
                          <span>{r.image_url ? <img src={r.image_url} alt="" /> : '🎁'}</span>
                          <span>{r.title}</span>
                          <span className="kids-fun-reward-cost">{r.star_cost}⭐</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          )}

          {celebration && (
            <div className={`kids-celebration ${celebration.bonus ? 'kids-celebration-bonus' : ''}`}>
              <div className="kids-celebration-emoji">{celebration.bonus ? '🏆' : '🎉'}</div>
              <div className="kids-celebration-text">{celebration.text}</div>
            </div>
          )}
        </div>
      ) : (
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

          {selectedId && <DailyRoutines key={selectedId} memberId={selectedId} />}
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
                <input
                  type="text"
                  placeholder="Belønning som leses opp i gøy-modus (valgfritt)…"
                  value={choreForm.rewardText}
                  onChange={(e) => setChoreForm((f) => ({ ...f, rewardText: e.target.value }))}
                />
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

          {celebration && (
            <div className="kids-celebration">
              <div className="kids-celebration-emoji">🎉</div>
              <div className="kids-celebration-text">{celebration.text}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
