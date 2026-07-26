import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './ShoppingPanel.css';

export default function ShoppingPanel() {
  const [items, setItems] = useState([]);
  const [quickItems, setQuickItems] = useState([]);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    api.get('/shopping').then(setItems).catch(() => {});
    api.get('/shopping/quick-items').then(setQuickItems).catch(() => {});

    function onUpdate(updated) {
      setItems(updated);
    }
    socket.on('shopping:update', onUpdate);
    return () => socket.off('shopping:update', onUpdate);
  }, []);

  async function addItem(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setNewItem('');
    await api.post('/shopping', { name: trimmed }).catch(() => {});
  }

  async function toggle(id) {
    await api.patch(`/shopping/${id}/toggle`).catch(() => {});
  }

  async function remove(id) {
    await api.delete(`/shopping/${id}`).catch(() => {});
  }

  async function clearChecked() {
    await api.delete('/shopping').catch(() => {});
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
          />
          <button type="submit" className="btn btn-accent">
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

        {items.length === 0 && <div className="empty-hint">Handlelisten er tom</div>}

        <ul className="shopping-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`shopping-item ${item.checked ? 'shopping-item-checked' : ''}`}
              onClick={() => toggle(item.id)}
            >
              <span className="shopping-checkbox">{item.checked ? '✔' : ''}</span>
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
          ))}
        </ul>
      </div>
    </section>
  );
}
