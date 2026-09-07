// Ren spillogikk for "Utvidet tre-på-rad" (Ultimate Tic-Tac-Toe): et 3x3
// rutenett av 3x3 tre-på-rad-brett. Cella du velger INNE i et lite brett
// bestemmer HVILKET lite brett motstanderen må spille i neste gang (samme
// indeks) – med mindre det brettet allerede er vunnet/fullt, da får de
// spille hvor som helst.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkLineWinner(cells) {
  for (const [a, b, c] of LINES) {
    if (cells[a] != null && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a];
  }
  return null;
}

function isFull(cells) {
  return cells.every((c) => c != null);
}

export function createInitialState() {
  return {
    boards: Array.from({ length: 9 }, () => Array(9).fill(null)),
    owners: Array(9).fill(null), // null | 0 | 1 | 'draw'
    activeBoard: null, // null = kan spille i hvilket som helst åpent brett
    currentPlayer: 0,
    winner: null, // null | 0 | 1 | 'draw'
  };
}

export function isMoveLegal(state, boardIdx, cellIdx) {
  if (state.winner != null) return false;
  if (state.owners[boardIdx] != null) return false;
  if (state.boards[boardIdx][cellIdx] != null) return false;
  // activeBoard begrenser bare hvis DET brettet fortsatt er åpent - hvis det
  // tvungne brettet allerede er avgjort (vunnet/uavgjort), er ethvert annet
  // åpent brett lovlig (fritt valg). Under normal spillflyt via applyMove
  // settes activeBoard aldri til et allerede avgjort brett i utgangspunktet,
  // men denne sjekken gjør funksjonen korrekt uansett hvilken state den mates
  // med, ikke bare de statene applyMove selv produserer.
  const activeBoardIsOpen = state.activeBoard != null && state.owners[state.activeBoard] == null;
  if (activeBoardIsOpen && state.activeBoard !== boardIdx) return false;
  return true;
}

export function applyMove(state, boardIdx, cellIdx) {
  if (!isMoveLegal(state, boardIdx, cellIdx)) return state;

  const boards = state.boards.map((b, i) => (i === boardIdx ? b.slice() : b));
  boards[boardIdx][cellIdx] = state.currentPlayer;

  const owners = state.owners.slice();
  const localWinner = checkLineWinner(boards[boardIdx]);
  if (localWinner != null) {
    owners[boardIdx] = localWinner;
  } else if (isFull(boards[boardIdx])) {
    owners[boardIdx] = 'draw';
  }

  const metaWinner = checkLineWinner(owners.map((o) => (o === 'draw' ? null : o)));
  let winner = null;
  if (metaWinner != null) winner = metaWinner;
  else if (owners.every((o) => o != null)) winner = 'draw';

  const targetBoard = owners[cellIdx] != null ? null : cellIdx;

  return {
    boards,
    owners,
    activeBoard: winner != null ? null : targetBoard,
    currentPlayer: state.currentPlayer === 0 ? 1 : 0,
    winner,
  };
}
