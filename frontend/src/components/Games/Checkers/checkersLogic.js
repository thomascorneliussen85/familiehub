// Ren spillogikk for Dam (checkers/draughts), 8x8-brett, kun de mørke
// rutene er i bruk. Vanlige brikker beveger/slår kun DIAGONALT FOROVER;
// damer (etter forfremmelse på motstanders bakerste rad) beveger/slår i
// alle 4 diagonale retninger. Tvungen slag-regel: har NOEN brikke et
// gyldig slag tilgjengelig, er KUN slag-trekk lovlige den runden - og en
// påbegynt slag-kjede MÅ fortsette med samme brikke så langt det går.
//
// Spiller 0 starter øverst (rad 0-2) og beveger seg NEDOVER (økende rad).
// Spiller 1 starter nederst (rad 5-7) og beveger seg OPPOVER (minkende rad).

export const BOARD_SIZE = 8;

export function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: 0, king: false };
    }
  }
  for (let r = 5; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: 1, king: false };
    }
  }
  return board;
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function directionsFor(piece) {
  if (piece.king) return [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  return piece.player === 0 ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
}

function promotionRowFor(player) {
  return player === 0 ? BOARD_SIZE - 1 : 0;
}

// Finner alle mulige slag-KJEDER fra (r,c) rekursivt. `piece` sendes eksplisitt
// videre gjennom rekursjonen (i stedet for å lese board[r][c] på nytt) slik at
// brikketypen (mann/dame) forblir den den var VED STARTEN av hele kjeden -
// en forfremmelse skjer først når hele trekket er ferdig utført, ikke midt i
// en slag-kjede (en vanlig, enkel tolkning av regelen - unngår tvetydighet
// om en brikke skal "bli dame og fortsette å slå som dame samme runde").
export function findCaptureSequences(board, r, c, piece = board[r][c]) {
  const dirs = directionsFor(piece);
  const sequences = [];
  for (const [dr, dc] of dirs) {
    const overR = r + dr;
    const overC = c + dc;
    const landR = r + 2 * dr;
    const landC = c + 2 * dc;
    if (!inBounds(landR, landC)) continue;
    const overPiece = board[overR]?.[overC];
    if (!overPiece || overPiece.player === piece.player) continue;
    if (board[landR][landC] != null) continue;

    const nextBoard = cloneBoard(board);
    nextBoard[r][c] = null;
    nextBoard[overR][overC] = null;
    nextBoard[landR][landC] = piece;

    const further = findCaptureSequences(nextBoard, landR, landC, piece);
    const step = { from: [r, c], to: [landR, landC], captured: [overR, overC] };
    if (further.length === 0) {
      sequences.push([step]);
    } else {
      for (const seq of further) sequences.push([step, ...seq]);
    }
  }
  return sequences;
}

export function getAllCaptureSequencesForPlayer(board, player) {
  const all = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        for (const seq of findCaptureSequences(board, r, c)) {
          all.push({ from: [r, c], sequence: seq });
        }
      }
    }
  }
  return all;
}

function getSimpleMovesForPiece(board, r, c) {
  const piece = board[r][c];
  const moves = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const tr = r + dr;
    const tc = c + dc;
    if (inBounds(tr, tc) && board[tr][tc] == null) moves.push([tr, tc]);
  }
  return moves;
}

// Alle lovlige trekk for spilleren, som en liste av { from, sequence,
// isCapture }. sequence er alltid en liste av ett eller flere steg
// { from, to, captured } - ett steg for et enkelt trekk, flere for en
// slag-kjede. Tvungen slag-regel håndheves her: finnes det NOE slag et
// sted på brettet for spilleren, returneres KUN slag-trekk.
export function getLegalMovesForPlayer(board, player) {
  const captures = getAllCaptureSequencesForPlayer(board, player);
  if (captures.length > 0) {
    return captures.map((c) => ({ from: c.from, sequence: c.sequence, isCapture: true }));
  }
  const simple = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        for (const [tr, tc] of getSimpleMovesForPiece(board, r, c)) {
          simple.push({ from: [r, c], sequence: [{ from: [r, c], to: [tr, tc], captured: null }], isCapture: false });
        }
      }
    }
  }
  return simple;
}

export function applyMoveSequence(board, sequence) {
  const next = cloneBoard(board);
  let piece = null;
  for (const step of sequence) {
    const [fr, fc] = step.from;
    const [tr, tc] = step.to;
    piece = next[fr][fc];
    next[fr][fc] = null;
    if (step.captured) {
      const [cr, cc] = step.captured;
      next[cr][cc] = null;
    }
    next[tr][tc] = piece;
  }
  const [lastR, lastC] = sequence[sequence.length - 1].to;
  if (piece && !piece.king && lastR === promotionRowFor(piece.player)) {
    next[lastR][lastC] = { ...piece, king: true };
  }
  return next;
}

export function countPieces(board, player) {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell && cell.player === player) n++;
  return n;
}
