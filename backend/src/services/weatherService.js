import fetch from 'node-fetch';
import { config } from '../config.js';

let cache = { key: null, fetchedAt: 0, data: null };

function simplifyForecast(raw) {
  const timeseries = raw?.properties?.timeseries ?? [];
  return timeseries.slice(0, 48).map((entry) => {
    const details = entry.data?.instant?.details ?? {};
    const next1h = entry.data?.next_1_hours ?? entry.data?.next_6_hours ?? null;
    return {
      time: entry.time,
      temperature: details.air_temperature ?? null,
      windSpeed: details.wind_speed ?? null,
      humidity: details.relative_humidity ?? null,
      precipitation: next1h?.details?.precipitation_amount ?? null,
      symbolCode: next1h?.summary?.symbol_code ?? null,
    };
  });
}

export async function getWeather() {
  const { lat, lon, userAgent, cacheMinutes } = config.weather;
  const key = `${lat},${lon}`;
  const maxAgeMs = cacheMinutes * 60 * 1000;

  if (cache.key === key && Date.now() - cache.fetchedAt < maxAgeMs) {
    return cache.data;
  }

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) {
    if (cache.data) return cache.data; // fall tilbake på gammel cache ved feil
    throw new Error(`MET-API svarte med status ${res.status}`);
  }
  const raw = await res.json();
  const data = {
    updatedAt: new Date().toISOString(),
    hourly: simplifyForecast(raw),
  };
  cache = { key, fetchedAt: Date.now(), data };
  return data;
}
