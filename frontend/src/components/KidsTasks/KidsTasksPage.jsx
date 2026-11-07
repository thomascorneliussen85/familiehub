import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { speak } from '../../lib/speech';
import AdminPanel from './AdminPanel';
import './KidsTasksPage.css';

function starWord(n) {
  return n === 1 ? 'stjerne' : 'stjerner';
}

export default function KidsTasksPage({ onBack }) {
  const [kids, setKids] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const prevStarsRef = useRef({});
  const celebrationTimeout = useRef(null);

  const load = useCallback(() => {
    api.get('/chores/kids-overview').then(setKids).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    socket.on('chores:update', load);
    socket.on('family-members:update', load);
    return () => {
      socket.off('chores:update', load);
      socket.off('family-members:update', load);
    };
  }, [load]);

  const selectedKid = kids.find((k) => k.id === selectedId) || null;

  // Hilser og forteller hvor mange oppgaver som gjenstår når et barn velges
  useEffect(() => {
    if (selectedId == null) return;
    const kid = kids.find((k) => k.id === selectedId);
    if (!kid) return;
    const undone = kid.tasks.filter((t) => !t.done).length;
    const greeting =
      undone > 0
        ? `Hei, ${kid.name}! Du har ${undone} ${undone === 1 ? 'oppgave' : 'oppgaver'} i dag.`
        : `Hei, ${kid.name}! Du er ferdig med alt i dag. Kjempebra!`;
    speak(greeting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function fireCelebration(emoji, text, bonus = false) {
    if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
    setCelebration({ emoji, text, bonus });
    celebrationTimeout.current = setTimeout(() => setCelebration(null), bonus ? 3400 : 2600);
  }

  // Oppdager når et barn akkurat har låst opp en ny bonusbelønning
  useEffect(() => {
    kids.forEach((kid) => {
      const prev = prevStarsRef.current[kid.id] ?? kid.stars_today;
      if (kid.stars_today > prev) {
        const justUnlocked = kid.bonus_rewards.find(
          (b) => b.stars_required > prev && b.stars_required <= kid.stars_today
        );
        if (justUnlocked && selectedId === kid.id) {
          speak(`Bonus! Du har låst opp: ${justUnlocked.title}`);
          fireCelebration(justUnlocked.emoji, justUnlocked.title, true);
        }
      }
      prevStarsRef.current[kid.id] = kid.stars_today;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids]);

  function readTask(task) {
    speak(`${task.title}. Du får ${task.stars} ${starWord(task.stars)}!`);
  }

  async function completeTask(task) {
    const wasDone = task.done;
    await api.post(`/chores/${task.id}/toggle`).catch(() => {});
    if (!wasDone) {
      const text = task.reward_text
        ? `Kjempebra! Du fikk ${task.stars} ${starWord(task.stars)}. Belønningen din er: ${task.reward_text}`
        : `Kjempebra! Du fikk ${task.stars} ${starWord(task.stars)}!`;
      speak(text);
      fireCelebration('🎉', task.reward_text || 'Bra jobba!');
    }
  }

  const nextBonus = selectedKid?.bonus_rewards.find((b) => !b.unlocked) || null;
  const progressPct = nextBonus
    ? Math.min(100, (selectedKid.stars_today / nextBonus.stars_required) * 100)
    : 100;

  return (
    <div className="kids-page" style={selectedKid ? { '--kid-color': selectedKid.color } : undefined}>
      <div className="kids-page-topbar">
        <button
          type="button"
          className="kids-back-btn"
          onClick={() => (selectedKid ? setSelectedId(null) : onBack())}
        >
          {selectedKid ? '⬅ Bytt barn' : '⬅ Tilbake'}
        </button>
        {!selectedKid && <h1 className="kids-topbar-title">Hvem er du? 🌟</h1>}
        <button type="button" className="kids-lock-btn" onClick={() => setShowAdmin(true)} aria-label="Voksen-innstillinger">
          🔒
        </button>
      </div>

      {!selectedKid && (
        <div className="kids-picker-grid">
          {kids.map((kid) => (
            <button
              key={kid.id}
              type="button"
              className="kids-picker-card"
              style={{ '--kid-color': kid.color }}
              onClick={() => setSelectedId(kid.id)}
            >
              <span
                className="kids-picker-photo"
                style={kid.photo_url ? { backgroundImage: `url(${kid.photo_url})` } : undefined}
              >
                {!kid.photo_url && (kid.avatar || '🧒')}
              </span>
              <span className="kids-picker-name">{kid.name}</span>
              <span className="kids-picker-stars">⭐ {kid.stars_today}</span>
            </button>
          ))}
          {kids.length === 0 && (
            <div className="kids-empty-hint">Ingen barn er lagt til ennå. Trykk 🔒 for å legge til et barn.</div>
          )}
        </div>
      )}

      {selectedKid && (
        <>
          <button type="button" className="kids-detail-header" onClick={() => speak(`Hei, ${selectedKid.name}!`)}>
            <span
              className="kids-detail-photo"
              style={selectedKid.photo_url ? { backgroundImage: `url(${selectedKid.photo_url})` } : undefined}
            >
              {!selectedKid.photo_url && (selectedKid.avatar || '🧒')}
            </span>
            <h1>{selectedKid.name}</h1>
          </button>

          <div className="kids-star-meter">
            <div className="kids-star-count">⭐ {selectedKid.stars_today} {starWord(selectedKid.stars_today)} i dag</div>
            {nextBonus && (
              <>
                <div className="kids-star-progress-track">
                  <div className="kids-star-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="kids-star-next">
                  {nextBonus.emoji} {nextBonus.title} ved {nextBonus.stars_required} stjerner
                </div>
              </>
            )}
          </div>

          <div className="kids-task-grid">
            {selectedKid.tasks.length === 0 && (
              <div className="kids-empty-hint">Ingen oppgaver i dag. Fri dag! 🎉</div>
            )}
            {selectedKid.tasks.map((task) => (
              <div key={task.id} className={`kids-task-card ${task.done ? 'kids-task-card-done' : ''}`}>
                <button type="button" className="kids-task-main" onClick={() => !task.done && readTask(task)}>
                  <span className="kids-task-title">{task.title}</span>
                </button>
                <button
                  type="button"
                  className="kids-task-star-btn"
                  onClick={() => completeTask(task)}
                  aria-label={task.done ? 'Merk som ikke ferdig' : 'Merk som ferdig'}
                >
                  {task.done ? '✔️' : '⭐'.repeat(task.stars)}
                </button>
              </div>
            ))}
          </div>

          {selectedKid.bonus_rewards.length > 0 && (
            <div className="kids-bonus-row">
              {selectedKid.bonus_rewards.map((b) => (
                <div key={b.id} className={`kids-bonus-chip ${b.unlocked ? 'kids-bonus-chip-unlocked' : ''}`}>
                  <span className="kids-bonus-emoji">{b.emoji}</span>
                  <span>{b.title}</span>
                  <span className="kids-bonus-req">{b.stars_required}⭐</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {celebration && (
        <div className={`kids-celebration ${celebration.bonus ? 'kids-celebration-bonus' : ''}`}>
          <div className="kids-celebration-emoji">{celebration.emoji}</div>
          <div className="kids-celebration-text">{celebration.text}</div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => {
            setShowAdmin(false);
            load();
          }}
        />
      )}
    </div>
  );
}
