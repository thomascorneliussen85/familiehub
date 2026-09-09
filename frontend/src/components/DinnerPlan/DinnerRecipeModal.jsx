import { useState } from 'react';
import { api } from '../../lib/api';
import './DinnerRecipeModal.css';
import { scaleIngredient } from '../../lib/groceries';

export default function DinnerRecipeModal({ plan, onClose, onEdit }) {
  const [current, setCurrent] = useState(plan);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [baseServings, setBaseServings] = useState(4);
  const [servings, setServings] = useState(4);
  const [excluded, setExcluded] = useState([]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState('');
  async function addIngredients() {
    setAdding(true); setError('');
    try {
      const items = current.ingredients.filter((_, i) => !excluded.includes(i)).map(item => scaleIngredient(item, servings / baseServings));
      const result = await api.post('/dinner-plans/add-ingredients-to-shopping', { items });
      setAdded(`${result.added} varer lagt til. Varer som allerede står på listen er beholdt.`);
    } catch (err) { setError(err.message); } finally { setAdding(false); }
  }

  const hasRecipe = current.ingredients.length > 0 || current.instructions.length > 0;

  async function generateRecipe() {
    setGenerating(true);
    setError('');
    try {
      const updated = await api.post(`/dinner-plans/${current.date}/generate-recipe`);
      setCurrent(updated); setExcluded([]); setAdded('');
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
                  <div className="servings-row">
                    <label>Oppskriften er til <input type="number" min="1" max="30" value={baseServings} onChange={e => setBaseServings(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /> personer</label>
                    <label>Vi lager til <input type="number" min="1" max="30" value={servings} onChange={e => setServings(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /> personer</label>
                  </div>
                  <p className="empty-hint">Kontroller antall personer i originaloppskriften. Tallmengder justeres; fritekst må sjekkes. Fjern avkrysningen på det dere allerede har.</p>
                  <ul className="dinner-recipe-ingredients">
                    {current.ingredients.map((ing, i) => (
                      <li key={i}><label><input type="checkbox" checked={!excluded.includes(i)} onChange={() => { setExcluded(value => value.includes(i) ? value.filter(index => index !== i) : [...value, i]); setAdded(''); }} /> {scaleIngredient(ing, servings / baseServings)}</label></li>
                    ))}
                  </ul>
                  <button className="btn btn-accent" disabled={adding || excluded.length === current.ingredients.length} onClick={addIngredients}>{adding ? 'Legger til…' : 'Legg valgte varer i handlelisten'}</button>
                  {added && <p role="status">{added}</p>}
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
