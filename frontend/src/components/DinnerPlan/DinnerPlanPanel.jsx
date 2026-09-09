import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import DinnerRecipeModal from './DinnerRecipeModal';
import './DinnerPlanPanel.css';

const DAY_LABELS = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const DAYS_AHEAD = 6;

function toDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DinnerPlanPanel({ compact = false }) {
  const { openPanel } = usePanelNavigation();
  const [plans, setPlans] = useState({});
  const [editingDate, setEditingDate] = useState(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('🍽️');
  const [recipeFor, setRecipeFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function loadPlans() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + DAYS_AHEAD);
    api
      .get(`/dinner-plans?from=${toDateStr(today)}&to=${toDateStr(end)}`)
      .then((list) => {
        const byDate = {};
        list.forEach((p) => {
          byDate[p.date] = p;
        });
        setPlans(byDate);
      })
      .catch(() => setError('Kunne ikke hente middagsplanen.'));
  }

  useEffect(() => {
    loadPlans();
    socket.on('dinner-plans:update', loadPlans);
    return () => socket.off('dinner-plans:update', loadPlans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  function openEdit(dateStr) {
    const existing = plans[dateStr];
    setTitle(existing?.title || '');
    setEmoji(existing?.emoji || '🍽️');
    setEditingDate(dateStr);
  }

  // Dager med en middag allerede satt åpner den store oppskriftsvisningen;
  // tomme dager går rett til hurtig-legg-til-skjemaet, samme som før.
  function openDay(dateStr) {
    if (plans[dateStr]) setRecipeFor(dateStr);
    else openEdit(dateStr);
  }

  async function save() {
    if (!title.trim()) return;
    if (saving) return; setSaving(true);
    try { await api.post('/dinner-plans', { date: editingDate, title: title.trim(), emoji }); setEditingDate(null); setError(''); loadPlans(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function remove(dateStr) {
    await api.delete(`/dinner-plans/${dateStr}`).catch(() => {});
  }

  const [today, tomorrow, ...rest] = days;
  const todayPlan = plans[toDateStr(today)];
  const tomorrowPlan = plans[toDateStr(tomorrow)];

  return (
    <section className="panel panel-dinner">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🍽️</span> Middag
        </div>
        <button className="dinner-plan-week-btn" onClick={() => openPanel('dinner-planner')}>
          Ukemeny →
        </button>
      </div>
      <div className="panel-body dinner-body">
        {error && <p role="alert">{error}</p>}
        {editingDate ? (
          <div className="dinner-edit-form">
            <div className="dinner-edit-title">
              {editingDate === toDateStr(today) ? 'I dag' : editingDate}
            </div>
            <div className="dinner-edit-row">
              <input
                type="text"
                className="dinner-emoji-input"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
              />
              <input
                type="text"
                placeholder="Hva blir det til middag?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="dinner-edit-actions">
              <button className="btn" onClick={() => setEditingDate(null)}>
                Avbryt
              </button>
              <button className="btn btn-accent" onClick={save} disabled={saving}>
                Lagre
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className="dinner-today" onClick={() => openDay(toDateStr(today))}>
              <span className="dinner-today-label">I dag</span>
              {todayPlan ? (
                <>
                  <span className="dinner-today-emoji">{todayPlan.emoji || '🍽️'}</span>
                  <span className="dinner-today-title">{todayPlan.title}</span>
                </>
              ) : (
                <span className="dinner-today-empty">+ Legg til middag</span>
              )}
            </button>

            <div className="dinner-upcoming-label">Kommende</div>
            <div className="dinner-upcoming-list">
              <DinnerUpcomingRow
                label="I morgen"
                dateStr={toDateStr(tomorrow)}
                plan={tomorrowPlan}
                onOpen={openDay}
                onRemove={remove}
              />
              {!compact && rest.map((d) => (
                <DinnerUpcomingRow
                  key={toDateStr(d)}
                  label={DAY_LABELS[d.getDay()]}
                  dateStr={toDateStr(d)}
                  plan={plans[toDateStr(d)]}
                  onOpen={openDay}
                  onRemove={remove}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {recipeFor && plans[recipeFor] && (
        <DinnerRecipeModal
          plan={plans[recipeFor]}
          onClose={() => setRecipeFor(null)}
          onEdit={() => {
            const date = recipeFor;
            setRecipeFor(null);
            openEdit(date);
          }}
        />
      )}
    </section>
  );
}

function DinnerUpcomingRow({ label, dateStr, plan, onOpen, onRemove }) {
  return (
    <div className="dinner-upcoming-row" onClick={() => onOpen(dateStr)}>
      <span className="dinner-upcoming-day">{label}</span>
      {plan ? (
        <span className="dinner-upcoming-title">
          {plan.emoji} {plan.title}
        </span>
      ) : (
        <span className="dinner-upcoming-empty">–</span>
      )}
      {plan && (
        <button
          className="dinner-upcoming-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(dateStr);
          }}
          aria-label="Fjern"
        >
          ✕
        </button>
      )}
    </div>
  );
}
