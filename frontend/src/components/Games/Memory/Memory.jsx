import { useEffect, useState } from 'react';
import { createDeck, isMatch, allMatched } from './memoryLogic';
import './Memory.css';

const PAIR_COUNT = 8;
const EMOJI_FACES = ['🍎', '🐶', '🚀', '🎈', '⚽', '🌈', '🎸', '🦋'];
const MATCH_DELAY_MS = 600;
const MISMATCH_DELAY_MS = 900;
const RESULT_DELAY_MS = 900;

// Bruker ekte familiebilder som kortmotiv hvis familien har nok av dem (samme
// /api/photos som fotorammen), ellers enkle emoji – akkurat som foreslått i
// oppdraget, "for et ekstra personlig touch" der det finnes bilder.
export default function Memory({ players, onGameEnd }) {
  const [faces, setFaces] = useState(null); // null = ikke lastet ennå, array = klar

  useEffect(() => {
    fetch('/api/photos', { credentials: 'include' })
      .then((r) => r.json())
      .then((photos) => {
        if (photos.length >= PAIR_COUNT) {
          const shuffled = photos.slice().sort(() => Math.random() - 0.5);
          setFaces(shuffled.slice(0, PAIR_COUNT).map((p) => ({ type: 'photo', url: p.url })));
        } else {
          setFaces(EMOJI_FACES.map((e) => ({ type: 'emoji', value: e })));
        }
      })
      .catch(() => setFaces(EMOJI_FACES.map((e) => ({ type: 'emoji', value: e }))));
  }, []);

  const [deck, setDeck] = useState(() => createDeck(PAIR_COUNT));
  const [flipped, setFlipped] = useState([]);
  const [busy, setBusy] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState(() => players.map(() => 0));

  function flipCard(index) {
    if (busy || flipped.includes(index) || deck[index].matched || flipped.length === 2) return;
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;

    setBusy(true);
    const [a, b] = next;
    if (isMatch(deck, a, b)) {
      setTimeout(() => {
        const newDeck = deck.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
        setDeck(newDeck);
        setFlipped([]);
        setBusy(false);
        const newScores = scores.map((s, i) => (i === currentIdx ? s + 1 : s));
        setScores(newScores);
        if (allMatched(newDeck)) {
          const maxScore = Math.max(...newScores);
          const results = players.map((_, i) => ({
            playerIndex: i,
            placement: newScores[i] === maxScore ? 1 : 2,
            score: newScores[i],
          }));
          setTimeout(() => onGameEnd(results), RESULT_DELAY_MS);
        }
        // Match -> samme spiller går igjen (currentIdx endres ikke).
      }, MATCH_DELAY_MS);
    } else {
      setTimeout(() => {
        setFlipped([]);
        setBusy(false);
        setCurrentIdx((i) => (i + 1) % players.length);
      }, MISMATCH_DELAY_MS);
    }
  }

  const current = players[currentIdx];

  if (!faces) return null;

  return (
    <div className="mem-wrap">
      <div className="mem-turn-banner" style={{ borderLeftColor: current.color }}>
        <span>{current.avatar} {current.name} sin tur</span>
        <div className="mem-scores">
          {players.map((p, i) => (
            <span key={i} className={`mem-score-chip ${i === currentIdx ? 'mem-score-chip-active' : ''}`} style={{ borderColor: p.color }}>
              {p.avatar} {scores[i]}
            </span>
          ))}
        </div>
      </div>

      <div className="mem-grid">
        {deck.map((card, i) => {
          const isFaceUp = card.matched || flipped.includes(i);
          const face = faces[card.pairId];
          return (
            <button
              key={card.id}
              className={`mem-card ${isFaceUp ? 'mem-card-flipped' : ''} ${card.matched ? 'mem-card-matched' : ''}`}
              onClick={() => flipCard(i)}
              disabled={isFaceUp}
              aria-label={isFaceUp ? 'Kort snudd' : 'Snu kort'}
            >
              <span className="mem-card-inner">
                <span className="mem-card-back">?</span>
                <span className="mem-card-front">
                  {face.type === 'photo' ? <img src={face.url} alt="" /> : face.value}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
