import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './NextEventBanner.css';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

export default function NextEventBanner() {
  const [events, setEvents] = useState([]);
  const [now, setNow] = useState(new Date());

  function loadEvents() {
    const today = startOfDay(new Date());
    const from = today.toISOString();
    const to = new Date(new Date(today).setDate(today.getDate() + 2)).toISOString();
    api.get(`/calendar/events?from=${from}&to=${to}`).then(setEvents).catch(() => {});
  }

  useEffect(() => {
    loadEvents();
    socket.on('calendar:update', loadEvents);
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => {
      socket.off('calendar:update', loadEvents);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const upcomingToday = events
    .filter((e) => !e.all_day && new Date(e.start_at) > now && new Date(e.start_at) < tomorrow)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];

  const firstTomorrow = events
    .filter((e) => !e.all_day && new Date(e.start_at) >= tomorrow)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];

  const target = upcomingToday || firstTomorrow;

  if (!target) {
    return (
      <div className="next-event-banner next-event-banner-empty">
        <span className="next-event-label">I dag</span>
        <span className="next-event-empty-text">Ingen flere avtaler i dag 🎉</span>
      </div>
    );
  }

  const start = new Date(target.start_at);
  const diff = start - now;
  const isTomorrow = !upcomingToday;

  return (
    <div className="next-event-banner">
      <span className="next-event-label">{isTomorrow ? 'I morgen først' : 'Neste'}</span>
      <span className="next-event-countdown">{formatCountdown(diff)}</span>
      <div className="next-event-info">
        <span className="next-event-title">{target.title}</span>
        <span className="next-event-meta">
          {start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
          {target.member_name ? ` · ${target.member_name}` : ''}
          {target.location ? ` · ${target.location}` : ''}
        </span>
      </div>
    </div>
  );
}
