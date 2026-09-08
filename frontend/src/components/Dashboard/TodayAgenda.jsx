import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import CalendarEventModal from '../Calendar/CalendarEventModal';

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function TodayAgenda() {
  const { openPanel } = usePanelNavigation();
  const [selected, setSelected] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const monday = new Date(selected);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 7);
  const from = monday.toISOString();
  const to = end.toISOString();

  useEffect(() => {
    let active = true;
    let requestId = 0;
    async function load() {
      const id = ++requestId;
      setLoading(true);
      try {
        const data = await api.get(`/calendar/events?from=${from}&to=${to}`);
        if (active && id === requestId) { setEvents(data); setError(''); }
      } catch {
        if (active && id === requestId) setError('Kunne ikke hente kalenderen.');
      } finally {
        if (active && id === requestId) setLoading(false);
      }
    }
    load();
    socket.on('calendar:update', load);
    socket.on('connect', load);
    return () => {
      active = false;
      socket.off('calendar:update', load);
      socket.off('connect', load);
    };
  }, [from, to, revision]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    return day;
  });
  const start = new Date(selected);
  start.setHours(0, 0, 0, 0);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  const dayEvents = events.filter(event => {
    const eventStart = new Date(event.start_at);
    const eventEnd = event.end_at ? new Date(event.end_at) : eventStart;
    return eventStart < next && (eventEnd > start || dateKey(eventStart) === dateKey(start));
  }).sort((a, b) => Number(b.all_day) - Number(a.all_day) || new Date(a.start_at) - new Date(b.start_at));
  const today = dateKey(selected) === dateKey(new Date());

  function stepWeek(amount) {
    setSelected(current => {
      const day = new Date(current);
      day.setDate(day.getDate() + amount * 7);
      return day;
    });
  }

  return (
    <section className="panel today-agenda" aria-label="Dagens oversikt">
      <div className="panel-header">
        <h2 className="panel-title">{today ? 'Dagens oversikt' : selected.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
        <button className="agenda-link" onClick={() => openPanel('calendar')}>Hele kalenderen →</button>
      </div>
      <div className="panel-body">
        <div className="agenda-week-nav">
          <button aria-label="Forrige uke" onClick={() => stepWeek(-1)}>‹</button>
          <button onClick={() => setSelected(new Date())}>I dag</button>
          <button aria-label="Neste uke" onClick={() => stepWeek(1)}>›</button>
        </div>
        <div className="agenda-days" aria-label="Velg dag">
          {days.map(day => (
            <button key={dateKey(day)} aria-pressed={dateKey(day) === dateKey(selected)} onClick={() => setSelected(day)}>
              <span>{day.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '')}</span>
              <strong>{day.getDate()}</strong>
            </button>
          ))}
        </div>
        <div className="agenda-events" aria-live="polite" aria-busy={loading}>
          {loading ? <p className="empty-hint">Henter avtaler…</p> : error ? (
            <div role="alert"><p>{error}</p><button className="agenda-link" onClick={() => setRevision(n => n + 1)}>Prøv igjen</button></div>
          ) : dayEvents.length === 0 ? <p className="empty-hint">Ingen avtaler denne dagen.</p> : dayEvents.map(event => (
            <button className="agenda-event" key={event.id} onClick={() => setModal({ event })}>
              <span className="agenda-time">{event.all_day ? 'Hele dagen' : new Date(event.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="agenda-details">
                <strong>{event.title}</strong>
                {event.location && <span className="agenda-location">{event.location}</span>}
                {event.member_name && <span className="agenda-member" style={{ borderLeftColor: event.member_color || 'var(--accent)' }}>{event.member_name}</span>}
              </span>
            </button>
          ))}
        </div>
        <button className="agenda-add" onClick={() => setModal({ defaultDate: start })}>+ Legg til avtale</button>
      </div>
      {modal && <CalendarEventModal {...modal} onClose={() => setModal(null)} onSaved={() => setRevision(n => n + 1)} />}
    </section>
  );
}
