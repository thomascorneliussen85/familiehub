import Parser from 'rss-parser';
import { config } from '../config.js';

const parser = new Parser();
const MAX_ITEMS = 20;

let cache = { key: null, fetchedAt: 0, data: null };
const CACHE_MS = 15 * 60 * 1000;

// Henter overskrifter + ingress fra en eller flere RSS-strømmer (maks 20 saker
// totalt). feedUrls tomt/utelatt = bruk standardstrømmen fra .env (NRK).
export async function getNews(feedUrls = []) {
  const urls = feedUrls.length > 0 ? feedUrls : config.brief.defaultRssFeeds;
  const key = urls.join(',');

  if (cache.key === key && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const results = await Promise.allSettled(urls.map((url) => parser.parseURL(url)));
  const items = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value.items || []) {
      items.push({
        title: item.title || '',
        summary: (item.contentSnippet || item.summary || '').trim().slice(0, 300),
        link: item.link || '',
        publishedAt: item.isoDate || item.pubDate || null,
      });
    }
  }

  const data = items.slice(0, MAX_ITEMS);
  if (data.length > 0) {
    cache = { key, fetchedAt: Date.now(), data };
  } else if (cache.data) {
    return cache.data;
  }
  return data;
}
