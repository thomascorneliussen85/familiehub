import { useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './DeclutterReviewModal.css';

export default function DeclutterReviewModal({ summary, items, onClose }) {
  const { members } = useFamilyMembers();
  const [rows, setRows] = useState(items.map((i) => ({ ...i, included: true, member_id: null })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(i, patch) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function confirm() {
    const toSave = rows.filter((r) => r.included && r.title.trim());
    if (toSave.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      for (const row of toSave) {
        // eslint-disable-next-line no-await-in-loop
        await api.post('/chores', {
          title: row.title.trim(),
          member_id: row.member_id || null,
          recurrence: 'once',
          stars: row.stars,
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
    <div className="declutter-scan-overlay" onClick={onClose}>
      <div className="declutter-scan-modal" onClick={(e) => e.stopPropagation()}>
        <button className="declutter-scan-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="declutter-scan-title">
          {rows.length === 0 ? 'Fant ikke noe å rydde! 🎉' : `Fant ${rows.length} ting å rydde`}
        </div>
        {summary && <div className="declutter-scan-subtitle">{summary}</div>}

        {rows.length === 0 && (
          <div className="declutter-scan-empty">Rommet ser ryddig ut. Prøv et annet rom, eller et tydeligere bilde.</div>
        )}

        <div className="declutter-scan-list">
          {rows.map((row, i) => (
            <div key={i} className={`declutter-scan-item ${row.included ? '' : 'declutter-scan-item-excluded'}`}>
              <input
                type="checkbox"
                checked={row.included}
                onChange={(e) => update(i, { included: e.target.checked })}
                className="declutter-scan-item-checkbox"
              />
              <div className="declutter-scan-item-fields">
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Ryddeoppgave…"
                  className="declutter-scan-item-title"
                />
                <div className="declutter-scan-item-row">
                  <select value={row.member_id || ''} onChange={(e) => update(i, { member_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Hele familien</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.avatar} {m.name}
                      </option>
                    ))}
                  </select>
                  <select value={row.stars} onChange={(e) => update(i, { stars: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {'⭐'.repeat(n)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="declutter-scan-error">{error}</div>}

        <div className="declutter-scan-actions">
          <button className="btn" onClick={onClose}>
            {rows.length === 0 ? 'Lukk' : 'Avbryt'}
          </button>
          {rows.length > 0 && (
            <button className="btn btn-accent" onClick={confirm} disabled={saving}>
              {saving ? 'Legger til…' : `Legg til ${rows.filter((r) => r.included).length} gjøremål`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
