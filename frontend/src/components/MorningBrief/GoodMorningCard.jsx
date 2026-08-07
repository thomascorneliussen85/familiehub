import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useTimeOfDay } from '../../hooks/useTimeOfDay';
import BriefModal from './BriefModal';
import './GoodMorningCard.css';

// Vises på dashbordet kl. 05–10: profilknapper for familiemedlemmer som ikke
// har hørt sin Morgenbrief ennå. Skjules helt utenfor dette vinduet, eller
// når alle har hørt briefen sin.
export default function GoodMorningCard() {
  const { period } = useTimeOfDay();
  const [members, setMembers] = useState([]);
  const [openMemberId, setOpenMemberId] = useState(null);

  function load() {
    api.get('/brief/status').then(setMembers).catch(() => {});
  }

  useEffect(() => {
    load();
    socket.on('brief:update', load);
    return () => socket.off('brief:update', load);
  }, []);

  if (period !== 'morgen') return null;

  const unheard = members.filter((m) => !m.heard);
  if (unheard.length === 0) return null;

  return (
    <>
      <div className="good-morning-card">
        <span className="good-morning-label">God morgen! Hør din brief:</span>
        <div className="good-morning-profiles">
          {unheard.map((m) => (
            <button
              key={m.id}
              className="good-morning-profile"
              style={{ borderColor: m.color }}
              onClick={() => setOpenMemberId(m.id)}
            >
              <span className="good-morning-avatar" style={{ background: m.color }}>
                {m.avatar}
              </span>
              <span className="good-morning-name">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
      {openMemberId != null && (
        <BriefModal
          member={members.find((m) => m.id === openMemberId)}
          onClose={() => {
            setOpenMemberId(null);
            load();
          }}
        />
      )}
    </>
  );
}
