import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { RECURRENCE_OPTIONS } from '../../lib/recurrence';
import './AdminPanel.css';

const KID_COLORS = ['#ffd166', '#ff8fb1', '#7c9cff', '#6ee7a0', '#ff9f6b', '#c792ea'];

function randomInt(max) {
  return Math.floor(Math.random() * max) + 1;
}

function makeChallenge() {
  const a = randomInt(8);
  const b = randomInt(8);
  const correct = a + b;
  const choices = new Set([correct]);
  while (choices.size < 3) {
    const distractor = correct + (randomInt(5) * (Math.random() < 0.5 ? -1 : 1));
    if (distractor > 0) choices.add(distractor);
  }
  return { a, b, correct, choices: [...choices].sort(() => Math.random() - 0.5) };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AdminGate({ onUnlock, onCancel }) {
  const [challenge, setChallenge] = useState(makeChallenge);
  const [shake, setShake] = useState(false);

  function answer(value) {
    if (value === challenge.correct) {
      onUnlock();
    } else {
      setShake(true);
      setChallenge(makeChallenge());
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div className="admin-overlay">
      <div className={`admin-gate-card ${shake ? 'admin-gate-shake' : ''}`}>
        <div className="admin-gate-lock">🔒</div>
        <h2>Voksen-sjekk</h2>
        <p>Hva er {challenge.a} + {challenge.b}?</p>
        <div className="admin-gate-choices">
          {challenge.choices.map((choice) => (
            <button key={choice} type="button" className="btn admin-gate-choice" onClick={() => answer(choice)}>
              {choice}
            </button>
          ))}
        </div>
        <button type="button" className="admin-gate-cancel" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel({ onClose }) {
  const [unlocked, setUnlocked] = useState(false);
  const [members, setMembers] = useState([]);
  const [chores, setChores] = useState([]);
  const [rewards, setRewards] = useState([]);

  const [newChildName, setNewChildName] = useState('');
  const [newChildAvatar, setNewChildAvatar] = useState('🧒');
  const [newChildColor, setNewChildColor] = useState(KID_COLORS[0]);

  const [taskMemberId, setTaskMemberId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRecurrence, setTaskRecurrence] = useState('daily');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskStars, setTaskStars] = useState(1);
  const [taskReward, setTaskReward] = useState('');

  const [rewardMemberId, setRewardMemberId] = useState('');
  const [rewardStars, setRewardStars] = useState(5);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardEmoji, setRewardEmoji] = useState('🎁');

  const kids = members.filter((m) => m.role === 'barn');

  function loadAll() {
    api.get('/family-members').then(setMembers).catch(() => {});
    api.get('/chores').then(setChores).catch(() => {});
    api.get('/bonus-rewards').then(setRewards).catch(() => {});
  }

  useEffect(() => {
    if (unlocked) loadAll();
  }, [unlocked]);

  useEffect(() => {
    if (kids.length && !taskMemberId) setTaskMemberId(String(kids[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  async function addChild(e) {
    e.preventDefault();
    if (!newChildName.trim()) return;
    await api.post('/family-members', {
      name: newChildName.trim(),
      role: 'barn',
      color: newChildColor,
      avatar: newChildAvatar || '🧒',
      sort_order: members.length,
    });
    setNewChildName('');
    setNewChildAvatar('🧒');
    loadAll();
  }

  async function updateChild(id, patch) {
    await api.patch(`/family-members/${id}`, patch).catch(() => {});
    loadAll();
  }

  async function uploadPhoto(id, file) {
    if (!file) return;
    const imageDataUrl = await fileToDataUrl(file);
    await api.post(`/family-members/${id}/photo`, { imageDataUrl }).catch((err) => {
      alert(err.message || 'Kunne ikke laste opp bilde');
    });
    loadAll();
  }

  async function deleteChild(id) {
    if (!confirm('Slette dette barnet og alle oppgavene knyttet til det?')) return;
    await api.delete(`/family-members/${id}`).catch(() => {});
    loadAll();
  }

  async function addTask(e) {
    e.preventDefault();
    if (!taskTitle.trim() || !taskMemberId) return;
    await api.post('/chores', {
      member_id: Number(taskMemberId),
      title: taskTitle.trim(),
      recurrence: taskRecurrence,
      due_date: taskRecurrence === 'once' ? taskDueDate || null : null,
      stars: Number(taskStars) || 1,
      reward_text: taskReward.trim() || null,
    });
    setTaskTitle('');
    setTaskReward('');
    loadAll();
  }

  async function patchTask(id, patch) {
    await api.patch(`/chores/${id}`, patch).catch(() => {});
    loadAll();
  }

  async function deleteTask(id) {
    await api.delete(`/chores/${id}`).catch(() => {});
    loadAll();
  }

  async function addReward(e) {
    e.preventDefault();
    if (!rewardTitle.trim() || !rewardStars) return;
    await api.post('/bonus-rewards', {
      member_id: rewardMemberId ? Number(rewardMemberId) : null,
      stars_required: Number(rewardStars),
      title: rewardTitle.trim(),
      emoji: rewardEmoji || '🎁',
    });
    setRewardTitle('');
    loadAll();
  }

  async function deleteReward(id) {
    await api.delete(`/bonus-rewards/${id}`).catch(() => {});
    loadAll();
  }

  if (!unlocked) {
    return <AdminGate onUnlock={() => setUnlocked(true)} onCancel={onClose} />;
  }

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h2>Voksen-innstillinger</h2>
          <button type="button" className="admin-close-btn" onClick={onClose}>
            ✕ Lukk
          </button>
        </div>

        <div className="admin-panel-body">
          <section className="admin-section">
            <h3>👧👦 Barn</h3>
            <div className="admin-child-list">
              {kids.map((kid) => (
                <div key={kid.id} className="admin-child-row">
                  <label className="admin-photo-upload" style={{ borderColor: kid.color }}>
                    <span
                      className="admin-photo-preview"
                      style={kid.photo_url ? { backgroundImage: `url(${kid.photo_url})` } : undefined}
                    >
                      {!kid.photo_url && (kid.avatar || '🧒')}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => uploadPhoto(kid.id, e.target.files?.[0])}
                    />
                    <span className="admin-photo-upload-label">Bytt bilde</span>
                  </label>
                  <input
                    type="text"
                    className="admin-input"
                    defaultValue={kid.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== kid.name && updateChild(kid.id, { name: e.target.value.trim() })}
                  />
                  <input
                    type="text"
                    className="admin-input admin-input-emoji"
                    defaultValue={kid.avatar || ''}
                    maxLength={2}
                    onBlur={(e) => updateChild(kid.id, { avatar: e.target.value })}
                  />
                  <input
                    type="color"
                    className="admin-color-input"
                    value={kid.color}
                    onChange={(e) => updateChild(kid.id, { color: e.target.value })}
                  />
                  <button type="button" className="admin-delete-btn" onClick={() => deleteChild(kid.id)}>
                    🗑️
                  </button>
                </div>
              ))}
            </div>
            <form className="admin-add-row" onSubmit={addChild}>
              <input
                type="text"
                className="admin-input"
                placeholder="Nytt barn sitt navn"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
              />
              <input
                type="text"
                className="admin-input admin-input-emoji"
                value={newChildAvatar}
                maxLength={2}
                onChange={(e) => setNewChildAvatar(e.target.value)}
              />
              <input
                type="color"
                className="admin-color-input"
                value={newChildColor}
                onChange={(e) => setNewChildColor(e.target.value)}
              />
              <button type="submit" className="btn btn-accent">
                + Legg til barn
              </button>
            </form>
          </section>

          <section className="admin-section">
            <h3>✅ Oppgaver</h3>
            <div className="admin-task-list">
              {chores
                .filter((c) => kids.some((k) => k.id === c.member_id))
                .map((task) => (
                  <div key={task.id} className="admin-task-row">
                    <span className="admin-task-member">{task.member_avatar}</span>
                    <input
                      type="text"
                      className="admin-input"
                      defaultValue={task.title}
                      onBlur={(e) => e.target.value.trim() && patchTask(task.id, { title: e.target.value.trim() })}
                    />
                    <select
                      className="admin-input"
                      defaultValue={task.recurrence}
                      onChange={(e) => patchTask(task.id, { recurrence: e.target.value })}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      className="admin-input admin-input-narrow"
                      defaultValue={task.stars}
                      onBlur={(e) => patchTask(task.id, { stars: Number(e.target.value) || 1 })}
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Belønning (valgfritt)"
                      defaultValue={task.reward_text || ''}
                      onBlur={(e) => patchTask(task.id, { reward_text: e.target.value || null })}
                    />
                    <button type="button" className="admin-delete-btn" onClick={() => deleteTask(task.id)}>
                      🗑️
                    </button>
                  </div>
                ))}
              {chores.filter((c) => kids.some((k) => k.id === c.member_id)).length === 0 && (
                <p className="admin-empty-hint">Ingen oppgaver for barna ennå.</p>
              )}
            </div>
            <form className="admin-add-row" onSubmit={addTask}>
              <select className="admin-input" value={taskMemberId} onChange={(e) => setTaskMemberId(e.target.value)}>
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.avatar} {k.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="admin-input"
                placeholder="Oppgave, f.eks. Rydde rommet"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <select className="admin-input" value={taskRecurrence} onChange={(e) => setTaskRecurrence(e.target.value)}>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {taskRecurrence === 'once' && (
                <input
                  type="date"
                  className="admin-input"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                />
              )}
              <input
                type="number"
                min="1"
                max="5"
                className="admin-input admin-input-narrow"
                value={taskStars}
                onChange={(e) => setTaskStars(e.target.value)}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="Belønning (valgfritt)"
                value={taskReward}
                onChange={(e) => setTaskReward(e.target.value)}
              />
              <button type="submit" className="btn btn-accent">
                + Legg til oppgave
              </button>
            </form>
          </section>

          <section className="admin-section">
            <h3>🎁 Bonusbelønninger</h3>
            <p className="admin-section-hint">
              Ekstra belønning når barnet samler nok stjerner samme dag.
            </p>
            <div className="admin-reward-list">
              {rewards.map((r) => (
                <div key={r.id} className="admin-reward-row">
                  <span className="admin-reward-emoji">{r.emoji}</span>
                  <span className="admin-reward-title">{r.title}</span>
                  <span className="admin-reward-meta">
                    {r.stars_required}⭐ · {r.member_name || 'Alle barn'}
                  </span>
                  <button type="button" className="admin-delete-btn" onClick={() => deleteReward(r.id)}>
                    🗑️
                  </button>
                </div>
              ))}
              {rewards.length === 0 && <p className="admin-empty-hint">Ingen bonusbelønninger ennå.</p>}
            </div>
            <form className="admin-add-row" onSubmit={addReward}>
              <select className="admin-input" value={rewardMemberId} onChange={(e) => setRewardMemberId(e.target.value)}>
                <option value="">Alle barn</option>
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.avatar} {k.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                className="admin-input admin-input-narrow"
                value={rewardStars}
                onChange={(e) => setRewardStars(e.target.value)}
              />
              <input
                type="text"
                className="admin-input admin-input-emoji"
                value={rewardEmoji}
                maxLength={2}
                onChange={(e) => setRewardEmoji(e.target.value)}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="F.eks. Is etter middag"
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
              />
              <button type="submit" className="btn btn-accent">
                + Legg til bonus
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
