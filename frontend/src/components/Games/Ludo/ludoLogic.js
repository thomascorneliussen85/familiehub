// Ren spillogikk for Ludo. Rutekoordinatene (PLAYER_PATH) er IKKE gjettet
// fritt – de er hentet fra en verifisert, fungerende åpen kildekode-
// implementasjon (bilal-512/ludo_game, src/paths.cpp) og oversatt til farge-
// navn i stedet for spillerindeks. Se selvtestene i ludoLogic.test.md-notatet
// (kjørt manuelt under bygging) for strukturell verifisering av dataene.
//
// Hver farges vei er 56 steg (0-55): steg 0-50 er den delte ytre ringen
// (51 ruter, i den rekkefølgen DENNE fargen går dem), steg 51-55 er fargens
// egen private "hjem-korridor". Steg -1 = fortsatt i "gården" (ikke i spill).
// Steg 56 = i mål.

export const COLOR_ORDER = ['red', 'yellow', 'green', 'blue'];

export const COLOR_META = {
  red: { label: 'Rød', hex: '#e0433d' },
  yellow: { label: 'Gul', hex: '#f2c94c' },
  green: { label: 'Grønn', hex: '#6fcf67' },
  blue: { label: 'Blå', hex: '#3b82f6' },
};

export const RING_LENGTH = 51; // steg 0-50
export const PATH_LENGTH = 56; // steg 0-55, 56 = ferdig/hjemme

export const PLAYER_PATH = {
  red: [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7], [0, 8],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14], [8, 14],
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7], [14, 6],
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0],
    // hjem-korridor (51-55)
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5],
  ],
  yellow: [
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14], [8, 14],
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7], [14, 6],
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0], [6, 0],
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7],
    // hjem-korridor (51-55)
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7],
  ],
  blue: [
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0], [6, 0],
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7], [0, 8],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14], [8, 14],
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7],
    // hjem-korridor (51-55)
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7],
  ],
  green: [
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7], [14, 6],
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0], [6, 0],
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7], [0, 8],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14],
    // hjem-korridor (51-55)
    [7, 13], [7, 12], [7, 11], [7, 10], [7, 9],
  ],
};

// De 8 sikre rutene (startruten + én ekstra "stjerne" per farge) – ingen
// brikke kan slås ut her. Absolutte rutekoordinater, delt av alle farger.
export const SAFE_SQUARES = [
  [6, 1], [2, 6], // rød
  [1, 8], [6, 12], // gul
  [8, 13], [12, 8], // grønn
  [13, 6], [8, 2], // blå
];

export function isSafeCell(row, col) {
  return SAFE_SQUARES.some(([r, c]) => r === row && c === col);
}

export function getCellCoord(color, step) {
  if (step < 0 || step >= PATH_LENGTH) return null;
  return PLAYER_PATH[color][step];
}

// tokens: 4 steg-verdier for ÉN spiller. -1 = i gården, 0-55 = et sted på
// veien/hjem-korridoren, 56 = i mål (ferdig, ikke lenger flyttbar).
export function getLegalTokenIndices(tokens, dieValue) {
  const legal = [];
  for (let i = 0; i < 4; i++) {
    const step = tokens[i];
    if (step === -1) {
      if (dieValue === 6) legal.push(i);
    } else if (step >= 0 && step < PATH_LENGTH) {
      if (step + dieValue <= PATH_LENGTH) legal.push(i);
    }
  }
  return legal;
}

// allTokens: array (én per spiller i tur-rekkefølge) av 4 steg-verdier.
// colorOf(playerIndex) gir fargenavnet for den spilleren.
export function applyMove(allTokens, playerIndex, tokenIndex, dieValue, colorOf) {
  const next = allTokens.map((arr) => arr.slice());
  const myTokens = next[playerIndex];
  const fromStep = myTokens[tokenIndex];
  const toStep = fromStep === -1 ? 0 : fromStep + dieValue;
  myTokens[tokenIndex] = toStep;

  let captured = null;
  if (toStep <= RING_LENGTH - 1) {
    const [row, col] = PLAYER_PATH[colorOf(playerIndex)][toStep];
    if (!isSafeCell(row, col)) {
      for (let p = 0; p < next.length; p++) {
        if (p === playerIndex) continue;
        for (let t = 0; t < 4; t++) {
          const otherStep = next[p][t];
          if (otherStep >= 0 && otherStep <= RING_LENGTH - 1) {
            const [or_, oc] = PLAYER_PATH[colorOf(p)][otherStep];
            if (or_ === row && oc === col) {
              next[p][t] = -1;
              captured = { playerIndex: p, tokenIndex: t };
            }
          }
        }
      }
    }
  }

  return {
    tokens: next,
    captured,
    justFinished: toStep === PATH_LENGTH,
    allHome: myTokens.every((s) => s === PATH_LENGTH),
  };
}

export function createEmptyTokens(playerCount) {
  return Array.from({ length: playerCount }, () => [-1, -1, -1, -1]);
}

// De 52 fysiske delte ringrutene, til rendering av selve brettet (uavhengig
// av hvilken farge som "eier" dem) – union av alle 4 fargers 51-lange lister,
// siden hver enkelt farge naturlig hopper over ÉN rute nær sin egen
// hjem-korridor (se _selftest.mjs for hvorfor det er riktig og ikke en feil).
export function getAllRingCells() {
  const seen = new Map();
  for (const color of COLOR_ORDER) {
    for (let i = 0; i < RING_LENGTH; i++) {
      const [r, c] = PLAYER_PATH[color][i];
      seen.set(`${r},${c}`, [r, c]);
    }
  }
  return [...seen.values()];
}
