// Ren spillogikk for Fire på rad – ingen avhengighet til React/DOM, så
// reglene kan testes/gjenbrukes uavhengig av selve brettvisningen.

export const ROWS = 6;
export const COLS = 7;

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// Slipper en brikke ned i kolonnen – returnerer en NY brikke-posisjon
// {row, col} hvis kolonnen har plass, ellers null. Muterer ikke board;
// kalleren setter selv board[row][col] = playerIndex.
export function findDropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) return row;
  }
  return -1;
}

const DIRECTIONS = [
  [0, 1], // vannrett
  [1, 0], // loddrett
  [1, 1], // skrå ned-høyre
  [1, -1], // skrå ned-venstre
];

// Finner en evt. fire-på-rad-linje som går gjennom brikken som nettopp ble
// lagt på (row, col) – trenger kun sjekke fra det siste trekket, ikke hele
// brettet, siden det er umulig å lage fire på rad uten at siste trekk er en
// del av den rekken. Returnerer listen med [row, col]-koordinater (til
// highlighting) hvis det er en vinnerlinje, ellers null.
export function findWinningLine(board, row, col) {
  const player = board[row][col];
  if (player === null) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const forward = collectDirection(board, row, col, dr, dc, player);
    const backward = collectDirection(board, row, col, -dr, -dc, player);
    const line = [...backward.reverse(), [row, col], ...forward];
    if (line.length >= 4) return line;
  }
  return null;
}

function collectDirection(board, row, col, dr, dc, player) {
  const cells = [];
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
    cells.push([r, c]);
    r += dr;
    c += dc;
  }
  return cells;
}

export function isBoardFull(board) {
  return board[0].every((cell) => cell !== null);
}
