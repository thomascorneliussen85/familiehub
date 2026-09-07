import { useState } from 'react';
import { createInitialState, isMoveLegal, applyMove } from './ultimateTicTacToeLogic';
import './UltimateTicTacToe.css';

const RESULT_DELAY_MS = 1400;
const MARKS = ['✕', '○'];

export default function UltimateTicTacToe({ players, onGameEnd }) {
  const [state, setState] = useState(createInitialState);

  function play(boardIdx, cellIdx) {
    if (!isMoveLegal(state, boardIdx, cellIdx)) return;
    const next = applyMove(state, boardIdx, cellIdx);
    setState(next);
    if (next.winner != null) {
      const results =
        next.winner === 'draw'
          ? [
              { playerIndex: 0, placement: 1 },
              { playerIndex: 1, placement: 1 },
            ]
          : [
              { playerIndex: next.winner, placement: 1 },
              { playerIndex: next.winner === 0 ? 1 : 0, placement: 2 },
            ];
      setTimeout(() => onGameEnd(results), RESULT_DELAY_MS);
    }
  }

  const current = players[state.currentPlayer];

  return (
    <div className="uttt-wrap">
      <div className="uttt-turn-banner" style={{ borderLeftColor: current.color }}>
        {state.winner == null && (
          <>
            {current.avatar} {current.name} sin tur ({MARKS[state.currentPlayer]})
          </>
        )}
        {state.winner != null && state.winner !== 'draw' && <>🎉 {players[state.winner].name} vant!</>}
        {state.winner === 'draw' && <>🤝 Uavgjort!</>}
      </div>

      <div className="uttt-meta-board">
        {Array.from({ length: 9 }, (_, boardIdx) => {
          const owner = state.owners[boardIdx];
          const isActive =
            state.winner == null && owner == null && (state.activeBoard == null || state.activeBoard === boardIdx);
          return (
            <div
              key={boardIdx}
              className={`uttt-small-board ${isActive ? 'uttt-small-board-active' : ''} ${owner != null ? 'uttt-small-board-done' : ''}`}
            >
              {owner != null ? (
                <span
                  className={`uttt-owner-mark ${owner === 'draw' ? 'uttt-owner-draw' : ''}`}
                  style={owner !== 'draw' ? { color: players[owner].color } : undefined}
                >
                  {owner === 'draw' ? '–' : MARKS[owner]}
                </span>
              ) : (
                <div className="uttt-cells">
                  {state.boards[boardIdx].map((cell, cellIdx) => (
                    <button
                      key={cellIdx}
                      className="uttt-cell"
                      onClick={() => play(boardIdx, cellIdx)}
                      disabled={!isActive || cell != null}
                      style={cell != null ? { color: players[cell].color } : undefined}
                    >
                      {cell != null ? MARKS[cell] : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
