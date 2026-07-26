import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
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

export default function ChoresPanel() {
  const [chores, setChores] = useState([]);
  const [stars, setStars] = useState([]);

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

  return (
    <section className="panel panel-chores">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">✅</span> Gjøremål
        </div>
      </div>
      <div className="panel-body">
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

        {chores.length === 0 && <div className="empty-hint">Ingen gjøremål registrert</div>}

        <ul className="chore-list">
          {chores.map((chore) => (
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
              <span className="chore-stars">
                {'⭐'.repeat(chore.stars)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
