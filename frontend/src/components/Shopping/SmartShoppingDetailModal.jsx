import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './SmartShoppingDetailModal.css';

function formatPrice(n) {
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SmartShoppingDetailModal({ item, onClose, onLocked }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [locking, setLocking] = useState(null);

  useEffect(() => {
    api
      .get(`/smart-shopping/items/${item.id}`)
      .then((data) => setMatches(data.matches))
      .catch((err) => setError(err.message));
  }, [item.id]);

  async function lockToProduct(match) {
    setLocking(match.id);
    try {
      const data = await api.post(`/smart-shopping/items/${item.id}/lock`, {
        ean: match.ean,
        productName: match.product_name,
      });
      setMatches(data.matches);
      onLocked?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLocking(null);
    }
  }

  return (
    <div className="smart-shopping-overlay" onClick={onClose}>
      <div className="smart-shopping-modal" onClick={(e) => e.stopPropagation()}>
        <button className="smart-shopping-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="smart-shopping-modal-title">{item.name}</div>

        {error && <div className="smart-shopping-error">{error}</div>}
        {!matches && !error && <div className="empty-hint">Henter priser…</div>}
        {matches && matches.length === 0 && (
          <div className="empty-hint">Fant ingen produkttreff for denne varen.</div>
        )}

        <div className="smart-shopping-match-list">
          {matches?.map((match) => (
            <div key={match.id} className="smart-shopping-match">
              <div className="smart-shopping-match-header">
                <div className="smart-shopping-match-image">
                  {match.image_url ? <img src={match.image_url} alt="" /> : <span>🛒</span>}
                </div>
                <div className="smart-shopping-match-name">{match.product_name}</div>
                <button
                  className="btn btn-accent smart-shopping-lock-btn"
                  onClick={() => lockToProduct(match)}
                  disabled={locking === match.id}
                >
                  {locking === match.id ? 'Lagrer…' : 'Dette mener jeg'}
                </button>
              </div>
              <div className="smart-shopping-price-list">
                {match.prices.map((p) => (
                  <div key={p.store_name} className="smart-shopping-price-row">
                    <span className="smart-shopping-store-name">{p.store_name}</span>
                    {p.is_offer && <span className="smart-shopping-badge">TILBUD</span>}
                    <span className="smart-shopping-price">{formatPrice(p.price)} kr</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
