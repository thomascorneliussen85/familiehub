import { useState } from 'react';
import { BOARD_SIZE, LADDERS, SNAKES, buildGrid, squarePositions, applyRoll } from './snakesLaddersLogic';
import './SnakesAndLadders.css';

const GRID = buildGrid();
const POSITIONS = squarePositions();

function cellCenter([row, col]) {
  return { x: (col + 0.5) * 10, y: (row + 0.5) * 10 };
}

export default function SnakesAndLadders({ players, onGameEnd }) {
  const [positions, setPositions] = useState(() => players.map(() => 0));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dieValue, setDieValue] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');

  function rollDie() {
    if (rolling) return;
    setRolling(true);
    const die = 1 + Math.floor(Math.random() * 6);
    setDieValue(die);

    const result = applyRoll(positions[currentIdx], die);
    setTimeout(() => {
      if (!result.moved) {
        setMessage(`For høyt kast (${positions[currentIdx]} + ${die} > 100) – prøv igjen neste runde`);
      } else {
        setMessage('');
        const next = positions.slice();
        next[currentIdx] = result.position;
        setPositions(next);
        if (result.ladder) {
          setToast('🪜 Stige! Opp til ' + result.position);
        } else if (result.snake) {
          setToast('🐍 Slange! Ned til ' + result.position);
        }
        if (result.ladder || result.snake) setTimeout(() => setToast(''), 2000);

        if (result.won) {
          const results = players.map((_, i) => ({ playerIndex: i, placement: i === currentIdx ? 1 : 2 }));
          setTimeout(() => onGameEnd(results), 1200);
          setRolling(false);
          return;
        }
      }
      setCurrentIdx((i) => (i + 1) % players.length);
      setDieValue(null);
      setRolling(false);
    }, 500);
  }

  const current = players[currentIdx];

  return (
    <div className="sl-wrap">
      <div className="sl-turn-banner" style={{ borderLeftColor: current.color }}>
        <span className="sl-turn-avatar">{current.avatar}</span>
        {current.name} sin tur
        {message && <span className="sl-turn-message">{message}</span>}
      </div>

      <div className="sl-play-row">
        <div className="sl-board-wrap">
          <div className="sl-board">
            {GRID.map((row, r) =>
              row.map((num, c) => (
                <div key={num} className="sl-cell" style={{ gridRow: r + 1, gridColumn: c + 1 }}>
                  <span className="sl-cell-num">{num}</span>
                  {LADDERS[num] && <span className="sl-cell-marker">🪜</span>}
                  {SNAKES[num] && <span className="sl-cell-marker">🐍</span>}
                </div>
              ))
            )}
            <svg className="sl-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              {Object.entries(LADDERS).map(([start, end]) => {
                const a = cellCenter(POSITIONS.get(Number(start)));
                const b = cellCenter(POSITIONS.get(Number(end)));
                return <line key={`l-${start}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sl-line sl-line-ladder" />;
              })}
              {Object.entries(SNAKES).map(([start, end]) => {
                const a = cellCenter(POSITIONS.get(Number(start)));
                const b = cellCenter(POSITIONS.get(Number(end)));
                return <line key={`s-${start}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sl-line sl-line-snake" />;
              })}
            </svg>
            {players.map((p, i) => {
              if (positions[i] === 0) return null;
              const { x, y } = cellCenter(POSITIONS.get(positions[i]));
              return (
                <div
                  key={i}
                  className="sl-token"
                  style={{ left: `${x}%`, top: `${y}%`, background: p.color, '--nudge': i }}
                  aria-label={`${p.name} sin brikke`}
                />
              );
            })}
          </div>
        </div>

        <div className="sl-side">
          {players.map((p, i) => (
            <div key={i} className={`sl-player-chip ${i === currentIdx ? 'sl-player-chip-active' : ''}`} style={{ borderColor: p.color }}>
              {p.avatar} {p.name}
              <span className="sl-position">{positions[i]}/{BOARD_SIZE}</span>
            </div>
          ))}
          <button className="btn btn-accent sl-die-btn" onClick={rollDie} disabled={rolling}>
            🎲 {dieValue ?? 'Kast terning'}
          </button>
        </div>
      </div>

      {toast && <div className="sl-toast">{toast}</div>}
    </div>
  );
}
