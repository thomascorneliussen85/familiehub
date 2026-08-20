import { useState } from 'react';
import { api } from '../../lib/api';
import './DinnerRecipeModal.css';

export default function DinnerRecipeModal({ plan, onClose, onEdit }) {
  const [current, setCurrent] = useState(plan);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const hasRecipe = current.ingredients.length > 0 || current.instructions.length > 0;

  async function generateRecipe() {
    setGenerating(true);
    setError('');
    try {
      const updated = await api.post(`/dinner-plans/${current.date}/generate-recipe`);
      setCurrent(updated);
    } catch (err) {
      setError(err.message || 'Klarte ikke å lage oppskrift');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="dinner-recipe-overlay" onClick={onClose}>
      <div className="dinner-recipe-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dinner-recipe-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>

        {current.photo_url ? (
          <img className="dinner-recipe-photo" src={current.photo_url} alt="" />
        ) : (
          <div className="dinner-recipe-photo-placeholder">{current.emoji || '🍽️'}</div>
        )}

        <div className="dinner-recipe-body">
          <div className="dinner-recipe-title">
            {current.emoji} {current.title}
          </div>
          {current.description && <div className="dinner-recipe-desc">{current.description}</div>}

          {hasRecipe ? (
            <div className="dinner-recipe-sections">
              {current.ingredients.length > 0 && (
                <div className="dinner-recipe-section">
                  <div className="dinner-recipe-section-title">Ingredienser</div>
                  <ul className="dinner-recipe-ingredients">
                    {current.ingredients.map((ing, i) => (
                      <li key={i}>{ing}</li>
                    ))}
                  </ul>
                </div>
              )}
              {current.instructions.length > 0 && (
                <div className="dinner-recipe-section">
                  <div className="dinner-recipe-section-title">Fremgangsmåte</div>
                  <ol className="dinner-recipe-instructions">
                    {current.instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="dinner-recipe-empty">
              <p className="empty-hint">Ingen oppskrift lagt inn ennå.</p>
              <button className="btn btn-accent" onClick={generateRecipe} disabled={generating}>
                {generating ? '⏳ Lager oppskrift …' : '🪄 Generer oppskrift med AI'}
              </button>
            </div>
          )}

          {error && <div className="dinner-recipe-error">{error}</div>}

          <div className="dinner-recipe-actions">
            {hasRecipe && (
              <button className="btn" onClick={generateRecipe} disabled={generating}>
                {generating ? '⏳ Lager på nytt …' : '🪄 Lag oppskrift på nytt'}
              </button>
            )}
            <button className="btn btn-accent" onClick={onEdit}>
              ✏️ Rediger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
