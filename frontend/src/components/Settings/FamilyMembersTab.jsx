import { useEffect, useState } from 'react';
import { useFamilyMembers } from '../../context/FamilyMembersContext';

const ROLE_LABEL = { voksen: 'Voksen', barn: 'Barn' };

const emptyForm = { name: '', role: 'voksen', avatar: '🙂', color: '#7c9cff' };
const emptyLoginForm = { email: '', password: '' };

function FamilyLoginsSection({ adminApi }) {
  const [users, setUsers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyLoginForm);
  const [error, setError] = useState('');

  function load() {
    adminApi.get('/auth/users').then(setUsers).catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!form.email.trim() || !form.password) return;
    setError('');
    try {
      await adminApi.post('/auth/users', form);
      load();
      setAdding(false);
      setForm(emptyLoginForm);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await adminApi.delete(`/auth/users/${id}`).catch(() => {});
    load();
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Innlogginger</div>
      <div style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: -8 }}>
        Flere voksne kan logge inn på samme familie med hver sin e-post og passord.
      </div>
      <div className="settings-locations-list">
        {users.map((u) => (
          <div key={u.id} className="settings-location-item">
            <span>{u.email}</span>
            {users.length > 1 && (
              <button className="btn btn-icon" onClick={() => remove(u.id)} aria-label="Fjern innlogging">
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="dinner-edit-form">
          <div className="dinner-edit-row">
            <input
              type="email"
              placeholder="E-post…"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoFocus
              style={{ flex: 1 }}
            />
          </div>
          <div className="dinner-edit-row">
            <input
              type="password"
              placeholder="Passord (minst 8 tegn)…"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              minLength={8}
              style={{ flex: 1 }}
            />
          </div>
          {error && <div className="settings-message">{error}</div>}
          <div className="dinner-edit-actions">
            <button
              className="btn"
              onClick={() => {
                setAdding(false);
                setError('');
              }}
            >
              Avbryt
            </button>
            <button className="btn btn-accent" onClick={save}>
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-accent" onClick={() => setAdding(true)}>
          + Legg til innlogging
        </button>
      )}
    </div>
  );
}

export default function FamilyMembersTab({ adminApi }) {
  const { members, refresh } = useFamilyMembers();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function startEdit(member) {
    setEditingId(member.id);
    setAdding(false);
    setForm({ name: member.name, role: member.role, avatar: member.avatar || '🙂', color: member.color });
  }

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setError('');
  }

  async function save() {
    if (!form.name.trim()) return;
    setError('');
    try {
      if (editingId) {
        await adminApi.patch(`/family-members/${editingId}`, form);
      } else {
        await adminApi.post('/family-members', form);
      }
      refresh();
      cancel();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await adminApi.delete(`/family-members/${id}`).catch(() => {});
    refresh();
  }

  const showForm = adding || editingId !== null;

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Familiemedlemmer</div>
      <div className="settings-locations-list">
        {members.map((m) => (
          <div key={m.id} className="settings-location-item">
            <span>
              {m.avatar} {m.name}{' '}
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· {ROLE_LABEL[m.role] || m.role}</span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-icon" onClick={() => startEdit(m)} aria-label="Rediger">
                ✏️
              </button>
              <button className="btn btn-icon" onClick={() => remove(m.id)} aria-label="Fjern">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="dinner-edit-form">
          <div className="dinner-edit-row">
            <input
              type="text"
              className="settings-emoji-input"
              value={form.avatar}
              onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Navn…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="dinner-edit-row">
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={{ flex: 1 }}
            >
              <option value="voksen">Voksen</option>
              <option value="barn">Barn</option>
            </select>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              style={{ width: 44, padding: 2 }}
            />
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
          + Legg til familiemedlem
        </button>
      )}

      <FamilyLoginsSection adminApi={adminApi} />
    </div>
  );
}
