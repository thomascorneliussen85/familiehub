// Fiktive priser for 3 kjente kjeder og 6 vanlige varer, brukt når
// KASSALAPP_API_KEY ikke er satt – slik at Smart handleliste kan vises fram
// uten en ekte API-nøkkel. Tydelig markert som demo i UI (se ShoppingPanel).
const DEMO_STORES = ['KIWI', 'REMA 1000', 'Coop Extra'];

const DEMO_ITEMS = {
  melk: {
    ean: '7020097009901',
    product_name: 'Tine Lettmelk 1L',
    prices: [
      { store: 'KIWI', price: 22.9, is_offer: false },
      { store: 'REMA 1000', price: 21.9, is_offer: true },
      { store: 'Coop Extra', price: 23.5, is_offer: false },
    ],
  },
  brød: {
    ean: '7020097009902',
    product_name: 'Grovt Brød 750g',
    prices: [
      { store: 'KIWI', price: 34.9, is_offer: false },
      { store: 'REMA 1000', price: 36.9, is_offer: false },
      { store: 'Coop Extra', price: 32.9, is_offer: true },
    ],
  },
  kjøttdeig: {
    ean: '7020097009903',
    product_name: 'Kjøttdeig 400g',
    prices: [
      { store: 'KIWI', price: 59.9, is_offer: false },
      { store: 'REMA 1000', price: 54.9, is_offer: true },
      { store: 'Coop Extra', price: 62.9, is_offer: false },
    ],
  },
  bleier: {
    ean: '7020097009904',
    product_name: 'Bleier str. 4, 60 stk',
    prices: [
      { store: 'KIWI', price: 189.0, is_offer: false },
      { store: 'REMA 1000', price: 179.0, is_offer: false },
      { store: 'Coop Extra', price: 199.0, is_offer: false },
    ],
  },
  ost: {
    ean: '7020097009905',
    product_name: 'Norvegia 1kg',
    prices: [
      { store: 'KIWI', price: 139.9, is_offer: false },
      { store: 'REMA 1000', price: 144.9, is_offer: false },
      { store: 'Coop Extra', price: 129.9, is_offer: true },
    ],
  },
  bananer: {
    ean: '7020097009906',
    product_name: 'Bananer, pr. kg',
    prices: [
      { store: 'KIWI', price: 24.9, is_offer: false },
      { store: 'REMA 1000', price: 22.9, is_offer: true },
      { store: 'Coop Extra', price: 26.9, is_offer: false },
    ],
  },
};

export function getDemoStores() {
  return DEMO_STORES;
}

// Enkel substring-match ("helmelk" -> "melk") – demoen trenger ikke ekte
// fuzzy-søk, bare å demonstrere resten av funksjonen.
export function getDemoMatch(itemText) {
  const normalized = itemText.toLowerCase().trim();
  const key = Object.keys(DEMO_ITEMS).find((k) => normalized.includes(k));
  return key ? { ...DEMO_ITEMS[key], matchedKey: key } : null;
}
