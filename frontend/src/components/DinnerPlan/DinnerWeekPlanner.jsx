import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './DinnerWeekPlanner.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function startOfWeek(date) {
  const d = new Date(date);
  const idx = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idx);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function toDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function weekLabel(offset, weekStart) {
  if (offset === 0) return 'Denne uken';
  if (offset === 1) return 'Neste uke';
  if (offset === -1) return 'Forrige uke';
  const end = addDays(weekStart, 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(weekStart)}–${fmt(end)}`;
}

const emptyForm = { title: '', emoji: '🍽️', description: '', ingredientsText: '' };

export default function DinnerWeekPlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [plans, setPlans] = useState({});
  const [editingDate, setEditingDate] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [addingIngredients, setAddingIngredients] = useState(false);
  const [addedMessage, setAddedMessage] = useState('');

  const thisWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekStart = useMemo(() => addDays(thisWeekStart, weekOffset * 7), [thisWeekStart, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const fromStr = toDateStr(days[0]);
  const toStr = toDateStr(days[6]);

  function loadPlans() {
    api
      .get(`/dinner-plans?from=${fromStr}&to=${toStr}`)
      .then((list) => {
        const byDate = {};
        list.forEach((p) => {
          byDate[p.date] = p;
        });
        setPlans(byDate);
      })
      .catch(() => {});
  }

  function loadSuggestions() {
    api
      .get(`/dinner-plans/shopping-suggestions?from=${fromStr}&to=${toStr}`)
      .then((list) => {
        setSuggestions(list);
        setChecked(new Set(list));
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadPlans();
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStr, toStr]);

  useEffect(() => {
    function onUpdate() {
      loadPlans();
      loadSuggestions();
    }
    socket.on('dinner-plans:update', onUpdate);
    return () => socket.off('dinner-plans:update', onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStr, toStr]);

  async function planWeek() {
    setPlanning(true);
    setPlanError('');
    try {
      await api.post('/dinner-plans/plan-week', { startDate: fromStr });
      loadPlans();
      loadSuggestions();
    } catch (err) {
      setPlanError(err.message || 'Klarte ikke å generere ukemeny');
    } finally {
      setPlanning(false);
    }
  }

  function openEdit(dateStr) {
    const existing = plans[dateStr];
    setForm({
      title: existing?.title || '',
      emoji: existing?.emoji || '🍽️',
      description: existing?.description || '',
      ingredientsText: (existing?.ingredients || []).join('\n'),
    });
    setEditingDate(dateStr);
  }

  async function saveEdit() {
    const title = form.title.trim();
    if (!title) return;
    const ingredients = form.ingredientsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await api
      .post('/dinner-plans', {
        date: editingDate,
        title,
        emoji: form.emoji || '🍽️',
        description: form.description.trim() || null,
        ingredients,
      })
      .catch(() => {});
    setEditingDate(null);
    loadPlans();
    loadSuggestions();
  }

  async function removePlan(dateStr, e) {
    e.stopPropagation();
    await api.delete(`/dinner-plans/${dateStr}`).catch(() => {});
  }

  function toggleSuggestion(text) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) => (prev.size === suggestions.length ? new Set() : new Set(suggestions)));
  }

  async function addSelectedToShopping() {
    const items = Array.from(checked);
    if (items.length === 0) return;
    setAddingIngredients(true);
    setAddedMessage('');
    try {
      const result = await api.post('/dinner-plans/add-ingredients-to-shopping', { items });
      setAddedMessage(
        result.added > 0
          ? `${result.added} vare${result.added === 1 ? '' : 'r'} lagt til i handlelisten ✓`
          : 'Alt var allerede i handlelisten'
      );
      setTimeout(() => setAddedMessage(''), 5000);
    } catch (err) {
      setAddedMessage(err.message || 'Noe gikk galt');
    } finally {
      setAddingIngredients(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section className="panel panel-dinner-planner">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🍽️</span> Middagsplanlegger
        </div>
        <button className="btn btn-accent dinner-planner-plan-btn" onClick={planWeek} disabled={planning}>
          {planning ? '⏳ Lager forslag …' : '✨ Planlegg denne uken'}
        </button>
      </div>
      <div className="panel-body dinner-planner-body">
        {planError && <div className="dinner-planner-error">{planError}</div>}

        <div className="dinner-planner-nav">
          <button className="dinner-planner-nav-btn" onClick={() => setWeekOffset((o) => o - 1)} aria-label="Forrige uke">
            ‹
          </button>
          <span className="dinner-planner-nav-label">{weekLabel(weekOffset, weekStart)}</span>
          <button className="dinner-planner-nav-btn" onClick={() => setWeekOffset((o) => o + 1)} aria-label="Neste uke">
            ›
          </button>
          {weekOffset !== 0 && (
            <button className="dinner-planner-today-btn" onClick={() => setWeekOffset(0)}>
              I dag
            </button>
          )}
        </div>

        <div className="dinner-planner-grid">
          {days.map((day, i) => {
            const dateStr = toDateStr(day);
            const plan = plans[dateStr];
            const isToday = day.getTime() === today.getTime();
            const isEditing = editingDate === dateStr;
            return (
              <div key={dateStr} className={`dinner-planner-card ${isToday ? 'dinner-planner-card-today' : ''}`}>
                <div className="dinner-planner-card-header">
                  <span>{DAY_LABELS[i]}</span>
                  <span className="dinner-planner-card-daynum">{day.getDate()}</span>
                </div>

                {isEditing ? (
                  <div className="dinner-planner-edit-form">
                    <div className="dinner-planner-edit-row">
                      <input
                        type="text"
                        className="dinner-planner-emoji-input"
                        value={form.emoji}
                        onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Rett…"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        autoFocus
                      />
                    </div>
                    <textarea
                      className="dinner-planner-desc-input"
                      placeholder="Kort beskrivelse (valgfritt)…"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                    />
                    <textarea
                      className="dinner-planner-ingredients-input"
                      placeholder={'Ingredienser, én per linje…\nf.eks. 500 g kjøttdeig'}
                      value={form.ingredientsText}
                      onChange={(e) => setForm((f) => ({ ...f, ingredientsText: e.target.value }))}
                      rows={4}
                    />
                    <div className="dinner-planner-edit-actions">
                      <button className="btn" onClick={() => setEditingDate(null)}>
                        Avbryt
                      </button>
                      <button className="btn btn-accent" onClick={saveEdit}>
                        Lagre
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="dinner-planner-card-body" onClick={() => openEdit(dateStr)}>
                    {plan ? (
                      <>
                        {plan.photo_url ? (
                          <img className="dinner-planner-photo" src={plan.photo_url} alt="" />
                        ) : (
                          <div className="dinner-planner-photo-placeholder">{plan.emoji || '🍽️'}</div>
                        )}
                        <span className="dinner-planner-card-title">{plan.title}</span>
                        {plan.description && <span className="dinner-planner-card-desc">{plan.description}</span>}
                        <span className="dinner-planner-card-remove" onClick={(e) => removePlan(dateStr, e)} aria-label="Fjern">
                          ✕
                        </span>
                      </>
                    ) : (
                      <span className="dinner-planner-card-empty">+ Legg til</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {suggestions.length > 0 && (
          <div className="dinner-planner-suggestions">
            <div className="dinner-planner-suggestions-header">
              <span>Handlelisteforslag fra ukemenyen ({suggestions.length})</span>
              <button className="dinner-planner-toggle-all" onClick={toggleAll}>
                {checked.size === suggestions.length ? 'Fjern alle' : 'Velg alle'}
              </button>
            </div>
            <div className="dinner-planner-suggestions-list">
              {suggestions.map((text) => (
                <label key={text} className="dinner-planner-suggestion-item">
                  <input type="checkbox" checked={checked.has(text)} onChange={() => toggleSuggestion(text)} />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            <div className="dinner-planner-suggestions-footer">
              {addedMessage && <span className="dinner-planner-added-message">{addedMessage}</span>}
              <button
                className="btn btn-accent"
                onClick={addSelectedToShopping}
                disabled={addingIngredients || checked.size === 0}
              >
                {addingIngredients
                  ? 'Legger til …'
                  : `Legg til ${checked.size} vare${checked.size === 1 ? '' : 'r'} i handlelisten`}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
