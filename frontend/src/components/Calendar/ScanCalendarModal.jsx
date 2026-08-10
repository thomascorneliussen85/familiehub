import { useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './ScanCalendarModal.css';

function toStartEnd(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  let start;
  let end;
  let allDay;
  if (time) {
    const [hh, mm] = time.split(':').map(Number);
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
  return { start_at: start.toISOString(), end_at: end.toISOString(), all_day: allDay };
}

export default function ScanCalendarModal({ events, onClose }) {
  const { members } = useFamilyMembers();
  const [items, setItems] = useState(
    events.map((e) => ({ ...e, included: true, time: e.time || '' }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(i, patch) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  async function confirm() {
    const toSave = items.filter((i) => i.included && i.title.trim() && i.date);
    if (toSave.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      for (const item of toSave) {
        const { start_at, end_at, all_day } = toStartEnd(item.date, item.time);
        await api.post('/calendar/events', {
          title: item.title.trim(),
          member_id: item.member_id || null,
          start_at,
          end_at,
          all_day,
          location: item.location || null,
          recurrence: 'once',
        });
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="scan-overlay" onClick={onClose}>
      <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
        <button className="scan-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="scan-title">Fant {items.length} avtale{items.length === 1 ? '' : 'r'}</div>
        <div className="scan-subtitle">Se over og fjern det som ikke stemmer, før du legger dem inn.</div>

        {items.length === 0 && (
          <div className="scan-empty">Fant ingen avtaler i bildet. Prøv et tydeligere bilde.</div>
        )}

        <div className="scan-list">
          {items.map((item, i) => (
            <div key={i} className={`scan-item ${item.included ? '' : 'scan-item-excluded'}`}>
              <input
                type="checkbox"
                checked={item.included}
                onChange={(e) => update(i, { included: e.target.checked })}
                className="scan-item-checkbox"
              />
              <div className="scan-item-fields">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Tittel…"
                  className="scan-item-title"
                />
                <div className="scan-item-row">
                  <input type="date" value={item.date} onChange={(e) => update(i, { date: e.target.value })} />
                  <input type="time" value={item.time} onChange={(e) => update(i, { time: e.target.value })} />
                  <select
                    value={item.member_id || ''}
                    onChange={(e) => update(i, { member_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Ingen</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.avatar} {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                {item.location && <div className="scan-item-location">📍 {item.location}</div>}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="scan-error">{error}</div>}

        <div className="scan-actions">
          <button className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-accent" onClick={confirm} disabled={saving}>
            {saving ? 'Legger til…' : `Legg til ${items.filter((i) => i.included).length} avtale(r)`}
          </button>
        </div>
      </div>
    </div>
  );
}
