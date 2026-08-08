import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';

export default function FriendsTab({ adminApi }) {
  const [status, setStatus] = useState({ configured: false, connected: false });
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [code, setCode] = useState(null);
  const [redeemInput, setRedeemInput] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/relay/status', { credentials: 'include' })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    adminApi.get('/relay/friend-families').then(setFriends).catch(() => {});
    adminApi.get('/relay/pending').then(setPending).catch(() => {});

    function onFriends(list) {
      setFriends(list);
    }
    function onPending(list) {
      setPending(list);
    }
    socket.on('relay:friend-families-update', onFriends);
    socket.on('relay:pending-update', onPending);
    return () => {
      socket.off('relay:friend-families-update', onFriends);
      socket.off('relay:pending-update', onPending);
    };
  }, [adminApi]);

  async function generateCode() {
    setMessage('');
    try {
      const result = await adminApi.post('/relay/pairing/create');
      setCode(result.code);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function redeemCode() {
    setMessage('');
    try {
      const result = await adminApi.post('/relay/pairing/redeem', { code: redeemInput.trim() });
      setMessage(`Venter på godkjenning fra ${result.waitingForApprovalFrom}…`);
      setRedeemInput('');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function approve(pairingId, approveIt) {
    await adminApi.post(`/relay/pairing/${pairingId}/approve`, { approve: approveIt }).catch(() => {});
  }

  async function remove(friendHubId) {
    await adminApi.delete(`/relay/friend-families/${friendHubId}`).catch(() => {});
  }

  if (!status.configured) {
    return (
      <div className="settings-section">
        <p className="empty-hint">
          Ingen relay-tjeneste er konfigurert (RELAY_URL mangler i .env på serveren). "Ut og
          leke" fungerer lokalt, men kan ikke dele status med vennefamilier ennå.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <p className="settings-status-line">
        {status.connected ? '🟢 Koblet til relay' : '🔴 Ikke koblet til relay akkurat nå'}
      </p>

      {pending.length > 0 && (
        <div className="settings-pending">
          {pending.map((p) => (
            <div key={p.pairingId} className="settings-pending-item">
              <span>{p.familyName} vil bli vennefamilie. Godkjenne?</span>
              <div className="settings-pending-actions">
                <button className="btn btn-accent" onClick={() => approve(p.pairingId, true)}>
                  Godkjenn
                </button>
                <button className="btn" onClick={() => approve(p.pairingId, false)}>
                  Avslå
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-pairing-actions">
        <div className="settings-pairing-box">
          <div className="settings-pairing-label">Legg til vennefamilie</div>
          <button className="btn btn-accent" onClick={generateCode}>
            Generer kode
          </button>
          {code && <div className="settings-pairing-code">{code}</div>}
        </div>
        <div className="settings-pairing-box">
          <div className="settings-pairing-label">Har du fått en kode?</div>
          <div className="settings-pairing-redeem">
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-sifret kode"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
            />
            <button className="btn btn-accent" onClick={redeemCode}>
              Bruk kode
            </button>
          </div>
        </div>
      </div>

      {message && <div className="settings-message">{message}</div>}

      <div className="settings-friends-list">
        {friends.length === 0 && <div className="empty-hint">Ingen vennefamilier ennå.</div>}
        {friends.map((f) => (
          <div key={f.id} className="settings-friend-item">
            <span>{f.name}</span>
            <button
              className="btn btn-icon"
              onClick={() => remove(f.friend_hub_id)}
              aria-label="Fjern"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
