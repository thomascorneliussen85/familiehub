import { useState } from 'react';
import './WeekBoard.css';

const keyFor = date => date.toLocaleDateString('sv-SE');

export default function WeekBoard({ days, events, now, onOpenEvent, onSelectDay, onAdd }) {
  const [expanded, setExpanded] = useState({});
  return <div className="week-board" aria-label="Avtaler mandag til søndag">
    {days.map(day => {
      const key = keyFor(day);
      const end = new Date(day); end.setDate(end.getDate() + 1);
      const isToday = key === keyFor(now);
      const items = events.filter(event => new Date(event.start_at) < end && new Date(event.end_at) > day)
        .sort((a, b) => Number(b.all_day) - Number(a.all_day) || new Date(a.start_at) - new Date(b.start_at));
      const visible = expanded[key] ? items : items.slice(0, 4);
      return <section className={`week-day ${isToday ? 'week-day-today' : ''} ${day.getDay() === 0 || day.getDay() === 6 ? 'week-day-weekend' : ''}`} key={key} aria-label={day.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}>
        <button className="week-day-heading" onClick={() => onSelectDay(day)} aria-label={`Vis detaljer for ${day.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}`} aria-current={isToday ? 'date' : undefined}>
          <span>{day.toLocaleDateString('nb-NO', { weekday: 'long' })}</span>
          <strong>{day.getDate()}</strong>
          <small>{isToday ? 'I dag' : `${items.length} ${items.length === 1 ? 'avtale' : 'avtaler'}`}</small>
        </button>
        <div className="week-day-events">
          {items.length === 0 && <p className="week-day-empty">Ingen avtaler</p>}
          {visible.map(event => <button key={`${event.id}:${event.start_at}`} className={`week-event ${new Date(event.end_at) <= now ? 'week-event-past' : ''}`} style={{ '--member-color': event.member_color || 'var(--accent)' }} onClick={() => onOpenEvent(event)}>
            <span className="week-event-time">{event.all_day ? 'Hele dagen' : new Date(event.start_at) < day ? 'Fortsetter' : new Date(event.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
            <strong>{event.title}</strong>
            <span className="week-event-member">{event.member_name || 'Hele familien'}</span>
          </button>)}
          {items.length > 4 && <button className="week-show-more" onClick={() => setExpanded(value => ({ ...value, [key]: !value[key] }))}>{expanded[key] ? 'Vis færre' : `+ ${items.length - 4} flere avtaler`}</button>}
        </div>
        <button className="week-day-add" onClick={() => onAdd(day)} aria-label={`Legg til avtale ${day.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}`}>+ Legg til</button>
      </section>;
    })}
  </div>;
}
