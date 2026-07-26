import fetch from 'node-fetch';
import { config } from '../config.js';

const cache = new Map(); // key: "YYYY-MM-DD_AREA" -> { fetchedAt, data }
const CACHE_MS = 30 * 60 * 1000;

function dateParts(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return { y, m, d };
}

async function fetchPricesForDate(date) {
  const area = config.powerPrice.area;
  const { y, m, d } = dateParts(date);
  const cacheKey = `${y}-${m}-${d}_${area}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.data;
  }

  const url = `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_${area}.json`;
  const res = await fetch(url);
  if (res.status === 404) {
    cache.set(cacheKey, { fetchedAt: Date.now(), data: null });
    return null; // f.eks. morgendagens priser ikke publisert ennå
  }
  if (!res.ok) throw new Error(`hvakosterstrommen.no svarte med status ${res.status}`);
  const raw = await res.json();
  const hours = raw.map((entry) => ({
    time: entry.time_start,
    nokPerKwh: entry.NOK_per_kWh,
  }));
  cache.set(cacheKey, { fetchedAt: Date.now(), data: hours });
  return hours;
}

export async function getPowerPrices() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayPrices, tomorrowPrices] = await Promise.all([
    fetchPricesForDate(today),
    fetchPricesForDate(tomorrow).catch(() => null),
  ]);

  const currentHour = new Date().getHours();
  const cheapestHours = (list) => {
    if (!list) return [];
    const sorted = [...list].sort((a, b) => a.nokPerKwh - b.nokPerKwh);
    return sorted.slice(0, 3).map((h) => h.time);
  };

  return {
    area: config.powerPrice.area,
    currentHour,
    today: todayPrices,
    tomorrow: tomorrowPrices,
    cheapestToday: cheapestHours(todayPrices),
    cheapestTomorrow: cheapestHours(tomorrowPrices),
  };
}
