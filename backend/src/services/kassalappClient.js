import fetch from 'node-fetch';
import { config } from '../config.js';

// Ekte API-oppførsel bekreftet mot den offisielle Python-klienten sin
// kildekode (github.com/bendikrb/kassalappy) siden kassal.app sine egne
// dokumentasjonssider er en JS-rendret app vi ikke kan lese direkte:
//   base: https://kassal.app/api/v1, auth: "Authorization: Bearer <nøkkel>"
//   GET /products?search=&unique=1     – fritekstsøk (fuzzy), én rad per treff
//   GET /products/ean/{ean}            – samme produkt sammenlignet på tvers av butikker
//   GET /physical-stores?proximity=... – fysiske butikker nær et punkt
const BASE_URL = 'https://kassal.app/api/v1';

// ---- Enkel kø/throttle: maks 50 kall per rullerende 60-sekunders vindu
// (litt under gratis-grensen på 60/min, som sikkerhetsmargin). ----
const RATE_LIMIT_PER_MINUTE = 50;
const WINDOW_MS = 60 * 1000;
const requestTimestamps = [];
const queue = [];
let draining = false;

function scheduleDrain() {
  if (draining) return;
  draining = true;
  drainQueue();
}

async function drainQueue() {
  while (queue.length > 0) {
    const now = Date.now();
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] > WINDOW_MS) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
      const waitMs = WINDOW_MS - (now - requestTimestamps[0]) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const job = queue.shift();
    requestTimestamps.push(Date.now());
    try {
      const result = await job.run();
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    }
  }
  draining = false;
}

function enqueue(run) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject });
    scheduleDrain();
  });
}

// ---- Aggressiv cache: samme spørring gjenbrukes i stedet for å belaste
// rate-limiten på nytt. Søk cachet kort (produktutvalg endrer seg sjelden i
// løpet av en dag), EAN-prissammenligning cachet lenger (pris endrer seg
// typisk ikke flere ganger samme dag). ----
const SEARCH_CACHE_MS = 6 * 60 * 60 * 1000;
const EAN_CACHE_MS = 12 * 60 * 60 * 1000;
const STORES_CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // key -> { value, expiresAt }

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}
function setCached(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function request(path, params = {}) {
  if (!config.kassalapp.apiKey) {
    throw new Error('KASSALAPP_API_KEY er ikke satt');
  }
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, value);
  }
  return enqueue(async () => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.kassalapp.apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'FamilieHub/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`Kassalapp svarte ${res.status} for ${path}`);
    }
    const body = await res.json();
    return body?.data ?? body;
  });
}

export function isKassalappConfigured() {
  return Boolean(config.kassalapp.apiKey);
}

// Fritekstsøk med fuzzy matching – returnerer opptil `size` produkttreff,
// hver med produsent/butikk/pris for akkurat den ene raden (bruk
// getProductByEan for full butikk-sammenligning av ett spesifikt treff).
export async function searchProducts(search, size = 10) {
  const key = `search:${search.toLowerCase()}:${size}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await request('products', { search, size, unique: 1 });
  const result = Array.isArray(data) ? data : [];
  setCached(key, result, SEARCH_CACHE_MS);
  return result;
}

// Sammenligner ett spesifikt produkt (identifisert med strekkode/EAN) på
// tvers av alle butikker Kassalapp har prisdata for.
export async function getProductByEan(ean) {
  const key = `ean:${ean}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await request(`products/ean/${ean}`);
  setCached(key, data, EAN_CACHE_MS);
  return data;
}

// Fysiske butikker i nærheten av et punkt (lat/lng/km), for å begrense
// prissammenligningen til butikker familien faktisk kan handle i.
export async function getNearbyStores(lat, lng, km) {
  const key = `stores:${lat.toFixed(3)}:${lng.toFixed(3)}:${km}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await request('physical-stores', { lat, lng, km, size: 100 });
  const result = Array.isArray(data) ? data : [];
  setCached(key, result, STORES_CACHE_MS);
  return result;
}
