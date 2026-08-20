import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './DinnerLibraryModal.css';

export default function DinnerLibraryModal({ onSelect, onClose }) {
  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('🍽️');
  const [error, setError] = useState('');

  function load() {
    api.get('/dinner-plans/library').then(setRecipes).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = recipes.filter((r) => r.title.toLowerCase().includes(search.trim().toLowerCase()));

  async function addToLibrary(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      await api.post('/dinner-plans/library', { title, emoji: newEmoji || '🍽️' });
      setNewTitle('');
      setNewEmoji('🍽️');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeFromLibrary(id, e) {
    e.stopPropagation();
    await api.delete(`/dinner-plans/library/${id}`).catch(() => {});
    load();
  }

  return (
    <div className="dinner-library-overlay" onClick={onClose}>
      <div className="dinner-library-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dinner-library-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="dinner-library-title">Velg middag</div>

        <input
          type="text"
          className="dinner-library-search"
          placeholder="Søk…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="dinner-library-grid">
          {filtered.map((r) => (
            <button key={r.id} className="dinner-library-item" onClick={() => onSelect(r)}>
              <span className="dinner-library-item-emoji">{r.emoji || '🍽️'}</span>
              <span className="dinner-library-item-title">{r.title}</span>
              <span
                className="dinner-library-item-remove"
                onClick={(e) => removeFromLibrary(r.id, e)}
                aria-label={`Fjern ${r.title} fra listen`}
              >
                ✕
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty-hint">Ingen treff</div>}
        </div>

        {error && <div className="dinner-library-error">{error}</div>}

        <form className="dinner-library-add-form" onSubmit={addToLibrary}>
          <input
            type="text"
            className="dinner-library-emoji-input"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
          />
          <input
            type="text"
            placeholder="Legg til en egen rett i listen…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="btn btn-accent">
            Legg til
          </button>
        </form>
      </div>
    </div>
  );
}
