import { useEffect, useState } from 'react';

const STATUS_LABELS = {
  planned: 'Planlagt',
  in_progress: 'Jobbes med',
  done: 'Ferdig',
};

const emptyForm = { title: '', description: '', status: 'planned' };

export default function RoadmapTab({ adminApi, isOwnerFamily }) {
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function load() {
    adminApi.get('/roadmap').then(setItems).catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startAdd() {
    setForm(emptyForm);
    setAdding(true);
    setEditingId(null);
    setError('');
  }

  function startEdit(item) {
    setForm({ title: item.title, description: item.description || '', status: item.status });
    setEditingId(item.id);
    setAdding(false);
    setError('');
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setError('');
  }

  async function save() {
    if (!form.title.trim()) return;
    setError('');
    try {
      if (editingId) {
        await adminApi.patch(`/roadmap/${editingId}`, form);
      } else {
        await adminApi.post('/roadmap', form);
      }
      load();
      cancel();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await adminApi.delete(`/roadmap/${id}`).catch(() => {});
    load();
  }

  const showForm = adding || editingId !== null;

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Dette kommer framover</div>
      {!isOwnerFamily && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: -4 }}>
          Ting vi planlegger å bygge videre på FamilieHub.
        </div>
      )}

      {items.length === 0 && (
        <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Ingenting på veikartet ennå.</div>
      )}

      <div className="settings-locations-list">
        {items.map((item) => (
          <div key={item.id} className="settings-location-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>{item.title}</strong>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: item.status === 'done' ? 'var(--success)' : item.status === 'in_progress' ? 'var(--accent)' : 'var(--panel-bg-alt)',
                    color: item.status === 'planned' ? 'var(--text-dim)' : 'var(--on-accent)',
                    border: item.status === 'planned' ? '1px solid var(--panel-border)' : 'none',
                  }}
                >
                  {STATUS_LABELS[item.status]}
                </span>
              </span>
              {item.description && (
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{item.description}</span>
              )}
            </div>
            {isOwnerFamily && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-icon" onClick={() => startEdit(item)} aria-label="Rediger">
                  ✏️
                </button>
                <button className="btn btn-icon" onClick={() => remove(item.id)} aria-label="Fjern">
                  🗑️
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isOwnerFamily && (
        <>
          {showForm ? (
            <div className="dinner-edit-form">
              <div className="dinner-edit-row">
                <input
                  type="text"
                  placeholder="Tittel…"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  autoFocus
                  style={{ flex: 1 }}
                />
              </div>
              <div className="dinner-edit-row">
                <input
                  type="text"
                  placeholder="Beskrivelse (valgfritt)…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="dinner-edit-row">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {error && <div className="settings-message">{error}</div>}
              <div className="dinner-edit-actions">
                <button className="btn" onClick={cancel}>
                  Avbryt
                </button>
                <button className="btn btn-accent" onClick={save}>
                  Lagre
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-accent" onClick={startAdd}>
              + Legg til
            </button>
          )}
        </>
      )}
    </div>
  );
}
