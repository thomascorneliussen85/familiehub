import { useEffect, useState } from 'react';
import { useFamilyMembers } from '../../context/FamilyMembersContext';

const PROVIDER_LABEL = { google: 'Google', icloud: 'iCloud' };

export default function CalendarConnectionsTab({ adminApi }) {
  const { members } = useFamilyMembers();
  const [connections, setConnections] = useState([]);
  const [icloudFormFor, setIcloudFormFor] = useState(null);
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  function loadConnections() {
    adminApi.get('/calendar-connections').then(setConnections).catch(() => {});
  }

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGoogle(memberId) {
    setMessage('');
    try {
      const { url } = await adminApi.get(`/calendar-connections/google/auth-url?memberId=${memberId}`);
      window.location.href = url;
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function connectICloud(memberId) {
    if (!appleId.trim() || !appPassword.trim()) return;
    setMessage('Kobler til…');
    try {
      await adminApi.post('/calendar-connections/icloud', {
        memberId,
        appleId: appleId.trim(),
        appPassword: appPassword.trim(),
      });
      setMessage('Koblet til ✓');
      setAppleId('');
      setAppPassword('');
      setIcloudFormFor(null);
      loadConnections();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function syncNow(id) {
    setBusyId(id);
    setMessage('');
    try {
      const result = await adminApi.post(`/calendar-connections/${id}/sync`);
      setMessage(`Synkronisert – ${result.synced} avtaler hentet`);
      loadConnections();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(id) {
    await adminApi.delete(`/calendar-connections/${id}`).catch(() => {});
    loadConnections();
  }

  return (
    <div className="settings-section">
      <p className="empty-hint" style={{ padding: 0 }}>
        Hvert familiemedlem kan koble til sin egen kalender. Ingen automatisk synkronisering –
        trykk "Synkroniser nå" når du vil hente inn nye avtaler.
      </p>

      {members.map((member) => {
        const memberConnections = connections.filter((c) => c.member_id === member.id);
        return (
          <div key={member.id} className="settings-friend-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {member.avatar} {member.name}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-icon" onClick={() => connectGoogle(member.id)} aria-label="Koble til Google">
                  + Google
                </button>
                <button
                  className="btn btn-icon"
                  onClick={() => setIcloudFormFor(icloudFormFor === member.id ? null : member.id)}
                  aria-label="Koble til iCloud"
                >
                  + iCloud
                </button>
              </div>
            </div>

            {icloudFormFor === member.id && (
              <div className="settings-pairing-redeem">
                <input
                  type="text"
                  placeholder="Apple-ID (e-post)"
                  value={appleId}
                  onChange={(e) => setAppleId(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="App-spesifikt passord"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                />
                <button className="btn btn-accent" onClick={() => connectICloud(member.id)}>
                  Koble til
                </button>
              </div>
            )}

            {memberConnections.map((c) => (
              <div key={c.id} className="settings-location-item">
                <span>
                  {c.provider === 'google' ? '🔵' : '☁️'} {PROVIDER_LABEL[c.provider]} · {c.label}
                  {c.last_synced_at && (
                    <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                      {' '}
                      · sist synket {new Date(c.last_synced_at.replace(' ', 'T') + 'Z').toLocaleString('nb-NO')}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-icon" onClick={() => syncNow(c.id)} disabled={busyId === c.id}>
                    {busyId === c.id ? '⏳' : '🔄'}
                  </button>
                  <button className="btn btn-icon" onClick={() => disconnect(c.id)} aria-label="Koble fra">
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
