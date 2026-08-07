import { useEffect, useState } from 'react';

const emptyForm = { title: '', description: '', star_cost: 5 };

function timeAgo(iso) {
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function RewardsSettingsTab({ adminApi }) {
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');

  function load() {
    adminApi.get('/rewards').then(setRewards).catch(() => {});
    adminApi.get('/rewards/redemptions?limit=10').then(setRedemptions).catch(() => {});
  }

  async function undoRedemption(id) {
    await adminApi.delete(`/rewards/redemptions/${id}`).catch(() => {});
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startAdd() {
    setForm(emptyForm);
    setImageFile(null);
    setAdding(true);
    setEditingId(null);
  }

  function startEdit(reward) {
    setForm({ title: reward.title, description: reward.description || '', star_cost: reward.star_cost });
    setImageFile(null);
    setEditingId(reward.id);
    setAdding(false);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setError('');
  }

  function buildFormData() {
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('star_cost', String(form.star_cost));
    if (imageFile) fd.append('image', imageFile);
    return fd;
  }

  async function save() {
    if (!form.title.trim() || !form.star_cost) return;
    setError('');
    try {
      if (editingId) {
        await adminApi.patchForm(`/rewards/${editingId}`, buildFormData());
      } else {
        await adminApi.postForm('/rewards', buildFormData());
      }
      load();
      cancel();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deactivate(id) {
    await adminApi.delete(`/rewards/${id}`).catch(() => {});
    load();
  }

  async function reactivate(id) {
    await adminApi.patch(`/rewards/${id}`, { active: true }).catch(() => {});
    load();
  }

  const showForm = adding || editingId !== null;
  const visibleRewards = rewards.filter((r) => showInactive || r.active);

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Belønninger</div>

      <div className="settings-locations-list">
        {visibleRewards.map((r) => (
          <div key={r.id} className="settings-location-item">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {r.image_url ? (
                <img src={r.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
              ) : (
                <span>🎁</span>
              )}
              {r.title}{' '}
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                · ⭐ {r.star_cost}
                {!r.active && ' · inaktiv'}
              </span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-icon" onClick={() => startEdit(r)} aria-label="Rediger">
                ✏️
              </button>
              {r.active ? (
                <button className="btn btn-icon" onClick={() => deactivate(r.id)} aria-label="Fjern">
                  🗑️
                </button>
              ) : (
                <button className="btn btn-icon" onClick={() => reactivate(r.id)} aria-label="Gjenopprett">
                  ↩️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Vis inaktive belønninger
      </label>

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
            <input
              type="number"
              min="1"
              placeholder="Stjerner"
              value={form.star_cost}
              onChange={(e) => setForm((f) => ({ ...f, star_cost: e.target.value }))}
              style={{ width: 90 }}
            />
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
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
          + Legg til belønning
        </button>
      )}

      {redemptions.length > 0 && (
        <>
          <div className="settings-subtitle" style={{ fontSize: 13 }}>
            Nylige innløsninger
          </div>
          <div className="settings-locations-list">
            {redemptions.map((r) => (
              <div key={r.id} className="settings-location-item">
                <span>
                  {r.member_avatar} {r.member_name} · {r.reward_title} ({r.stars_spent}⭐){' '}
                  <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{timeAgo(r.redeemed_at)}</span>
                </span>
                <button className="btn btn-icon" onClick={() => undoRedemption(r.id)} aria-label="Angre">
                  ↩️
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
