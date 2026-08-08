import { useEffect, useState } from 'react';

function formatDate(iso) {
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackTab({ adminApi }) {
  const [items, setItems] = useState([]);
  const [showResolved, setShowResolved] = useState(false);

  function load() {
    adminApi.get('/feedback').then(setItems).catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleResolved(item) {
    await adminApi.patch(`/feedback/${item.id}/resolve`, { resolved: !item.resolved }).catch(() => {});
    load();
  }

  const visible = items.filter((i) => showResolved || !i.resolved);
  const unresolvedCount = items.filter((i) => !i.resolved).length;

  return (
    <div className="settings-section">
      <div className="settings-subtitle">
        Tilbakemeldinger {unresolvedCount > 0 && <span style={{ color: 'var(--accent)' }}>· {unresolvedCount} nye</span>}
      </div>

      {visible.length === 0 && (
        <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Ingen tilbakemeldinger ennå.</div>
      )}

      <div className="settings-locations-list">
        {visible.map((item) => (
          <div key={item.id} className="settings-location-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {item.family_name} · {item.user_email || 'ukjent bruker'} · {formatDate(item.created_at)}
                {item.page && ` · ${item.page}`}
              </span>
              <span style={{ textDecoration: item.resolved ? 'line-through' : 'none', color: item.resolved ? 'var(--text-faint)' : 'var(--text)' }}>
                {item.message}
              </span>
            </div>
            <button className="btn btn-icon" onClick={() => toggleResolved(item)} aria-label={item.resolved ? 'Merk som ny' : 'Merk som løst'}>
              {item.resolved ? '↩️' : '✅'}
            </button>
          </div>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Vis løste tilbakemeldinger
      </label>
    </div>
  );
}
