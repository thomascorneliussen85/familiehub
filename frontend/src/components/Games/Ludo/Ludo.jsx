import { useState } from 'react';
import {
  COLOR_ORDER, COLOR_META, PLAYER_PATH, PATH_LENGTH, RING_LENGTH,
  getCellCoord, getAllRingCells, isSafeCell,
  getLegalTokenIndices, applyMove, createEmptyTokens,
} from './ludoLogic';
import './Ludo.css';

const RING_CELLS = getAllRingCells();

// CSS grid-linjer (1-indeksert) for de 4 gårdene i hjørnene – hver spenner
// 6x6 ruter (0-5/9-14 i 0-indeksert brett-koordinat).
const YARD_AREA = {
  red: { gridRow: '1 / 7', gridColumn: '1 / 7' },
  yellow: { gridRow: '1 / 7', gridColumn: '10 / 16' },
  blue: { gridRow: '10 / 16', gridColumn: '1 / 7' },
  green: { gridRow: '10 / 16', gridColumn: '10 / 16' },
};

export default function Ludo({ players, onGameEnd }) {
  const colorOf = (i) => COLOR_ORDER[i];
  const [tokens, setTokens] = useState(() => createEmptyTokens(players.length));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dieValue, setDieValue] = useState(null);
  const [phase, setPhase] = useState('rolling'); // 'rolling' | 'choosing'
  const [legalTokens, setLegalTokens] = useState([]);
  const [consecutiveSixes, setConsecutiveSixes] = useState(0);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');

  function rollDie() {
    if (phase !== 'rolling') return;
    const die = 1 + Math.floor(Math.random() * 6);
    setDieValue(die);
    const legal = getLegalTokenIndices(tokens[currentIdx], die);
    if (legal.length === 0) {
      setMessage('Ingen gyldige trekk 😕');
      setTimeout(() => advanceTurn(false), 1100);
      return;
    }
    if (legal.length === 1) {
      setTimeout(() => doMove(legal[0], die), 500);
    } else {
      setLegalTokens(legal);
      setPhase('choosing');
    }
  }

  function chooseToken(tokenIndex) {
    if (phase !== 'choosing' || !legalTokens.includes(tokenIndex)) return;
    doMove(tokenIndex, dieValue);
  }

  function doMove(tokenIndex, die) {
    const result = applyMove(tokens, currentIdx, tokenIndex, die, colorOf);
    setTokens(result.tokens);
    setLegalTokens([]);
    setPhase('rolling');

    if (result.captured) {
      setToast(`💥 ${players[result.captured.playerIndex].name} sin brikke ble sendt hjem!`);
      setTimeout(() => setToast(''), 2200);
    }

    if (result.allHome) {
      const results = players.map((_, i) => ({ playerIndex: i, placement: i === currentIdx ? 1 : 2 }));
      setTimeout(() => onGameEnd(results), 1200);
      return;
    }

    advanceTurn(die === 6);
  }

  function advanceTurn(gotSix) {
    setDieValue(null);
    if (gotSix && consecutiveSixes < 2) {
      setConsecutiveSixes((n) => n + 1);
      setMessage('Sekser – kast igjen!');
      return; // samme spiller kaster igjen
    }
    setMessage(gotSix ? 'Tre seksere på rad – tur tapt!' : '');
    setConsecutiveSixes(0);
    setCurrentIdx((i) => (i + 1) % players.length);
  }

  const current = players[currentIdx];

  return (
    <div className="ludo-wrap">
      <div className="ludo-turn-banner" style={{ borderLeftColor: current.color }}>
        <span className="ludo-turn-avatar">{current.avatar}</span>
        {current.name} sin tur
        {message && <span className="ludo-turn-message">{message}</span>}
      </div>

      <div className="ludo-play-row">
        <div className="ludo-board">
          {players.map((p, i) => (
            <YardQuadrant
              key={i}
              color={colorOf(i)}
              tokens={tokens[i]}
              legalTokens={i === currentIdx ? legalTokens : []}
              onPick={i === currentIdx ? chooseToken : undefined}
            />
          ))}

          {RING_CELLS.map(([r, c], idx) => (
            <div
              key={`ring-${idx}`}
              className={`ludo-cell ${isSafeCell(r, c) ? 'ludo-cell-safe' : ''}`}
              style={{ gridRow: r + 1, gridColumn: c + 1 }}
            >
              {isSafeCell(r, c) && <span className="ludo-star">★</span>}
            </div>
          ))}

          {COLOR_ORDER.map((color) => (
            <HomeCorridor key={color} color={color} />
          ))}

          <div className="ludo-center" />

          {players.map((p, playerIdx) =>
            tokens[playerIdx].map((step, tokenIdx) => {
              if (step < 0 || step >= PATH_LENGTH) return null;
              const [r, c] = getCellCoord(colorOf(playerIdx), step);
              const isPickable = playerIdx === currentIdx && legalTokens.includes(tokenIdx);
              return (
                <button
                  key={`${playerIdx}-${tokenIdx}`}
                  className={`ludo-token ${isPickable ? 'ludo-token-pickable' : ''}`}
                  style={{ gridRow: r + 1, gridColumn: c + 1, background: p.color, '--nudge': tokenIdx % 2 === 0 ? -1 : 1 }}
                  onClick={() => isPickable && chooseToken(tokenIdx)}
                  disabled={!isPickable}
                  aria-label={`${p.name} sin brikke`}
                />
              );
            })
          )}
        </div>

        <div className="ludo-side">
          {players.map((p, i) => (
            <div
              key={i}
              className={`ludo-player-chip ${i === currentIdx ? 'ludo-player-chip-active' : ''}`}
              style={{ borderColor: p.color }}
            >
              {p.avatar} {p.name}
              <span className="ludo-home-count">{tokens[i].filter((s) => s === PATH_LENGTH).length}/4 hjemme</span>
            </div>
          ))}

          <button className="btn btn-accent ludo-die-btn" onClick={rollDie} disabled={phase !== 'rolling'}>
            🎲 {dieValue ?? 'Kast terning'}
          </button>
          {phase === 'choosing' && <div className="ludo-hint">Trykk på brikken du vil flytte</div>}
        </div>
      </div>

      {toast && <div className="ludo-toast">{toast}</div>}
    </div>
  );
}

function YardQuadrant({ color, tokens, legalTokens, onPick }) {
  return (
    <div className={`ludo-yard ludo-yard-${color}`} style={YARD_AREA[color]}>
      <div className="ludo-yard-tray">
        {tokens.map((step, i) => {
          if (step !== -1) return null;
          const pickable = legalTokens.includes(i);
          return (
            <button
              key={i}
              className={`ludo-yard-token ${pickable ? 'ludo-token-pickable' : ''}`}
              style={{ background: COLOR_META[color].hex }}
              onClick={() => pickable && onPick?.(i)}
              disabled={!pickable}
              aria-label={`Hent ut ${COLOR_META[color].label} brikke`}
            />
          );
        })}
      </div>
    </div>
  );
}

function HomeCorridor({ color }) {
  const cells = PLAYER_PATH[color].slice(RING_LENGTH);
  return (
    <>
      {cells.map(([r, c], i) => (
        <div
          key={i}
          className={`ludo-cell ludo-home-cell ludo-home-cell-${color}`}
          style={{ gridRow: r + 1, gridColumn: c + 1 }}
        />
      ))}
    </>
  );
}
