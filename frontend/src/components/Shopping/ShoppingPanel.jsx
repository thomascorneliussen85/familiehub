import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import SmartShoppingDetailModal from './SmartShoppingDetailModal';
import './ShoppingPanel.css';

function formatPrice(n) {
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 0 });
}

const AUTOCOMPLETE_DEBOUNCE_MS = 400;
const AUTOCOMPLETE_MIN_CHARS = 3;

export default function ShoppingPanel() {
  const [items, setItems] = useState([]);
  const [quickItems, setQuickItems] = useState([]);
  const [quickPicks, setQuickPicks] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [priceCheck, setPriceCheck] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [suggestions, setSuggestions] = useState(null); // { history: [], suggestions: [] }
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  function loadPriceCheck() {
    api.get('/smart-shopping/price-check').then(setPriceCheck).catch(() => {});
  }
  function loadQuickPicks() {
    api.get('/smart-shopping/quick-picks').then(setQuickPicks).catch(() => {});
  }

  useEffect(() => {
    api.get('/shopping').then(setItems).catch(() => {});
    api.get('/shopping/quick-items').then(setQuickItems).catch(() => {});
    loadPriceCheck();
    loadQuickPicks();

    function onUpdate(updated) {
      setItems(updated);
    }
    function onSmartUpdate() {
      loadPriceCheck();
      loadQuickPicks();
    }
    socket.on('shopping:update', onUpdate);
    socket.on('smart-shopping:update', onSmartUpdate);
    return () => {
      socket.off('shopping:update', onUpdate);
      socket.off('smart-shopping:update', onSmartUpdate);
    };
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const text = newItem.trim();
    if (text.length < AUTOCOMPLETE_MIN_CHARS) {
      setSuggestions(null);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/smart-shopping/autocomplete?q=${encodeURIComponent(text)}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          // stille feil – autocomplete er en bonus, ikke kjernefunksjon
        }
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [newItem]);

  async function addItem(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setNewItem('');
    setSuggestions(null);
    setShowSuggestions(false);
    await api.post('/shopping', { name: trimmed }).catch(() => {});
  }

  async function chooseSuggestion(searchTerm, ean, name) {
    setNewItem('');
    setSuggestions(null);
    setShowSuggestions(false);
    await api.post('/smart-shopping/choose', { searchTerm, ean, name }).catch(() => {});
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
        {priceCheck?.enabled && priceCheck.stores.length > 0 && (
          <div className="smart-shopping-banner">
            <span className="smart-shopping-banner-text">
              Billigst denne uken: <strong>{priceCheck.cheapest3[0]}</strong> – ca. {formatPrice(priceCheck.stores[0].total)} kr
              {priceCheck.savingsVsMostExpensive > 0 && (
                <> (sparer {formatPrice(priceCheck.savingsVsMostExpensive)} kr mot dyreste)</>
              )}
            </span>
            {!priceCheck.configured && <span className="smart-shopping-demo-tag">DEMO</span>}
            <span className="smart-shopping-cheapest-list">
              {priceCheck.stores.slice(0, 3).map((s) => (
                <span key={s.store} className="smart-shopping-cheapest-item">
                  {s.store}: {formatPrice(s.total)} kr
                </span>
              ))}
            </span>
            {priceCheck.uncertainLines > 0 && (
              <span className="smart-shopping-uncertain">
                {priceCheck.uncertainLines} {priceCheck.uncertainLines === 1 ? 'vare er' : 'varer er'} ikke presisert
              </span>
            )}
          </div>
        )}
        {priceCheck?.enabled && priceCheck.stores.length === 0 && priceCheck.totalLines > 0 && (
          <div className="smart-shopping-unavailable">Prissjekk utilgjengelig</div>
        )}

        {quickPicks.length > 0 && (
          <div className="smart-shopping-quickpicks">
            {quickPicks.map((q) => (
              <button
                key={q.id}
                className="smart-shopping-quickpick"
                onClick={() => chooseSuggestion(q.search_term, q.chosen_ean, q.chosen_name)}
              >
                <span className="smart-shopping-quickpick-name">{q.chosen_name}</span>
              </button>
            ))}
          </div>
        )}

        <form
          className="shopping-add-form shopping-add-form-autocomplete"
          onSubmit={(e) => {
            e.preventDefault();
            addItem(newItem);
          }}
        >
          <div className="shopping-add-input-wrap">
            <input
              type="text"
              placeholder="Legg til vare…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onFocus={() => suggestions && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoComplete="off"
            />
            {showSuggestions && suggestions && (suggestions.history.length > 0 || suggestions.suggestions.length > 0) && (
              <div className="shopping-autocomplete-dropdown">
                {suggestions.history.map((h) => (
                  <button
                    key={`h-${h.id}`}
                    type="button"
                    className="shopping-autocomplete-row"
                    onMouseDown={() => chooseSuggestion(newItem, h.chosen_ean, h.chosen_name)}
                  >
                    <span className="shopping-autocomplete-star">★</span>
                    <span className="shopping-autocomplete-name">{h.chosen_name}</span>
                  </button>
                ))}
                {suggestions.suggestions.map((s) => (
                  <button
                    key={s.ean}
                    type="button"
                    className="shopping-autocomplete-row"
                    onMouseDown={() => chooseSuggestion(newItem, s.ean, s.name)}
                  >
                    <span className="shopping-autocomplete-image">
                      {s.image ? <img src={s.image} alt="" /> : <span>🛒</span>}
                    </span>
                    <span className="shopping-autocomplete-name">{s.name}</span>
                    {s.lowestPrice != null && (
                      <span className="shopping-autocomplete-price">fra {formatPrice(s.lowestPrice)} kr</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          {items.map((item) => {
            const badge = priceCheck?.itemBadges?.[item.id];
            return (
              <li
                key={item.id}
                className={`shopping-item ${item.checked ? 'shopping-item-checked' : ''}`}
                onClick={() => toggle(item.id)}
              >
                <span className="shopping-checkbox">{item.checked ? '✔' : ''}</span>
                <span className="shopping-name">{item.name}</span>
                {badge && !item.checked && (
                  <button
                    className="shopping-price-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailItem(item);
                    }}
                  >
                    {badge.isOffer && <span className="smart-shopping-badge">TILBUD</span>}
                    {formatPrice(badge.price)} kr på {badge.storeName}
                  </button>
                )}
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
            );
          })}
        </ul>
      </div>
      {detailItem && (
        <SmartShoppingDetailModal item={detailItem} onClose={() => setDetailItem(null)} onLocked={loadPriceCheck} />
      )}
    </section>
  );
}
