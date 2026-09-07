// Ren spillogikk for Stigespill. Terningkast flytter brikken, men KAN IKKE
// overskyte rute 100 – for høyt kast betyr "prøv igjen neste runde" (vanlig,
// barnevennlig husregel), i stedet for å telle ned igjen fra 100.

export const BOARD_SIZE = 100;

export const LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
export const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

// Bygger 10x10-rutenettet i "slange"-mønster: rad nederst = 1-10 (venstre
// mot høyre), neste rad opp = 11-20 (høyre mot venstre), osv. – grid[0] er
// ØVERSTE rad (der rute 91-100 ligger), for å matche vanlig topp-til-bunn
// rendering.
export function buildGrid() {
  const grid = [];
  for (let rowFromBottom = 0; rowFromBottom < 10; rowFromBottom++) {
    const rowNumbers = [];
    for (let col = 0; col < 10; col++) {
      const base = rowFromBottom * 10;
      const n = rowFromBottom % 2 === 0 ? base + col + 1 : base + (10 - col);
      rowNumbers.push(n);
    }
    grid[9 - rowFromBottom] = rowNumbers;
  }
  return grid;
}

export function squarePositions() {
  const grid = buildGrid();
  const map = new Map();
  grid.forEach((row, r) => row.forEach((n, c) => map.set(n, [r, c])));
  return map;
}

// position: 0 = ikke startet (brikken står utenfor brettet), 1-100 = rute.
export function applyRoll(position, die) {
  const attempted = position + die;
  if (attempted > BOARD_SIZE) {
    return { position, moved: false, ladder: false, snake: false, won: false };
  }
  let next = attempted;
  let ladder = false;
  let snake = false;
  if (LADDERS[next]) {
    next = LADDERS[next];
    ladder = true;
  } else if (SNAKES[next]) {
    next = SNAKES[next];
    snake = true;
  }
  return { position: next, moved: true, ladder, snake, won: next === BOARD_SIZE };
}
