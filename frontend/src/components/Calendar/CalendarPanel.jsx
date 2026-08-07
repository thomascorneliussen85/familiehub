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

const emptyForm = { title: '', date: toDateInputValue(new Date()), time: '', repeatWeekly: false };

export default function CalendarPanel() {
  const [events, setEvents] = useState([]);
  // null = skjult, 'add' = nytt skjema, tallet = redigerer avtale med den ID-en
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
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

  function openAdd() {
    setForm(emptyForm);
    setFormMode('add');
  }

  function openEdit(event) {
    const start = new Date(event.start_at);
    setForm({
      title: event.title,
      date: toDateInputValue(start),
      time: event.all_day
        ? ''
        : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      repeatWeekly: event.recurrence === 'weekly',
    });
    setFormMode(event.id);
  }

  function closeForm() {
    setFormMode(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title || !form.date) return;
    const [y, m, d] = form.date.split('-').map(Number);
    let start;
    let end;
    let allDay;
    if (form.time) {
      const [hh, mm] = form.time.split(':').map(Number);
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
    const payload = {
      title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: allDay,
      recurrence: form.repeatWeekly ? 'weekly' : 'once',
    };
    if (typeof formMode === 'number') {
      await api.put(`/calendar/events/${formMode}`, payload).catch(() => {});
    } else {
      await api.post('/calendar/events', payload).catch(() => {});
    }
    closeForm();
  }

  async function handleDelete() {
    if (typeof formMode !== 'number') return;
    await api.delete(`/calendar/events/${formMode}`).catch(() => {});
    closeForm();
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
          onClick={() => (formMode === 'add' ? closeForm() : openAdd())}
          aria-label="Legg til avtale"
        >
          {formMode === 'add' ? '✕' : '+'}
        </button>
      </div>
      <div className="panel-body calendar-body">
        {formMode !== null && (
          <form className="calendar-add-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Tittel…"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            />
            <label className="calendar-repeat-toggle">
              <input
                type="checkbox"
                checked={form.repeatWeekly}
                onChange={(e) => setForm((f) => ({ ...f, repeatWeekly: e.target.checked }))}
              />
              🔁 Gjenta hver uke
            </label>
            <button type="submit" className="btn btn-accent">
              {typeof formMode === 'number' ? 'Lagre' : 'Legg til'}
            </button>
            {typeof formMode === 'number' && (
              <button type="button" className="btn" onClick={handleDelete}>
                🗑️ Slett
              </button>
            )}
            <button type="button" className="btn" onClick={closeForm}>
              Avbryt
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
                      className="calendar-event calendar-event-clickable"
                      style={{ borderLeftColor: e.member_color || '#7c9cff' }}
                      title={e.location || ''}
                      onClick={() => openEdit(e)}
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
