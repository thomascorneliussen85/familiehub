import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './ChoresPanel.css';

const RECURRENCE_LABELS = {
  once: 'Engangs',
  daily: 'Hver dag',
  'weekly:mon': 'Hver mandag',
  'weekly:tue': 'Hver tirsdag',
  'weekly:wed': 'Hver onsdag',
  'weekly:thu': 'Hver torsdag',
  'weekly:fri': 'Hver fredag',
  'weekly:sat': 'Hver lørdag',
  'weekly:sun': 'Hver søndag',
};

const WEEKDAYS = [
  ['mon', 'Man'],
  ['tue', 'Tir'],
  ['wed', 'Ons'],
  ['thu', 'Tor'],
  ['fri', 'Fre'],
  ['sat', 'Lør'],
  ['sun', 'Søn'],
];

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const emptyForm = {
  title: '',
  memberId: '',
  type: 'anytime', // 'date' | 'weekly' | 'anytime'
  date: toDateInputValue(new Date()),
  weekday: 'mon',
  stars: 1,
};

export default function ChoresPanel() {
  const { members } = useFamilyMembers();
  const [chores, setChores] = useState([]);
  const [stars, setStars] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function loadAll() {
    api.get('/chores').then(setChores).catch(() => {});
    api.get('/chores/stars').then(setStars).catch(() => {});
  }

  useEffect(() => {
    loadAll();
    socket.on('chores:update', loadAll);
    return () => socket.off('chores:update', loadAll);
  }, []);

  async function toggle(id) {
    await api.post(`/chores/${id}/toggle`).catch(() => {});
  }

  async function remove(id, e) {
    e.stopPropagation();
    await api.delete(`/chores/${id}`).catch(() => {});
  }

  function openAdd() {
    setForm(emptyForm);
    setShowAdd(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const recurrence = form.type === 'weekly' ? `weekly:${form.weekday}` : 'once';
    const due_date = form.type === 'date' ? form.date : null;
    await api
      .post('/chores', {
        title,
        member_id: form.memberId || null,
        recurrence,
        due_date,
        stars: form.stars,
      })
      .catch(() => {});
    setShowAdd(false);
  }

  const activeChores = chores.filter((c) => !c.done);
  const doneChores = chores.filter((c) => c.done);

  function renderChoreItem(chore) {
    return (
      <li
        key={chore.id}
        className={`chore-item ${chore.done ? 'chore-item-done' : ''}`}
        onClick={() => toggle(chore.id)}
      >
        <span className="chore-checkbox" style={{ borderColor: chore.member_color }}>
          {chore.done ? '✔' : ''}
        </span>
        <div className="chore-info">
          <span className="chore-title">{chore.title}</span>
          <span className="chore-meta">
            {chore.member_avatar} {chore.member_name} · {RECURRENCE_LABELS[chore.recurrence] || chore.recurrence}
            {chore.recurrence === 'once' && chore.due_date &&
              ` · frist ${new Date(chore.due_date).toLocaleDateString('nb-NO')}`}
          </span>
        </div>
        <span className="chore-stars">{'⭐'.repeat(chore.stars)}</span>
        <button className="chore-remove" onClick={(e) => remove(chore.id, e)} aria-label="Slett gjøremål">
          🗑️
        </button>
      </li>
    );
  }

  return (
    <section className="panel panel-chores">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">✅</span> Gjøremål
        </div>
        <button
          className="btn btn-icon"
          onClick={() => (showAdd ? setShowAdd(false) : openAdd())}
          aria-label="Legg til gjøremål"
        >
          {showAdd ? '✕' : '+'}
        </button>
      </div>
      <div className="panel-body">
        {showAdd && (
          <form className="chore-add-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Tittel…"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
            <select
              value={form.memberId}
              onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
            >
              <option value="">Ingen</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.avatar} {m.name}
                </option>
              ))}
            </select>

            <div className="chore-type-row">
              <button
                type="button"
                className={`chore-type-btn ${form.type === 'anytime' ? 'chore-type-btn-active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, type: 'anytime' }))}
              >
                ✅ Bare gjør
              </button>
              <button
                type="button"
                className={`chore-type-btn ${form.type === 'date' ? 'chore-type-btn-active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, type: 'date' }))}
              >
                📅 Bestemt dag
              </button>
              <button
                type="button"
                className={`chore-type-btn ${form.type === 'weekly' ? 'chore-type-btn-active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, type: 'weekly' }))}
              >
                🔁 Ukentlig
              </button>
            </div>

            {form.type === 'date' && (
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            )}
            {form.type === 'weekly' && (
              <select
                value={form.weekday}
                onChange={(e) => setForm((f) => ({ ...f, weekday: e.target.value }))}
              >
                {WEEKDAYS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            )}

            <div className="chore-stars-row">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chore-star-btn ${form.stars === n ? 'chore-star-btn-active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, stars: n }))}
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

        {stars.length > 0 && (
          <div className="stars-row">
            {stars.map((m) => (
              <div key={m.id} className="star-chip" style={{ borderColor: m.color }}>
                <span>{m.avatar}</span>
                <span className="star-chip-name">{m.name}</span>
                <span className="star-chip-stars">⭐ {m.stars_this_week}</span>
              </div>
            ))}
          </div>
        )}

        {activeChores.length === 0 && doneChores.length === 0 && (
          <div className="empty-hint">Ingen gjøremål registrert</div>
        )}
        {activeChores.length === 0 && doneChores.length > 0 && (
          <div className="empty-hint">🎉 Alle gjøremål er gjort!</div>
        )}

        <ul className="chore-list">{activeChores.map(renderChoreItem)}</ul>

        {doneChores.length > 0 && (
          <div className="chore-done-section">
            <button
              type="button"
              className="chore-done-toggle"
              onClick={() => setShowDone((v) => !v)}
            >
              <span>Fullført ({doneChores.length})</span>
              <span className={`chore-done-caret ${showDone ? 'chore-done-caret-open' : ''}`}>▾</span>
            </button>
            {showDone && <ul className="chore-list chore-list-done">{doneChores.map(renderChoreItem)}</ul>}
          </div>
        )}
      </div>
    </section>
  );
}
