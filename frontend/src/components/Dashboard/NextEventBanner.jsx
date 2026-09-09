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
  if (h > 0) return `${h} t ${m} min`;
  return `${m} min`;
}

export default function NextEventBanner() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(new Date());

  function loadEvents() {
    const today = startOfDay(new Date());
    const from = today.toISOString();
    const to = new Date(new Date(today).setDate(today.getDate() + 2)).toISOString();
    api.get(`/calendar/events?from=${from}&to=${to}`).then(data => { setEvents(data); setError(false); }).catch(() => setError(true)).finally(() => setLoading(false));
  }

  useEffect(() => {
    loadEvents();
    socket.on('calendar:update', loadEvents);
    socket.on('connect', loadEvents);
    let day = new Date().toLocaleDateString('sv-SE');
    const id = setInterval(() => { const current = new Date(); setNow(current); if (current.toLocaleDateString('sv-SE') !== day) { day = current.toLocaleDateString('sv-SE'); loadEvents(); } }, 15000);
    return () => {
      socket.off('calendar:update', loadEvents);
      socket.off('connect', loadEvents);
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

  if (loading || error) return <div className="next-event-banner next-event-banner-empty"><span className="next-event-empty-text">{loading ? 'Henter neste avtale…' : 'Kunne ikke hente neste avtale.'}</span>{error && <button className="btn" onClick={loadEvents}>Prøv igjen</button>}</div>;
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
      <div className="next-event-time-block">
        <span className="next-event-start">{start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="next-event-countdown">om {formatCountdown(diff)}</span>
      </div>
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
