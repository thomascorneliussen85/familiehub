import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import ScanCalendarModal from './ScanCalendarModal';
import CalendarEventModal from './CalendarEventModal';
import WeekTimeGrid from './WeekTimeGrid';
import MemberBoard from './MemberBoard';
import MonthGrid from './MonthGrid';
import './CalendarPanel.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function startOfWeek(date) {
  const d = new Date(date);
  const idx = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idx);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const emptyForm = { title: '', date: toDateInputValue(new Date()), time: '', repeatWeekly: false };

function weekLabel(offset, weekStart) {
  if (offset === 0) return 'Kalender – denne uken';
  if (offset === 1) return 'Neste uke';
  if (offset === -1) return 'Forrige uke';
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(weekStart)}–${fmt(end)}`;
}

function dateRangeLabel(start, end) {
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)}–${fmt(end)}`;
}

export default function CalendarPanel({ expanded = false }) {
  const { members } = useFamilyMembers();
  const [events, setEvents] = useState([]);
  // Kompakt visning (dashboard-forsiden) – uendret skjema/tilstand fra før.
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [weekOffset, setWeekOffset] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const scanInputRef = useRef(null);

  // Kun for den utvidede kalenderen (Uke/Tavle/Kalender-visningene).
  const [viewMode, setViewMode] = useState('week');
  const [boardMode, setBoardMode] = useState('day');
  const [monthMode, setMonthMode] = useState('month');
  const [cursorDate, setCursorDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedMemberIds, setSelectedMemberIds] = useState(null);
  const [modalState, setModalState] = useState(null);

  const thisWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekStart = useMemo(() => addDays(thisWeekStart, weekOffset * 7), [thisWeekStart, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const cursorWeekDays = useMemo(() => {
    const s = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursorDate]);

  const activeRange = useMemo(() => {
    if (!expanded || viewMode === 'week') {
      return { from: weekStart, to: addDays(weekStart, 7) };
    }
    if (viewMode === 'board') {
      return boardMode === 'day'
        ? { from: cursorDate, to: addDays(cursorDate, 1) }
        : { from: cursorWeekDays[0], to: addDays(cursorWeekDays[0], 7) };
    }
    if (monthMode === 'day') return { from: cursorDate, to: addDays(cursorDate, 1) };
    if (monthMode === 'week') return { from: cursorWeekDays[0], to: addDays(cursorWeekDays[0], 7) };
    const gridStart = startOfWeek(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1));
    return { from: gridStart, to: addDays(gridStart, 42) };
  }, [expanded, viewMode, boardMode, monthMode, weekStart, cursorDate, cursorWeekDays]);

  useEffect(() => {
    function loadEvents() {
      api
        .get(`/calendar/events?from=${activeRange.from.toISOString()}&to=${activeRange.to.toISOString()}`)
        .then(setEvents)
        .catch(() => {});
    }
    loadEvents();
    socket.on('calendar:update', loadEvents);
    return () => socket.off('calendar:update', loadEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRange.from.getTime(), activeRange.to.getTime()]);

  const filteredEvents = useMemo(
    () => (selectedMemberIds ? events.filter((e) => selectedMemberIds.has(e.member_id)) : events),
    [events, selectedMemberIds]
  );

  function toggleMember(id) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });
  }

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

  async function handleScanFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setScanError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/calendar/scan', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Klarte ikke å lese bildet');
      setScanResults(data.events);
    } catch (err) {
      setScanError(err.message);
      setTimeout(() => setScanError(''), 5000);
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete() {
    if (typeof formMode !== 'number') return;
    await api.delete(`/calendar/events/${formMode}`).catch(() => {});
    closeForm();
  }

  function stepCursor(delta) {
    setCursorDate((d) => {
      if (monthMode === 'month') return new Date(d.getFullYear(), d.getMonth() + delta, 1);
      if (monthMode === 'week') return addDays(d, delta * 7);
      return addDays(d, delta);
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section className="panel panel-calendar">
      <div className="panel-header">
        <div className="panel-title calendar-title">
          <span className="panel-icon">📅</span>
          {!expanded && (
            <>
              <button className="calendar-nav-btn" onClick={() => setWeekOffset((o) => o - 1)} aria-label="Forrige uke">
                ‹
              </button>
              <span className="calendar-title-label">{weekLabel(weekOffset, weekStart)}</span>
              <button className="calendar-nav-btn" onClick={() => setWeekOffset((o) => o + 1)} aria-label="Neste uke">
                ›
              </button>
              {weekOffset !== 0 && (
                <button className="calendar-nav-today" onClick={() => setWeekOffset(0)}>
                  I dag
                </button>
              )}
            </>
          )}
          {expanded && <span className="calendar-title-label">Kalender</span>}
        </div>
        <button
          className="btn btn-icon"
          onClick={() => scanInputRef.current?.click()}
          aria-label="Skann bilde av timeplan"
          title="Ta bilde av en timeplan/oppslag – finner avtaler automatisk"
          disabled={scanning}
        >
          {scanning ? '⏳' : '📷'}
        </button>
        <input type="file" accept="image/*" capture="user" ref={scanInputRef} onChange={handleScanFile} hidden />
        <button
          className="btn btn-icon"
          onClick={() => {
            if (expanded) {
              setModalState({ defaultDate: viewMode === 'week' ? today : cursorDate });
            } else {
              formMode === 'add' ? closeForm() : openAdd();
            }
          }}
          aria-label="Legg til avtale"
        >
          {!expanded && formMode === 'add' ? '✕' : '+'}
        </button>
      </div>
      {scanError && <div className="calendar-scan-error">{scanError}</div>}

      {expanded && (
        <div className="calendar-toolbar">
          <div className="calendar-view-switch">
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>
              Uke
            </button>
            <button className={viewMode === 'board' ? 'active' : ''} onClick={() => setViewMode('board')}>
              Tavle
            </button>
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
              Kalender
            </button>
          </div>
          <div className="calendar-member-filter">
            <button className={!selectedMemberIds ? 'active' : ''} onClick={() => setSelectedMemberIds(null)}>
              Alle
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                className={selectedMemberIds?.has(m.id) ? 'active' : ''}
                style={{ borderColor: m.color }}
                onClick={() => toggleMember(m.id)}
              >
                {m.avatar} {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`panel-body calendar-body ${expanded ? 'calendar-body-expanded' : ''}`}>
        {!expanded && formMode !== null && (
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
            <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
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

        {!expanded && (
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
                            : new Date(e.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="calendar-event-title">
                          {e.recurrence === 'weekly' && '🔁 '}
                          {e.title}
                        </span>
                        {e.member_name && <span className="calendar-event-member">{e.member_name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {expanded && viewMode === 'week' && (
          <>
            <div className="calendar-nav-row">
              <button className="calendar-nav-btn" onClick={() => setWeekOffset((o) => o - 1)} aria-label="Forrige uke">
                ‹
              </button>
              <span className="calendar-nav-label">{weekLabel(weekOffset, weekStart)}</span>
              <button className="calendar-nav-btn" onClick={() => setWeekOffset((o) => o + 1)} aria-label="Neste uke">
                ›
              </button>
              {weekOffset !== 0 && (
                <button className="calendar-nav-today" onClick={() => setWeekOffset(0)}>
                  I dag
                </button>
              )}
            </div>
            <div className="calendar-view-content">
              <WeekTimeGrid
                days={days}
                events={filteredEvents}
                onSlotClick={(d) => setModalState({ defaultDate: d })}
                onEventClick={(e) => setModalState({ event: e })}
              />
            </div>
          </>
        )}

        {expanded && viewMode === 'board' && (
          <>
            <div className="calendar-nav-row">
              <div className="calendar-submode-switch">
                <button className={boardMode === 'day' ? 'active' : ''} onClick={() => setBoardMode('day')}>
                  Dag
                </button>
                <button className={boardMode === 'week' ? 'active' : ''} onClick={() => setBoardMode('week')}>
                  Uke
                </button>
              </div>
              <button
                className="calendar-nav-btn"
                onClick={() => setCursorDate((d) => addDays(d, boardMode === 'day' ? -1 : -7))}
                aria-label="Forrige"
              >
                ‹
              </button>
              <span className="calendar-nav-label">
                {boardMode === 'day'
                  ? cursorDate.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
                  : dateRangeLabel(cursorWeekDays[0], cursorWeekDays[6])}
              </span>
              <button
                className="calendar-nav-btn"
                onClick={() => setCursorDate((d) => addDays(d, boardMode === 'day' ? 1 : 7))}
                aria-label="Neste"
              >
                ›
              </button>
              <button className="calendar-nav-today" onClick={() => setCursorDate(today)}>
                I dag
              </button>
            </div>
            <div className="calendar-view-content">
              <MemberBoard
                members={members}
                events={filteredEvents}
                boardMode={boardMode}
                days={boardMode === 'day' ? [cursorDate] : cursorWeekDays}
                onEventClick={(e) => setModalState({ event: e })}
                onAddClick={(memberId, date) => setModalState({ defaultDate: date, defaultMemberId: memberId })}
              />
            </div>
          </>
        )}

        {expanded && viewMode === 'month' && (
          <>
            <div className="calendar-nav-row">
              <div className="calendar-submode-switch">
                <button className={monthMode === 'month' ? 'active' : ''} onClick={() => setMonthMode('month')}>
                  Måned
                </button>
                <button className={monthMode === 'week' ? 'active' : ''} onClick={() => setMonthMode('week')}>
                  Uke
                </button>
                <button className={monthMode === 'day' ? 'active' : ''} onClick={() => setMonthMode('day')}>
                  Dag
                </button>
              </div>
              <button className="calendar-nav-btn" onClick={() => stepCursor(-1)} aria-label="Forrige">
                ‹
              </button>
              <span className="calendar-nav-label">
                {monthMode === 'month' && cursorDate.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })}
                {monthMode === 'week' && dateRangeLabel(cursorWeekDays[0], cursorWeekDays[6])}
                {monthMode === 'day' && cursorDate.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button className="calendar-nav-btn" onClick={() => stepCursor(1)} aria-label="Neste">
                ›
              </button>
              <button className="calendar-nav-today" onClick={() => setCursorDate(today)}>
                I dag
              </button>
            </div>
            <div className="calendar-view-content">
              {monthMode === 'month' && (
                <MonthGrid
                  monthAnchor={cursorDate}
                  events={filteredEvents}
                  onDayClick={(d) => {
                    setCursorDate(d);
                    setMonthMode('day');
                  }}
                  onEventClick={(e) => setModalState({ event: e })}
                />
              )}
              {monthMode === 'week' && (
                <WeekTimeGrid
                  days={cursorWeekDays}
                  events={filteredEvents}
                  onSlotClick={(d) => setModalState({ defaultDate: d })}
                  onEventClick={(e) => setModalState({ event: e })}
                />
              )}
              {monthMode === 'day' && (
                <WeekTimeGrid
                  days={[cursorDate]}
                  events={filteredEvents}
                  onSlotClick={(d) => setModalState({ defaultDate: d })}
                  onEventClick={(e) => setModalState({ event: e })}
                />
              )}
            </div>
          </>
        )}
      </div>

      {scanResults && <ScanCalendarModal events={scanResults} onClose={() => setScanResults(null)} />}
      {modalState && (
        <CalendarEventModal
          event={modalState.event}
          defaultDate={modalState.defaultDate}
          defaultMemberId={modalState.defaultMemberId}
          onClose={() => setModalState(null)}
        />
      )}
    </section>
  );
}
