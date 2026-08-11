import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import SmartShoppingDetailModal from './SmartShoppingDetailModal';
import './ShoppingPanel.css';

function formatPrice(n) {
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 0 });
}

export default function ShoppingPanel() {
  const [items, setItems] = useState([]);
  const [quickItems, setQuickItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [priceCheck, setPriceCheck] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  function loadPriceCheck() {
    api.get('/smart-shopping/price-check').then(setPriceCheck).catch(() => {});
  }

  useEffect(() => {
    api.get('/shopping').then(setItems).catch(() => {});
    api.get('/shopping/quick-items').then(setQuickItems).catch(() => {});
    loadPriceCheck();

    function onUpdate(updated) {
      setItems(updated);
    }
    socket.on('shopping:update', onUpdate);
    socket.on('smart-shopping:update', loadPriceCheck);
    return () => {
      socket.off('shopping:update', onUpdate);
      socket.off('smart-shopping:update', loadPriceCheck);
    };
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
          </div>
        )}
        {priceCheck?.enabled && priceCheck.stores.length === 0 && priceCheck.totalLines > 0 && (
          <div className="smart-shopping-unavailable">Prissjekk utilgjengelig</div>
        )}

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
