import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import PackingChecklist from '../Calendar/PackingChecklist';
import CalendarEventModal from '../Calendar/CalendarEventModal';

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function TodayAgenda() {
  const { openPanel } = usePanelNavigation();
  const { members } = useFamilyMembers();
  const [now, setNow] = useState(() => new Date());
  const [updated, setUpdated] = useState(null);
  const [connections, setConnections] = useState([]);
  const [syncError, setSyncError] = useState(false);
  useEffect(() => {
    let previous = dateKey(new Date());
    const timer = setInterval(() => { const current = new Date(); setNow(current); if (dateKey(current) !== previous) { setSelected(value => dateKey(value) === previous ? current : value); previous = dateKey(current); } }, 30000);
    return () => clearInterval(timer);
  }, []);
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
  end.setDate(end.getDate() + 8);
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
        if (active && id === requestId) { setEvents(data); setError(''); setUpdated(new Date()); }
      } catch {
        if (active && id === requestId) setError('Kunne ikke hente kalenderen.');
      } finally {
        if (active && id === requestId) setLoading(false);
      }
    }
    load();
    api.get('/calendar/sync-status').then(data => { if (active) { setConnections(data); setSyncError(false); } }).catch(() => { if (active) setSyncError(true); });
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
  const today = dateKey(selected) === dateKey(now);
  const past = today ? dayEvents.filter(event => !event.all_day && new Date(event.end_at) <= now) : [];
  const upcoming = dayEvents.filter(event => !past.includes(event));
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  const afterTomorrow = new Date(tomorrow); afterTomorrow.setDate(afterTomorrow.getDate() + 1);
  const tomorrowEvents = events.filter(event => new Date(event.start_at) < afterTomorrow && new Date(event.end_at) > tomorrow);
  const person = id => members.find(member => member.id === Number(id))?.name || 'Ikke avklart';
  function renderEvent(event) {
    return <button className="agenda-event" key={`${event.id}:${event.start_at}`} onClick={() => setModal({ event })}>
      <span className="agenda-time">{event.all_day ? 'Hele dagen' : new Date(event.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="agenda-details"><strong>{event.title}</strong>
        {event.location && <span className="agenda-location">{event.location}</span>}
        {event.member_name && <span className="agenda-member" style={{ borderLeftColor: event.member_color || 'var(--accent)' }}>{event.member_name}</span>}
        {(event.member_id || event.responsible_id || event.driver_id || event.pickup_id) && <span className="agenda-logistics">Ansvar: {person(event.responsible_id)} · Kjører: {person(event.driver_id)} · Henter: {person(event.pickup_id)}</span>}
        {event.bring_list && <span className="agenda-logistics">Ta med: {event.bring_list.split('\n').filter(Boolean).join(', ')}</span>}
      </span>
    </button>;
  }

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
          ) : <>
            {upcoming.length === 0 ? <p className="empty-hint">{past.length ? 'Ingen flere avtaler i dag.' : 'Ingen avtaler denne dagen.'}</p> : upcoming.map(renderEvent)}
            {past.length > 0 && <details className="agenda-past"><summary>Tidligere i dag ({past.length})</summary>{past.map(renderEvent)}</details>}
          </>}
        </div>
        {updated && <p className="agenda-updated">Hentet fra hubben kl. {updated.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</p>}
        {(connections.length > 0 || syncError) && <details className="calendar-sync-details"><summary>Tilkoblede kalendere · synkroniseringsstatus</summary>
          {syncError ? <p>Kunne ikke hente status.</p> : connections.map(connection => <p key={connection.id}>{connection.member_name} · {connection.provider}: {connection.last_synced_at ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(connection.last_synced_at) ? connection.last_synced_at : connection.last_synced_at.replace(' ', 'T') + 'Z').toLocaleString('nb-NO') : 'Aldri synkronisert'}</p>)}
          <p>Hent nye avtaler under Innstillinger → Kalendere.</p>
        </details>}
        {today && now.getHours() >= 18 && !loading && !error && <section className="tomorrow-preparation"><h3>Husk til i morgen</h3>
          {tomorrowEvents.length === 0 ? <p>Ingen avtaler registrert i morgen.</p> : tomorrowEvents.map(event => <div key={`${event.id}:${event.start_at}`}><p><strong>{event.title}</strong> · {event.all_day ? 'Hele dagen' : new Date(event.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</p><p>Kjører: {person(event.driver_id)} · Henter: {person(event.pickup_id)}</p>{event.bring_list && <PackingChecklist event={event} date={tomorrow.toLocaleDateString('sv-SE')} />}</div>)}
        </section>}
        <button className="agenda-add" onClick={() => setModal({ defaultDate: start })}>+ Legg til avtale</button>
      </div>
      {modal && <CalendarEventModal {...modal} onClose={() => setModal(null)} onSaved={() => setRevision(n => n + 1)} />}
    </section>
  );
}
