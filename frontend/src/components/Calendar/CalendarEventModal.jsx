import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './CalendarEventModal.css';
import PackingChecklist from './PackingChecklist';

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
  const start = event ? new Date(event.original_start_at || event.start_at) : defaultDate || new Date();
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
    endDate: event ? toDateInputValue(new Date(new Date(event.original_end_at || event.end_at).getTime() - (event.all_day ? 1 : 0))) : toDateInputValue(start),
    time: hasTime
      ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
      : '',
    repeatWeekly: event?.recurrence === 'weekly',
    endTime: event && !event.all_day ? new Date(event.original_end_at || event.end_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '',
    responsible_id: event?.responsible_id || '', driver_id: event?.driver_id || '', pickup_id: event?.pickup_id || '',
    bring_list: event?.bring_list || '', location: event?.location || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nearby, setNearby] = useState([]);
  const [conflictError, setConflictError] = useState(false);
  useEffect(() => {
    let active = true;
    const start = new Date(`${form.date}T00:00:00`);
    const end = new Date(`${form.endDate || form.date}T00:00:00`); end.setDate(end.getDate() + 1);
    if (Number.isNaN(start.getTime())) return;
    api.get(`/calendar/events?from=${start.toISOString()}&to=${end.toISOString()}`)
      .then(data => { if (active) { setNearby(data); setConflictError(false); } })
      .catch(() => { if (active) setConflictError(true); });
    return () => { active = false; };
  }, [form.date, form.endDate]);
  const proposedStart = Date.parse(`${form.date}T${form.time || '00:00'}`);
  const proposedEnd = form.endTime ? Date.parse(`${form.endDate || form.date}T${form.endTime}`) : proposedStart + 3600000;
  const involved = [form.memberId, form.responsible_id, form.driver_id, form.pickup_id].filter(Boolean).map(Number);
  const conflicts = form.time ? nearby.filter(item => item.id !== event?.id && !item.all_day && Date.parse(item.start_at) < proposedEnd && Date.parse(item.end_at) > proposedStart && [item.member_id, item.responsible_id, item.driver_id, item.pickup_id].some(id => involved.includes(Number(id)))) : [];


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
      endAt = new Date(`${form.endDate || form.date}T00:00:00`);
      if (form.endTime) { const [eh, em] = form.endTime.split(':').map(Number); endAt.setHours(eh, em); }
      else { endAt = new Date(startAt); endAt.setHours(endAt.getHours() + 1); }
      if (endAt <= startAt) { setError('Sluttid må være etter starttid.'); return; }
      allDay = false;
    } else {
      startAt = new Date(y, m - 1, d, 0, 0, 0, 0);
      endAt = new Date(`${form.endDate || form.date}T00:00:00`);
      endAt.setDate(endAt.getDate() + 1);
      allDay = true;
    }
    if (endAt <= startAt) { setError('Sluttdato må være etter start.'); return; }
    const payload = {
      title,
      member_id: form.memberId || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      all_day: allDay,
      recurrence: form.repeatWeekly ? 'weekly' : 'once',
      responsible_id: form.responsible_id ? Number(form.responsible_id) : null,
      driver_id: form.driver_id ? Number(form.driver_id) : null, pickup_id: form.pickup_id ? Number(form.pickup_id) : null,
      bring_list: form.bring_list, location: form.location, time_zone: event?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.put(`/calendar/events/${event.id}`, payload);
      } else {
        await api.post('/calendar/events', payload);
      }
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setSaving(true);
    try { await api.delete(`/calendar/events/${event.id}`); onSaved?.(); onClose(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
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
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, endDate: f.endDate < e.target.value || f.endDate === f.date ? e.target.value : f.endDate }))}
            required
          />
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
          />
        </div>

        <label>{form.time ? 'Sluttdato' : 'Til og med'}<input type="date" min={form.date} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required /></label>
        {form.time && <label>Sluttid <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></label>}
        <div className="event-logistics">
          {[['responsible_id', 'Ansvarlig voksen'], ['driver_id', 'Kjører'], ['pickup_id', 'Henter']].map(([key, label]) => <label key={key}>{label}
            <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
              <option value="">Ikke avklart</option>
              {members.filter(m => m.role === 'voksen').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>)}
        </div>
        <label>Sted <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></label>
        <label>Husk å ta med (én ting per linje)<textarea rows={3} value={form.bring_list} onChange={e => setForm(f => ({ ...f, bring_list: e.target.value }))} placeholder={'Drikkeflaske\nTreningssko'} /></label>
        {isEdit && event.bring_list && <PackingChecklist event={event} date={new Date(event.start_at).toLocaleDateString('sv-SE')} />}
        {conflicts.length > 0 && <p className="hub-inline-warning" role="status">Mulig kollisjon: {conflicts.map(item => item.title).join(', ')}. Kontroller hvem som deltar eller har transportansvar.</p>}
        {conflictError && <p role="status">Kunne ikke kontrollere kalenderkollisjoner.</p>}
        {error && <p role="alert">{error}</p>}
        {isEdit && form.repeatWeekly && <p className="empty-hint">Endringen gjelder hele den ukentlige serien fra startdatoen.</p>}
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
            {saving ? 'Lagrer…' : isEdit ? 'Lagre' : 'Legg til'}
          </button>
        </div>
      </form>
    </div>
  );
}
