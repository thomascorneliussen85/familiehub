import { useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './ScanHomeworkModal.css';

export default function ScanHomeworkModal({ items, onClose }) {
  const { members } = useFamilyMembers();
  const [rows, setRows] = useState(items.map((i) => ({ ...i, included: true })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(i, patch) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function confirm() {
    const toSave = rows.filter((r) => r.included && r.title.trim() && r.due_date);
    if (toSave.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      for (const row of toSave) {
        await api.post('/chores', {
          title: row.title.trim(),
          member_id: row.member_id || null,
          recurrence: 'once',
          due_date: row.due_date,
          is_homework: true,
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
    <div className="homework-scan-overlay" onClick={onClose}>
      <div className="homework-scan-modal" onClick={(e) => e.stopPropagation()}>
        <button className="homework-scan-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="homework-scan-title">Fant {rows.length} lekse{rows.length === 1 ? '' : 'r'}</div>
        <div className="homework-scan-subtitle">Se over og fjern det som ikke stemmer, før du legger dem inn.</div>

        {rows.length === 0 && (
          <div className="homework-scan-empty">Fant ingen lekser i bildet. Prøv et tydeligere bilde.</div>
        )}

        <div className="homework-scan-list">
          {rows.map((row, i) => (
            <div key={i} className={`homework-scan-item ${row.included ? '' : 'homework-scan-item-excluded'}`}>
              <input
                type="checkbox"
                checked={row.included}
                onChange={(e) => update(i, { included: e.target.checked })}
                className="homework-scan-item-checkbox"
              />
              <div className="homework-scan-item-fields">
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Lekse…"
                  className="homework-scan-item-title"
                />
                <div className="homework-scan-item-row">
                  <input type="date" value={row.due_date} onChange={(e) => update(i, { due_date: e.target.value })} />
                  <select
                    value={row.member_id || ''}
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
              </div>
            </div>
          ))}
        </div>

        {error && <div className="homework-scan-error">{error}</div>}

        <div className="homework-scan-actions">
          <button className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-accent" onClick={confirm} disabled={saving}>
            {saving ? 'Legger til…' : `Legg til ${rows.filter((r) => r.included).length} lekse(r)`}
          </button>
        </div>
      </div>
    </div>
  );
}
