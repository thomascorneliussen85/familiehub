import { useMemo } from 'react';
import './MonthGrid.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MAX_VISIBLE = 3;

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date) {
  const d = new Date(date);
  const idx = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idx);
  return d;
}

export default function MonthGrid({ monthAnchor, events, onDayClick, onEventClick }) {
  const gridStart = useMemo(() => startOfWeek(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1)), [monthAnchor]);
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [gridStart]
  );
  const now = new Date();
  const month = monthAnchor.getMonth();

  return (
    <div className="month-grid">
      <div className="month-grid-daynames">
        {DAY_LABELS.map((label) => (
          <div key={label} className="month-grid-dayname">
            {label}
          </div>
        ))}
      </div>
      <div className="month-grid-cells">
        {days.map((day, i) => {
          const dayEvents = events
            .filter((e) => isSameDay(new Date(e.start_at), day))
            .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          const outsideMonth = day.getMonth() !== month;
          return (
            <div
              key={i}
              className={`month-grid-cell ${outsideMonth ? 'month-grid-cell-outside' : ''} ${isSameDay(day, now) ? 'month-grid-cell-today' : ''}`}
              onClick={() => onDayClick(day)}
            >
              <span className="month-grid-daynum">{day.getDate()}</span>
              <div className="month-grid-events">
                {visible.map((e) => (
                  <div
                    key={e.id}
                    className="month-grid-chip"
                    style={{ borderLeftColor: e.member_color || '#7c9cff' }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                  >
                    {e.recurrence === 'weekly' && '🔁 '}
                    {e.title}
                  </div>
                ))}
                {overflow > 0 && <div className="month-grid-more">+{overflow} mer</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
