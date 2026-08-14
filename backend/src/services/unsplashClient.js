import { config } from '../config.js';

export function isUnsplashConfigured() {
  return Boolean(config.unsplash.accessKey);
}

// Best-effort matbilde til en middagsrett – kalles kun når en nøkkel er
// konfigurert (se config.js). Feiler stille (returnerer null) ved feil eller
// tomt treff, slik at ukemeny-generering aldri stopper opp på grunn av bilder.
export async function searchFoodPhoto(query) {
  if (!isUnsplashConfigured()) return null;
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', `${query} food`);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'landscape');
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${config.unsplash.accessKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.urls?.regular || null;
  } catch {
    return null;
  }
}
