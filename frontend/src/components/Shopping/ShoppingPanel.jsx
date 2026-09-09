import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './ShoppingPanel.css';
import { groceryCategory } from '../../lib/groceries';

export default function ShoppingPanel() {
  const [items, setItems] = useState([]);
  const [quickItems, setQuickItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/shopping').then(data => { setItems(data); setError(''); }).catch(() => setError('Kunne ikke hente handlelisten. Prøv å åpne siden igjen.')).finally(() => setLoading(false));
    api.get('/shopping/quick-items').then(setQuickItems).catch(() => {});

    function onUpdate(updated) {
      setItems(updated);
      setError(''); setLoading(false);
    }
    socket.on('shopping:update', onUpdate);
    return () => socket.off('shopping:update', onUpdate);
  }, []);

  async function addItem(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (busy) return;
    setBusy(true);
    try { setItems(await api.post('/shopping', { name: trimmed })); setNewItem(value => value.trim() === trimmed ? '' : value); setError(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function toggle(id) {
    if (busy) return;
    setBusy(true);
    try { setItems(await api.patch(`/shopping/${id}/toggle`)); setError(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function remove(id) {
    try { await api.delete(`/shopping/${id}`); setItems(await api.get('/shopping')); } catch (err) { setError(err.message); }
  }

  async function clearChecked() {
    try { await api.delete('/shopping'); setItems(await api.get('/shopping')); } catch (err) { setError(err.message); }
  }

  const uncheckedCount = items.filter((i) => !i.checked).length;

  return (
    <section className="panel panel-shopping">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🛒</span> Handleliste
          {uncheckedCount > 0 && <span className="shopping-count">{uncheckedCount}</span>}
        </div>
        {items.some((i) => i.checked) && (
          <button className="btn btn-icon" onClick={clearChecked} aria-label="Tøm avkryssede">
            🧹
          </button>
        )}
      </div>
      <div className="panel-body">
        <form
          className="shopping-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addItem(newItem);
          }}
        >
          <input
            type="text"
            placeholder="Legg til vare…"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-accent" disabled={busy}>
            Legg til
          </button>
        </form>

        <div className="quick-items">
          {quickItems.map((q) => (
            <button key={q.id} className="quick-item" onClick={() => addItem(q.name)}>
              <span>{q.icon}</span> {q.name}
            </button>
          ))}
        </div>

        {error && <p role="alert">{error}</p>}
        {loading ? <p role="status">Henter handleliste…</p> : !error && items.length === 0 && <div className="empty-hint">Handlelisten er tom</div>}

        <ul className="shopping-list">
          {[...new Set(items.map(item => item.checked ? 'Kjøpt' : groceryCategory(item.name)))].sort((a, b) => a === 'Kjøpt' ? 1 : b === 'Kjøpt' ? -1 : a.localeCompare(b, 'nb')).map(category => <li key={category} className="shopping-group"><h3>{category}</h3><ul className="shopping-list">{items.filter(item => (item.checked ? 'Kjøpt' : groceryCategory(item.name)) === category).map((item) => (
            <li
              key={item.id}
              className={`shopping-item ${item.checked ? 'shopping-item-checked' : ''}`}
            >
              <input type="checkbox" className="shopping-checkbox" checked={Boolean(item.checked)} onChange={() => toggle(item.id)} disabled={busy} aria-label={`Kjøpt ${item.name}`} />
              <span className="shopping-name">{item.name}</span>
              <button
                className="shopping-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(item.id);
                }}
                aria-label="Fjern"
              >
                ✕
              </button>
            </li>
          ))}</ul></li>)}
        </ul>
      </div>
    </section>
  );
}
