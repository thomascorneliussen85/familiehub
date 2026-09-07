// Ren spillogikk for Yatzy (norske regler) – terningkast/hold-tilstand
// håndteres i UI-komponenten (den er iboende tilfeldig/side-effekt-full),
// men selve poengutregningen for hver av de 15 feltene er rene, testbare
// funksjoner her.

export const CATEGORIES = [
  { key: 'ones', label: 'Ess', section: 'upper' },
  { key: 'twos', label: 'Toer', section: 'upper' },
  { key: 'threes', label: 'Treer', section: 'upper' },
  { key: 'fours', label: 'Firer', section: 'upper' },
  { key: 'fives', label: 'Femer', section: 'upper' },
  { key: 'sixes', label: 'Sekser', section: 'upper' },
  { key: 'onePair', label: 'Ett par', section: 'lower' },
  { key: 'twoPairs', label: 'To par', section: 'lower' },
  { key: 'threeOfKind', label: 'Tre like', section: 'lower' },
  { key: 'fourOfKind', label: 'Fire like', section: 'lower' },
  { key: 'fullHouse', label: 'Hus', section: 'lower' },
  { key: 'smallStraight', label: 'Liten straight', section: 'lower' },
  { key: 'largeStraight', label: 'Stor straight', section: 'lower' },
  { key: 'chance', label: 'Sjanse', section: 'lower' },
  { key: 'yatzy', label: 'Yatzy', section: 'lower' },
];

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS_AMOUNT = 50;
export const MAX_ROLLS = 3;

function faceCounts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0]; // indeks 1-6, 0 ubrukt
  for (const d of dice) c[d]++;
  return c;
}

function sumAll(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function scoreCategory(key, dice) {
  const c = faceCounts(dice);
  switch (key) {
    case 'ones': return c[1] * 1;
    case 'twos': return c[2] * 2;
    case 'threes': return c[3] * 3;
    case 'fours': return c[4] * 4;
    case 'fives': return c[5] * 5;
    case 'sixes': return c[6] * 6;
    case 'onePair': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 2) return v * 2;
      return 0;
    }
    case 'twoPairs': {
      const pairs = [];
      for (let v = 6; v >= 1; v--) if (c[v] >= 2) pairs.push(v);
      return pairs.length >= 2 ? (pairs[0] + pairs[1]) * 2 : 0;
    }
    case 'threeOfKind': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 3) return v * 3;
      return 0;
    }
    case 'fourOfKind': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 4) return v * 4;
      return 0;
    }
    case 'fullHouse': {
      let three = -1;
      let two = -1;
      for (let v = 1; v <= 6; v++) {
        if (c[v] === 3) three = v;
        if (c[v] === 2) two = v;
      }
      return three >= 0 && two >= 0 ? sumAll(dice) : 0;
    }
    case 'smallStraight':
      return arraysEqual([...dice].sort((a, b) => a - b), [1, 2, 3, 4, 5]) ? 15 : 0;
    case 'largeStraight':
      return arraysEqual([...dice].sort((a, b) => a - b), [2, 3, 4, 5, 6]) ? 20 : 0;
    case 'chance':
      return sumAll(dice);
    case 'yatzy':
      return c.some((n) => n === 5) ? 50 : 0;
    default:
      return 0;
  }
}

export function computeUpperSum(scorecard) {
  return CATEGORIES.filter((c) => c.section === 'upper').reduce((sum, c) => sum + (scorecard[c.key] ?? 0), 0);
}

export function computeBonus(scorecard) {
  return computeUpperSum(scorecard) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_AMOUNT : 0;
}

export function computeTotal(scorecard) {
  const raw = CATEGORIES.reduce((sum, c) => sum + (scorecard[c.key] ?? 0), 0);
  return raw + computeBonus(scorecard);
}

export function isScorecardFull(scorecard) {
  return CATEGORIES.every((c) => scorecard[c.key] != null);
}

export function createEmptyScorecard() {
  return {};
}
