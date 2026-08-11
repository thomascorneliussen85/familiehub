import { db } from '../db/index.js';
import { config } from '../config.js';
import { searchProducts, getNearbyStores, isKassalappConfigured } from './kassalappClient.js';
import { getDemoMatch, getDemoStores } from './smartShoppingDemoData.js';

const MAX_MATCHES_PER_ITEM = 3;
// En vare regnes som "på tilbud" hvis nåværende pris er minst 10% under
// snittet av de siste registrerte prisene (ekskl. dagens) – Kassalapp sitt
// API har ikke noe eksplisitt "er dette et tilbud"-felt (bekreftet mot den
// offisielle klientens datamodeller), så dette er utledet av oss selv, ikke
// hentet direkte fra API-et.
const OFFER_THRESHOLD_RATIO = 0.9;
const OFFER_HISTORY_WINDOW = 14;

function normalizeText(text) {
  return text.toLowerCase().trim();
}

export function getDefaultSettings() {
  return {
    enabled: true,
    radiusKm: config.kassalapp.radiusKm,
    enabledChains: [], // tom liste = alle kjeder (standard, se settings-rute)
  };
}

export function getFamilySettings(familyId) {
  const row = db.prepare("SELECT value FROM settings WHERE family_id = ? AND key = 'smart_shopping'").get(familyId);
  if (!row?.value) return getDefaultSettings();
  try {
    return { ...getDefaultSettings(), ...JSON.parse(row.value) };
  } catch {
    return getDefaultSettings();
  }
}

export function saveFamilySettings(familyId, settings) {
  const merged = { ...getFamilySettings(familyId), ...settings };
  db.prepare(
    `INSERT INTO settings (family_id, key, value) VALUES (?, 'smart_shopping', ?)
     ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value`
  ).run(familyId, JSON.stringify(merged));
  return merged;
}

function computeIsOffer(priceHistory, currentPrice) {
  if (!Array.isArray(priceHistory) || priceHistory.length < 2 || currentPrice == null) return false;
  const recent = priceHistory.slice(-OFFER_HISTORY_WINDOW - 1, -1);
  if (recent.length === 0) return false;
  const avg = recent.reduce((sum, p) => sum + Number(p.price || 0), 0) / recent.length;
  if (!avg) return false;
  return currentPrice <= avg * OFFER_THRESHOLD_RATIO;
}

// Grupperer rå søkeresultater (én rad per produkt+butikk) til distinkte
// produkter, hver med en liste av butikk-priser.
function groupByProduct(rows) {
  const byEan = new Map();
  for (const row of rows) {
    if (!row?.ean || !row.store?.name || row.current_price == null) continue;
    if (!byEan.has(row.ean)) {
      byEan.set(row.ean, {
        ean: row.ean,
        product_name: row.name,
        image_url: row.image || null,
        stores: [],
      });
    }
    byEan.get(row.ean).stores.push({
      store_name: row.store.name,
      store_id: row.store.id ?? null,
      price: row.current_price,
      is_offer: computeIsOffer(row.price_history, row.current_price),
    });
  }
  return [...byEan.values()];
}

async function getAllowedChainNames(familyId) {
  const settings = getFamilySettings(familyId);
  if (settings.enabledChains.length > 0) {
    return new Set(settings.enabledChains.map((c) => c.toLowerCase()));
  }
  // Ingen eksplisitt valgt = alle kjeder i nærheten av hjemme-punktet er lov.
  try {
    const stores = await getNearbyStores(config.kassalapp.homeLat, config.kassalapp.homeLng, settings.radiusKm);
    if (stores.length === 0) return null; // ukjent -> ikke filtrer
    return new Set(stores.map((s) => s.name.toLowerCase()));
  } catch {
    return null; // klarte ikke hente butikkliste -> ikke filtrer bort noe
  }
}

function chainAllowed(storeName, allowedChains) {
  if (!allowedChains) return true;
  const lower = storeName.toLowerCase();
  for (const chain of allowedChains) {
    if (lower.includes(chain) || chain.includes(lower)) return true;
  }
  return false;
}

async function fetchMatchesForText(familyId, itemText) {
  const lock = db
    .prepare('SELECT * FROM item_locks WHERE family_id = ? AND item_text = ?')
    .get(familyId, normalizeText(itemText));

  if (!isKassalappConfigured()) {
    const demo = getDemoMatch(itemText);
    if (!demo) return [];
    const settings = getFamilySettings(familyId);
    const allowedChains = settings.enabledChains.length > 0 ? new Set(settings.enabledChains.map((c) => c.toLowerCase())) : null;
    const stores = demo.prices
      .filter((p) => chainAllowed(p.store, allowedChains))
      .map((p) => ({ store_name: p.store, store_id: null, price: p.price, is_offer: p.is_offer }));
    if (stores.length === 0) return [];
    return [{ ean: demo.ean, product_name: demo.product_name, image_url: null, stores }];
  }

  if (itemText.trim().length < 3) return []; // Kassalapp krever minimum 3 tegn i søket

  const rows = await searchProducts(itemText, 50);
  let products = groupByProduct(rows);

  const allowedChains = await getAllowedChainNames(familyId);
  products = products
    .map((p) => ({ ...p, stores: p.stores.filter((s) => chainAllowed(s.store_name, allowedChains)) }))
    .filter((p) => p.stores.length > 0);

  // Kassalapp sin egen fuzzy-rangering er ikke alltid til hjelp for et bredt
  // søkeord ("Melk" kan gi treff i mandelmelk/kokosmelk før vanlig melk) –
  // et produkt som føres av MANGE butikker er som regel et vanligere/mer
  // "standard" produkt enn et som bare føres ett sted, så det brukes som
  // hovedsorteringen i stedet for rekkefølgen fra søket.
  products.sort((a, b) => b.stores.length - a.stores.length);

  if (lock) {
    const lockedFirst = products.find((p) => p.ean === lock.ean);
    if (lockedFirst) {
      products = [lockedFirst, ...products.filter((p) => p.ean !== lock.ean)];
    }
  }

  return products.slice(0, MAX_MATCHES_PER_ITEM);
}

// Matcher én handleliste-linje mot Kassalapp (eller demodata) og lagrer
// resultatet – erstatter ev. tidligere treff for samme linje.
export async function matchShoppingItem(familyId, shoppingItem) {
  const matches = await fetchMatchesForText(familyId, shoppingItem.name);

  db.prepare('DELETE FROM product_matches WHERE shopping_item_id = ?').run(shoppingItem.id);

  matches.forEach((product, rank) => {
    const info = db
      .prepare(
        `INSERT INTO product_matches (family_id, shopping_item_id, ean, product_name, image_url, rank)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(familyId, shoppingItem.id, product.ean, product.product_name, product.image_url, rank);
    const insertPrice = db.prepare(
      `INSERT INTO product_prices (match_id, store_name, store_id, price, is_offer) VALUES (?, ?, ?, ?, ?)`
    );
    for (const store of product.stores) {
      insertPrice.run(info.lastInsertRowid, store.store_name, store.store_id, store.price, store.is_offer ? 1 : 0);
    }
  });

  return matches.length;
}

export async function matchAllForFamily(familyId, io) {
  const items = db.prepare('SELECT * FROM shopping_items WHERE family_id = ? AND checked = 0').all(familyId);
  for (const item of items) {
    try {
      await matchShoppingItem(familyId, item);
    } catch (err) {
      console.error(`Smart handleliste: klarte ikke matche "${item.name}":`, err.message);
    }
  }
  io?.to(`family:${familyId}`).emit('smart-shopping:update');
}

// ---- Debounce: kjør 30 sek etter siste endring på handlelisten, per familie ----
const debounceTimers = new Map();
export function scheduleMatchingRun(familyId, io) {
  const settings = getFamilySettings(familyId);
  if (!settings.enabled) return;
  clearTimeout(debounceTimers.get(familyId));
  debounceTimers.set(
    familyId,
    setTimeout(() => {
      debounceTimers.delete(familyId);
      matchAllForFamily(familyId, io).catch((err) =>
        console.error('Smart handleliste: feil under matching:', err.message)
      );
    }, 30 * 1000)
  );
}

export function lockItem(familyId, itemText, ean, productName) {
  db.prepare(
    `INSERT INTO item_locks (family_id, item_text, ean, product_name) VALUES (?, ?, ?, ?)
     ON CONFLICT(family_id, item_text) DO UPDATE SET ean = excluded.ean, product_name = excluded.product_name, locked_at = datetime('now')`
  ).run(familyId, normalizeText(itemText), ean, productName);
}

export function getItemMatches(shoppingItemId) {
  const matches = db
    .prepare('SELECT * FROM product_matches WHERE shopping_item_id = ? ORDER BY rank ASC')
    .all(shoppingItemId);
  return matches.map((m) => ({
    ...m,
    prices: db
      .prepare('SELECT store_name, store_id, price, is_offer FROM product_prices WHERE match_id = ? ORDER BY price ASC')
      .all(m.id)
      // SQLite lagrer boolean som 0/1 – konverter eksplisitt, ellers
      // rendrer React en bokstavelig "0" i JSX for {is_offer && <Badge/>}.
      .map((p) => ({ ...p, is_offer: Boolean(p.is_offer) })),
  }));
}

// Beste (laveste) pris per linje per butikk -> kurvtotal, dekningsgrad og
// antall tilbud per butikk. Ingen vekting av bestemte kjeder: butikker
// sorteres kun på total pris.
export function getPriceCheckSummary(familyId) {
  const items = db.prepare('SELECT id FROM shopping_items WHERE family_id = ? AND checked = 0').all(familyId);
  const totalLines = items.length;
  const storeTotals = new Map(); // store_name -> { total, coveredLines, offerCount }
  const itemBadges = {}; // shopping_item_id -> { price, storeName, isOffer } (billigste treff for linjen)

  for (const item of items) {
    const matches = db
      .prepare('SELECT id FROM product_matches WHERE shopping_item_id = ? ORDER BY rank ASC LIMIT 1')
      .all(item.id);
    if (matches.length === 0) continue;
    const prices = db
      .prepare('SELECT store_name, price, is_offer FROM product_prices WHERE match_id = ? ORDER BY price ASC')
      .all(matches[0].id);
    if (prices.length > 0) {
      const cheapestForItem = prices[0];
      itemBadges[item.id] = {
        price: cheapestForItem.price,
        storeName: cheapestForItem.store_name,
        isOffer: Boolean(cheapestForItem.is_offer),
      };
    }
    for (const p of prices) {
      if (!storeTotals.has(p.store_name)) {
        storeTotals.set(p.store_name, { store: p.store_name, total: 0, coveredLines: 0, offerCount: 0 });
      }
      const entry = storeTotals.get(p.store_name);
      entry.total += p.price;
      entry.coveredLines += 1;
      if (p.is_offer) entry.offerCount += 1;
    }
  }

  const stores = [...storeTotals.values()].sort((a, b) => a.total - b.total);
  const cheapest = stores.slice(0, 3);
  const mostExpensive = stores[stores.length - 1];
  const savings = mostExpensive && cheapest[0] ? Math.round((mostExpensive.total - cheapest[0].total) * 100) / 100 : 0;

  return {
    enabled: getFamilySettings(familyId).enabled,
    totalLines,
    stores: stores.map((s) => ({
      store: s.store,
      total: Math.round(s.total * 100) / 100,
      coveredLines: s.coveredLines,
      offerCount: s.offerCount,
    })),
    cheapest3: cheapest.map((s) => s.store),
    savingsVsMostExpensive: savings,
    itemBadges,
  };
}

// Integrasjonspunkt for andre moduler (Morgenbrief, middagsplanlegger) –
// se punkt 7 i spesifikasjonen. Kun forberedt, ikke bygget videre ut ennå.
export function getCheapestStoreForFamily(familyId) {
  const summary = getPriceCheckSummary(familyId);
  if (!summary.enabled || summary.stores.length === 0) return null;
  const best = summary.stores[0];
  return { store: best.store, total: best.total, coveredLines: best.coveredLines, totalLines: summary.totalLines };
}

export function isConfigured() {
  return isKassalappConfigured();
}

// Kjører matching for alle familier én gang per natt (kl. 03:00), i tillegg
// til den debounsede kjøringen når handlelisten faktisk endres – fanger opp
// prisendringer på varer ingen har rørt på en stund.
const NIGHTLY_HOUR = 3;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
let lastNightlyRunDate = null;

export function startSmartShoppingScheduler(io) {
  async function check() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (lastNightlyRunDate === today || now.getHours() !== NIGHTLY_HOUR) return;
    lastNightlyRunDate = today;
    console.log('🛒 Smart handleliste: kjører nattlig prissjekk for alle familier…');
    const families = db.prepare('SELECT id FROM families').all();
    for (const { id } of families) {
      await matchAllForFamily(id, io).catch((err) =>
        console.error(`Smart handleliste: nattlig kjøring feilet for familie ${id}:`, err.message)
      );
    }
  }
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

export { getDemoStores };
