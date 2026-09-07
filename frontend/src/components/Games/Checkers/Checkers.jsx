import { useMemo, useState } from 'react';
import { createInitialBoard, getLegalMovesForPlayer, applyMoveSequence, BOARD_SIZE } from './checkersLogic';
import './Checkers.css';

const RESULT_DELAY_MS = 1000;

export default function Checkers({ players, onGameEnd }) {
  const [board, setBoard] = useState(createInitialBoard);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [selected, setSelected] = useState(null);
  const [winner, setWinner] = useState(null);

  const legalMoves = useMemo(() => getLegalMovesForPlayer(board, currentPlayer), [board, currentPlayer]);
  const selectableFroms = useMemo(() => new Set(legalMoves.map((m) => m.from.join(','))), [legalMoves]);
  const destinationsForSelected = selected
    ? legalMoves.filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1])
    : [];

  function lastStepOf(move) {
    return move.sequence[move.sequence.length - 1];
  }

  function selectPiece(r, c) {
    if (winner != null) return;
    const piece = board[r][c];
    if (piece && piece.player === currentPlayer && selectableFroms.has(`${r},${c}`)) {
      setSelected([r, c]);
    } else {
      setSelected(null);
    }
  }

  function moveTo(r, c) {
    const move = destinationsForSelected.find((m) => {
      const last = lastStepOf(m);
      return last.to[0] === r && last.to[1] === c;
    });
    if (!move) return;
    const nextBoard = applyMoveSequence(board, move.sequence);
    setBoard(nextBoard);
    setSelected(null);

    const opponent = currentPlayer === 0 ? 1 : 0;
    const opponentMoves = getLegalMovesForPlayer(nextBoard, opponent);
    if (opponentMoves.length === 0) {
      setWinner(currentPlayer);
      const results = [
        { playerIndex: currentPlayer, placement: 1 },
        { playerIndex: opponent, placement: 2 },
      ];
      setTimeout(() => onGameEnd(results), RESULT_DELAY_MS);
      return;
    }
    setCurrentPlayer(opponent);
  }

  const current = players[currentPlayer];

  return (
    <div className="ck-wrap">
      <div className="ck-turn-banner" style={{ borderLeftColor: current.color }}>
        {winner == null ? (
          <>
            {current.avatar} {current.name} sin tur
          </>
        ) : (
          <>🎉 {players[winner].name} vant!</>
        )}
      </div>

      <div className="ck-board">
        {Array.from({ length: BOARD_SIZE }, (_, r) =>
          Array.from({ length: BOARD_SIZE }, (_, c) => {
            const dark = (r + c) % 2 === 1;
            const piece = board[r][c];
            const isSelected = Boolean(selected && selected[0] === r && selected[1] === c);
            const isDestination = destinationsForSelected.some((m) => {
              const last = lastStepOf(m);
              return last.to[0] === r && last.to[1] === c;
            });
            const canSelect = dark && piece && piece.player === currentPlayer && selectableFroms.has(`${r},${c}`) && winner == null;

            return (
              <button
                key={`${r}-${c}`}
                className={`ck-square ${dark ? 'ck-square-dark' : 'ck-square-light'} ${isSelected ? 'ck-square-selected' : ''} ${isDestination ? 'ck-square-dest' : ''}`}
                onClick={() => (isDestination ? moveTo(r, c) : dark && selectPiece(r, c))}
                disabled={!dark || (!piece && !isDestination)}
                aria-label={`Rute ${r + 1},${c + 1}`}
              >
                {piece && (
                  <span
                    className={`ck-piece ${piece.king ? 'ck-piece-king' : ''} ${canSelect ? 'ck-piece-selectable' : ''}`}
                    style={{ background: players[piece.player].color }}
                  >
                    {piece.king && '♛'}
                  </span>
                )}
                {isDestination && !piece && <span className="ck-dest-dot" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
