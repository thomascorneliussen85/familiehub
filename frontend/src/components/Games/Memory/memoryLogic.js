// Ren spillogikk for Memory/Kims lek – shuffle tar imot en injiserbar
// tilfeldig-funksjon slik at rekkefølgen kan gjøres deterministisk i tester.

function defaultShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createDeck(pairCount, shuffle = defaultShuffle) {
  const ids = Array.from({ length: pairCount }, (_, i) => i);
  const order = shuffle([...ids, ...ids]);
  return order.map((pairId, index) => ({ id: index, pairId, matched: false }));
}

export function isMatch(deck, indexA, indexB) {
  return deck[indexA].pairId === deck[indexB].pairId;
}

export function allMatched(deck) {
  return deck.every((c) => c.matched);
}
