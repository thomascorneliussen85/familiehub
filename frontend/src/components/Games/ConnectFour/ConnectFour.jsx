import { useState } from 'react';
import { ROWS, COLS, createEmptyBoard, findDropRow, findWinningLine, isBoardFull } from './connectFourLogic';
import './ConnectFour.css';

const RESULT_DELAY_MS = 1400;

export default function ConnectFour({ players, onGameEnd }) {
  const [board, setBoard] = useState(createEmptyBoard);
  const [turn, setTurn] = useState(0);
  const [winLine, setWinLine] = useState(null);
  const [draw, setDraw] = useState(false);
  const [lastMove, setLastMove] = useState(null);

  const gameOver = Boolean(winLine) || draw;

  function drop(col) {
    if (gameOver) return;
    const row = findDropRow(board, col);
    if (row === -1) return;

    const next = board.map((r) => r.slice());
    next[row][col] = turn;
    setBoard(next);
    setLastMove([row, col]);

    const line = findWinningLine(next, row, col);
    if (line) {
      setWinLine(line);
      const loser = turn === 0 ? 1 : 0;
      setTimeout(
        () => onGameEnd([
          { playerIndex: turn, placement: 1 },
          { playerIndex: loser, placement: 2 },
        ]),
        RESULT_DELAY_MS
      );
      return;
    }
    if (isBoardFull(next)) {
      setDraw(true);
      setTimeout(
        () => onGameEnd([
          { playerIndex: 0, placement: 1 },
          { playerIndex: 1, placement: 1 },
        ]),
        RESULT_DELAY_MS
      );
      return;
    }
    setTurn((t) => (t === 0 ? 1 : 0));
  }

  function isWinCell(row, col) {
    return Boolean(winLine?.some(([wr, wc]) => wr === row && wc === col));
  }

  return (
    <div className="c4-wrap">
      <div className="c4-turn-banner" style={{ borderLeftColor: players[turn].color }}>
        {winLine && <>🎉 {players[turn].avatar} {players[turn].name} vant!</>}
        {draw && <>🤝 Uavgjort!</>}
        {!gameOver && (
          <>
            <span className="c4-turn-avatar">{players[turn].avatar}</span>
            {players[turn].name} sin tur
          </>
        )}
      </div>
      <div className="c4-board">
        {Array.from({ length: COLS }, (_, col) => (
          <button
            key={col}
            className="c4-col"
            onClick={() => drop(col)}
            disabled={gameOver}
            aria-label={`Slipp brikke i kolonne ${col + 1}`}
          >
            {Array.from({ length: ROWS }, (_, row) => {
              const cell = board[row][col];
              const isNew = lastMove && lastMove[0] === row && lastMove[1] === col;
              return (
                <span
                  key={row}
                  className={`c4-cell ${cell !== null ? 'c4-cell-filled' : ''} ${isWinCell(row, col) ? 'c4-cell-win' : ''} ${isNew ? 'c4-cell-drop' : ''}`}
                  style={cell !== null ? { '--piece-color': players[cell].color } : undefined}
                />
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
