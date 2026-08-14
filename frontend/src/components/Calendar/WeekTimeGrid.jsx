import { useEffect, useRef } from 'react';
import './WeekTimeGrid.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_HEIGHT = 52;
const GRID_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function topFor(date) {
  const hours = date.getHours() + date.getMinutes() / 60;
  return Math.max(0, (hours - HOUR_START) * HOUR_HEIGHT);
}

function heightFor(start, end) {
  const durationHours = Math.max(0.4, (end - start) / 3600000);
  return durationHours * HOUR_HEIGHT;
}

// Grupperer overlappende avtaler i "klynger" og pakker hver klynge i så få
// kolonner som mulig (samme prinsipp som Google/Outlook-ukevisning) – uten
// dette ville to avtaler på samme tidspunkt havnet oppå hverandre.
function layoutDayEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const clusters = [];
  let current = [];
  let currentEnd = -Infinity;
  for (const ev of sorted) {
    const s = new Date(ev.start_at).getTime();
    const e = new Date(ev.end_at).getTime();
    if (current.length && s >= currentEnd) {
      clusters.push(current);
      current = [];
      currentEnd = -Infinity;
    }
    current.push(ev);
    currentEnd = Math.max(currentEnd, e);
  }
  if (current.length) clusters.push(current);

  const result = [];
  for (const cluster of clusters) {
    const columnEnds = [];
    const placed = [];
    for (const ev of cluster) {
      const s = new Date(ev.start_at).getTime();
      const e = new Date(ev.end_at).getTime();
      let colIndex = columnEnds.findIndex((endTime) => endTime <= s);
      if (colIndex === -1) {
        colIndex = columnEnds.length;
        columnEnds.push(e);
      } else {
        columnEnds[colIndex] = e;
      }
      placed.push({ ev, colIndex });
    }
    const totalCols = columnEnds.length;
    for (const { ev, colIndex } of placed) {
      result.push({ ...ev, _col: colIndex, _cols: totalCols });
    }
  }
  return result;
}

export default function WeekTimeGrid({ days, events, onSlotClick, onEventClick }) {
  const scrollRef = useRef(null);
  const now = new Date();
  const gridTemplateColumns = `56px repeat(${days.length}, 1fr)`;

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = Math.max(0, topFor(now) - 140);
    scrollRef.current.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function eventsFor(day, allDay) {
    return events.filter((e) => Boolean(e.all_day) === allDay && isSameDay(new Date(e.start_at), day));
  }

  function handleColumnClick(e, day) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hourFloat = HOUR_START + offsetY / HOUR_HEIGHT;
    const h = Math.floor(hourFloat);
    const m = Math.round(((hourFloat - h) * 60) / 15) * 15;
    const d = new Date(day);
    d.setHours(h, m % 60, 0, 0);
    onSlotClick(d);
  }

  return (
    <div className="week-grid">
      <div className="week-grid-header" style={{ gridTemplateColumns }}>
        <div className="week-grid-gutter" />
        {days.map((day, i) => (
          <div key={i} className={`week-grid-dayname ${isSameDay(day, now) ? 'week-grid-dayname-today' : ''}`}>
            <span>{days.length > 1 ? DAY_LABELS[(day.getDay() + 6) % 7] : day.toLocaleDateString('nb-NO', { weekday: 'long' })}</span>
            <span className="week-grid-daynum">{day.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="week-grid-allday" style={{ gridTemplateColumns }}>
        <div className="week-grid-gutter week-grid-allday-label">Hele dagen</div>
        {days.map((day, i) => {
          const allDayEvents = eventsFor(day, true);
          return (
            <div key={i} className="week-grid-allday-col">
              {allDayEvents.map((e) => (
                <div
                  key={e.id}
                  className="week-grid-allday-chip"
                  style={{ borderLeftColor: e.member_color || '#7c9cff' }}
                  onClick={() => onEventClick(e)}
                >
                  {e.recurrence === 'weekly' && '🔁 '}
                  {e.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="week-grid-scroll" ref={scrollRef}>
        <div className="week-grid-scroll-inner" style={{ gridTemplateColumns, height: GRID_HEIGHT }}>
          <div className="week-grid-hourlabels">
            {HOURS.map((h) => (
              <div key={h} className="week-grid-hourlabel" style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((day, i) => {
            const laidOut = layoutDayEvents(eventsFor(day, false));
            return (
              <div
                key={i}
                className="week-grid-daycol"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--panel-border) 0, var(--panel-border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
                }}
                onClick={(e) => handleColumnClick(e, day)}
              >
                {laidOut.map((e) => {
                  const start = new Date(e.start_at);
                  const end = new Date(e.end_at);
                  const widthPct = 100 / e._cols;
                  return (
                    <div
                      key={e.id}
                      className="week-grid-event"
                      style={{
                        top: topFor(start),
                        height: heightFor(start, end),
                        left: `${e._col * widthPct}%`,
                        width: `calc(${widthPct}% - 3px)`,
                        borderLeftColor: e.member_color || '#7c9cff',
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                    >
                      <span className="week-grid-event-time">
                        {start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="week-grid-event-title">
                        {e.recurrence === 'weekly' && '🔁 '}
                        {e.title}
                      </span>
                      {e.member_name && <span className="week-grid-event-member">{e.member_name}</span>}
                    </div>
                  );
                })}
                {isSameDay(day, now) && <div className="week-grid-now-line" style={{ top: topFor(now) }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
