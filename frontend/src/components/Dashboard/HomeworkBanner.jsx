import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './HomeworkBanner.css';

export default function HomeworkBanner() {
  const [items, setItems] = useState([]);

  function load() {
    api.get('/chores/homework-due-soon').then(setItems).catch(() => {});
  }

  useEffect(() => {
    load();
    socket.on('chores:update', load);
    return () => socket.off('chores:update', load);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="homework-banner">
      <span className="homework-banner-icon">📚</span>
      <div className="homework-banner-list">
        {items.map((item) => (
          <span key={item.id} className="homework-banner-item">
            <strong>{item.member_avatar} {item.member_name || 'Noen'}</strong> har {item.title}{' '}
            til {item.due_today ? 'i dag' : 'i morgen'}
          </span>
        ))}
      </div>
    </div>
  );
}
