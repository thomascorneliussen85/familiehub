import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

let cache = { key: null, fetchedAt: 0, data: null };
const CACHE_MS = 15 * 60 * 1000;

// Henter sluttkurs + prosentendring for en tickerliste. KUN tall/prosent –
// aldri anbefalinger eller vurderinger (håndheves også i AI-systempromptet).
export async function getMarketData(tickers = []) {
  if (tickers.length === 0) return [];
  const key = tickers.slice().sort().join(',');

  if (cache.key === key && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  try {
    const quotes = await yahooFinance.quote(tickers);
    const list = Array.isArray(quotes) ? quotes : [quotes];
    const data = list.map((q) => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      currency: q.currency || '',
    }));
    cache = { key, fetchedAt: Date.now(), data };
    return data;
  } catch (err) {
    if (cache.data) return cache.data;
    throw err;
  }
}
