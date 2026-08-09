import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';

function LocalFriendsSection({ adminApi }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    adminApi.get('/local-friends').then(setFriends).catch(() => {});
    adminApi
      .get('/local-friends/requests')
      .then((d) => {
        setIncoming(d.incoming);
        setOutgoing(d.outgoing);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    function onChanged() {
      load();
    }
    socket.on('local-friends:requests-changed', onChanged);
    return () => socket.off('local-friends:requests-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      adminApi
        .get(`/local-friends/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function sendRequest(familyId) {
    setMessage('');
    try {
      await adminApi.post('/local-friends/requests', { toFamilyId: familyId });
      setMessage('Forespørsel sendt ✓');
      setQuery('');
      setResults([]);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function respond(requestId, approve) {
    await adminApi.post(`/local-friends/requests/${requestId}/respond`, { approve }).catch(() => {});
    load();
  }

  async function remove(familyId) {
    await adminApi.delete(`/local-friends/${familyId}`).catch(() => {});
    load();
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Vennefamilier på denne installasjonen</div>
      <div style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: -8 }}>
        Søk opp en familie ved navn og send en forespørsel. Når de godkjenner, deler dere "Ute og
        leke" med hverandre.
      </div>

      {incoming.length > 0 && (
        <div className="settings-pending">
          {incoming.map((r) => (
            <div key={r.id} className="settings-pending-item">
              <span>{r.family_name} vil bli vennefamilie. Godkjenne?</span>
              <div className="settings-pending-actions">
                <button className="btn btn-accent" onClick={() => respond(r.id, true)}>
                  Godkjenn
                </button>
                <button className="btn" onClick={() => respond(r.id, false)}>
                  Avslå
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-pairing-box">
        <div className="settings-pairing-label">Søk etter familienavn (f.eks. «Corneliussen»)</div>
        <input
          type="text"
          placeholder="Familienavn…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <div className="empty-hint">Søker…</div>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div className="empty-hint">Fant ingen familier med det navnet.</div>
        )}
        {results.length > 0 && (
          <div className="settings-friends-list">
            {results.map((f) => (
              <div key={f.id} className="settings-friend-item">
                <span>{f.name}</span>
                <button className="btn btn-accent" onClick={() => sendRequest(f.id)}>
                  Send forespørsel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && <div className="settings-message">{message}</div>}

      {outgoing.length > 0 && (
        <>
          <div className="settings-subtitle" style={{ fontSize: 13 }}>
            Venter på godkjenning
          </div>
          <div className="settings-friends-list">
            {outgoing.map((r) => (
              <div key={r.id} className="settings-friend-item">
                <span>{r.family_name}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>venter…</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="settings-friends-list">
        {friends.length === 0 && <div className="empty-hint">Ingen vennefamilier ennå.</div>}
        {friends.map((f) => (
          <div key={f.id} className="settings-friend-item">
            <span>{f.name}</span>
            <button className="btn btn-icon" onClick={() => remove(f.id)} aria-label="Fjern">
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  return (
    <>
      <LocalFriendsSection adminApi={adminApi} />

      <div className="settings-section">
        <div className="settings-subtitle">Vennefamilier på en annen installasjon</div>
        <div style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: -8 }}>
          For en venn som har satt opp sin egen, helt separate FamilieHub – ikke det du trenger
          for familier på denne installasjonen (se over).
        </div>
        {!status.configured ? (
          <p className="empty-hint">
            Ingen relay-tjeneste er konfigurert (RELAY_URL mangler i .env på serveren).
          </p>
        ) : (
          <RelayFriendsSection
            status={status}
            friends={friends}
            pending={pending}
            code={code}
            redeemInput={redeemInput}
            setRedeemInput={setRedeemInput}
            message={message}
            generateCode={generateCode}
            redeemCode={redeemCode}
            approve={approve}
            remove={remove}
          />
        )}
      </div>
    </>
  );
}

function RelayFriendsSection({
  status,
  friends,
  pending,
  code,
  redeemInput,
  setRedeemInput,
  message,
  generateCode,
  redeemCode,
  approve,
  remove,
}) {
  return (
    <>
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
    </>
  );
}
