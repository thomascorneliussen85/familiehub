import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './CalendarPanel.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function startOfWeek(date) {
  const d = new Date(date);
  const idx = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idx);
  return d;
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function CalendarPanel() {
  const [events, setEvents] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => toDateInputValue(new Date()));
  const [newTime, setNewTime] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart]
  );

  function loadEvents() {
    const from = weekStart.toISOString();
    const to = new Date(new Date(weekStart).setDate(weekStart.getDate() + 7)).toISOString();
    api.get(`/calendar/events?from=${from}&to=${to}`).then(setEvents).catch(() => {});
  }

  useEffect(() => {
    loadEvents();
    socket.on('calendar:update', loadEvents);
    return () => socket.off('calendar:update', loadEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddSubmit(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !newDate) return;
    const [y, m, d] = newDate.split('-').map(Number);
    let start;
    let end;
    let allDay;
    if (newTime) {
      const [hh, mm] = newTime.split(':').map(Number);
      start = new Date(y, m - 1, d, hh, mm, 0, 0);
      end = new Date(start);
      end.setHours(end.getHours() + 1);
      allDay = false;
    } else {
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      allDay = true;
    }
    await api
      .post('/calendar/events', {
        title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        all_day: allDay,
        recurrence: repeatWeekly ? 'weekly' : 'once',
      })
      .catch(() => {});
    setNewTitle('');
    setNewTime('');
    setRepeatWeekly(false);
    setShowAddForm(false);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section className="panel panel-calendar">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">📅</span> Kalender – denne uken
        </div>
        <button
          className="btn btn-icon"
          onClick={() => setShowAddForm((v) => !v)}
          aria-label="Legg til avtale"
        >
          {showAddForm ? '✕' : '+'}
        </button>
      </div>
      <div className="panel-body calendar-body">
        {showAddForm && (
          <form className="calendar-add-form" onSubmit={handleAddSubmit}>
            <input
              type="text"
              placeholder="Tittel…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
            <label className="calendar-repeat-toggle">
              <input
                type="checkbox"
                checked={repeatWeekly}
                onChange={(e) => setRepeatWeekly(e.target.checked)}
              />
              🔁 Gjenta hver uke
            </label>
            <button type="submit" className="btn btn-accent">
              Legg til
            </button>
          </form>
        )}
        <div className="calendar-grid">
          {days.map((day, i) => {
            const dayEvents = events.filter((e) => {
              const start = new Date(e.start_at);
              return (
                start.getFullYear() === day.getFullYear() &&
                start.getMonth() === day.getMonth() &&
                start.getDate() === day.getDate()
              );
            });
            const isToday = day.getTime() === today.getTime();
            return (
              <div key={i} className={`calendar-day ${isToday ? 'calendar-day-today' : ''}`}>
                <div className="calendar-day-header">
                  <span>{DAY_LABELS[i]}</span>
                  <span className="calendar-day-num">{day.getDate()}</span>
                </div>
                <div className="calendar-day-events">
                  {dayEvents.length === 0 && <div className="calendar-empty">–</div>}
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className="calendar-event"
                      style={{ borderLeftColor: e.member_color || '#7c9cff' }}
                      title={e.location || ''}
                    >
                      <span className="calendar-event-time">
                        {e.all_day
                          ? 'Hele dagen'
                          : new Date(e.start_at).toLocaleTimeString('nb-NO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                      </span>
                      <span className="calendar-event-title">
                        {e.recurrence === 'weekly' && '🔁 '}
                        {e.title}
                      </span>
                      {e.member_name && (
                        <span className="calendar-event-member">{e.member_name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
