import { useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './CalendarEventModal.css';

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Delt mellom Uke-/Tavle-/Kalendervisning i den utvidede kalenderen – legg
// til og rediger bruker samme skjema uansett hvilken av de tre visningene du
// står i, siden det ville vært forvirrende å ha tre ulike skjemaer for
// samme handling.
export default function CalendarEventModal({ event, defaultDate, defaultMemberId, onClose, onSaved }) {
  const { members } = useFamilyMembers();
  const isEdit = Boolean(event?.id);
  const start = event ? new Date(event.start_at) : defaultDate || new Date();
  // Klikk i tidsrutenettet gir en defaultDate MED klokkeslett (skal
  // forhåndsutfylles), mens "+"-knappen på tavlen/i toppen bare gir en dag
  // uten klokkeslett (skal starte som "hele dagen", akkurat som før) – derfor
  // sjekkes klokkeslettet på defaultDate i stedet for å anta det ene eller andre.
  const hasTime = event
    ? !event.all_day
    : Boolean(defaultDate && (defaultDate.getHours() !== 0 || defaultDate.getMinutes() !== 0));
  const [form, setForm] = useState({
    title: event?.title || '',
    memberId: event?.member_id || defaultMemberId || '',
    date: toDateInputValue(start),
    time: hasTime
      ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
      : '',
    repeatWeekly: event?.recurrence === 'weekly',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title || !form.date) return;
    const [y, m, d] = form.date.split('-').map(Number);
    let startAt;
    let endAt;
    let allDay;
    if (form.time) {
      const [hh, mm] = form.time.split(':').map(Number);
      startAt = new Date(y, m - 1, d, hh, mm, 0, 0);
      endAt = new Date(startAt);
      endAt.setHours(endAt.getHours() + 1);
      allDay = false;
    } else {
      startAt = new Date(y, m - 1, d, 0, 0, 0, 0);
      endAt = new Date(startAt);
      endAt.setDate(endAt.getDate() + 1);
      allDay = true;
    }
    const payload = {
      title,
      member_id: form.memberId || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      all_day: allDay,
      recurrence: form.repeatWeekly ? 'weekly' : 'once',
    };
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/calendar/events/${event.id}`, payload);
      } else {
        await api.post('/calendar/events', payload);
      }
      onSaved?.();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setSaving(true);
    await api.delete(`/calendar/events/${event.id}`).catch(() => {});
    onSaved?.();
    onClose();
  }

  return (
    <div className="event-modal-overlay" onClick={onClose}>
      <form className="event-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="event-modal-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="event-modal-title">{isEdit ? 'Rediger avtale' : 'Ny avtale'}</div>

        <input
          type="text"
          placeholder="Tittel…"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
          autoFocus
        />

        <div className="event-modal-member-row">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`event-modal-member-chip ${form.memberId === m.id ? 'event-modal-member-chip-active' : ''}`}
              style={{ borderColor: m.color }}
              onClick={() => setForm((f) => ({ ...f, memberId: f.memberId === m.id ? '' : m.id }))}
            >
              {m.avatar} {m.name}
            </button>
          ))}
        </div>

        <div className="event-modal-row">
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
        </div>

        <label className="event-modal-repeat">
          <input
            type="checkbox"
            checked={form.repeatWeekly}
            onChange={(e) => setForm((f) => ({ ...f, repeatWeekly: e.target.checked }))}
          />
          🔁 Gjenta hver uke
        </label>

        <div className="event-modal-actions">
          {isEdit && (
            <button type="button" className="btn" onClick={handleDelete} disabled={saving}>
              🗑️ Slett
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-accent" disabled={saving}>
            {isEdit ? 'Lagre' : 'Legg til'}
          </button>
        </div>
      </form>
    </div>
  );
}
