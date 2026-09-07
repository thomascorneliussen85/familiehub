import { useState } from 'react';
import { useFamilyMembers } from '../../context/FamilyMembersContext';

const GUEST_COLORS = ['#e0433d', '#f2994a', '#2fb6a5', '#7c5cff', '#e85fb3', '#6fcf67'];

// Delt av alle spill (GameShell) – velg 2-4 spillere fra familien, eller legg
// til gjester uten profil (venner på besøk). Rekkefølgen spillerne velges i
// blir spillerekkefølgen i selve spillet (viktig for tur-basert spill).
export default function PlayerSetup({ game, onStart, onBack }) {
  const { members } = useFamilyMembers();
  const [selected, setSelected] = useState([]);
  const [guestName, setGuestName] = useState('');

  const atMax = selected.length >= game.maxPlayers;
  const canStart = selected.length >= game.minPlayers && selected.length <= game.maxPlayers;

  function toggleMember(m) {
    setSelected((prev) => {
      const exists = prev.some((p) => p.member_id === m.id);
      if (exists) return prev.filter((p) => p.member_id !== m.id);
      if (atMax) return prev;
      return [...prev, { member_id: m.id, guest_name: null, name: m.name, color: m.color, avatar: m.avatar || '🙂' }];
    });
  }

  function addGuest() {
    const name = guestName.trim();
    if (!name || atMax) return;
    const color = GUEST_COLORS[selected.length % GUEST_COLORS.length];
    setSelected((prev) => [...prev, { member_id: null, guest_name: name, name, color, avatar: '🙂' }]);
    setGuestName('');
  }

  function removePlayer(index) {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  }

  const playersLabel =
    game.minPlayers === game.maxPlayers ? `${game.minPlayers} spillere` : `${game.minPlayers}–${game.maxPlayers} spillere`;

  return (
    <div className="games-setup">
      <button className="btn" onClick={onBack}>
        ← Andre spill
      </button>
      <h2 className="games-setup-title">
        {game.icon} {game.name}
      </h2>
      <p className="games-setup-hint">Velg {playersLabel} – trykk på hvem som skal spille.</p>

      <div className="games-setup-members">
        {members.map((m) => {
          const active = selected.some((p) => p.member_id === m.id);
          return (
            <button
              key={m.id}
              className={`games-setup-member ${active ? 'games-setup-member-active' : ''}`}
              style={{ borderColor: m.color }}
              onClick={() => toggleMember(m)}
              disabled={!active && atMax}
            >
              <span className="games-setup-member-avatar">{m.avatar || '🙂'}</span>
              {m.name}
            </button>
          );
        })}
      </div>

      <div className="games-setup-guest-row">
        <input
          type="text"
          placeholder="Gjestenavn…"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          disabled={atMax}
        />
        <button className="btn" onClick={addGuest} disabled={!guestName.trim() || atMax}>
          + Legg til gjest
        </button>
      </div>

      {selected.length > 0 && (
        <div className="games-setup-selected">
          {selected.map((p, i) => (
            <span key={i} className="games-setup-chip" style={{ background: p.color }}>
              {p.avatar} {p.name}
              <button onClick={() => removePlayer(i)} aria-label={`Fjern ${p.name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <button className="btn btn-accent games-setup-start" onClick={() => onStart(selected)} disabled={!canStart}>
        Start spill
      </button>
    </div>
  );
}
