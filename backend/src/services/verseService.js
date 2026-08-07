import fetch from 'node-fetch';
import { db } from '../db/index.js';

// Velger "dagens vers" deterministisk basert på datoen, slik at alle i
// familien får samme vers samme dag og det ikke endrer seg ved regenerering.
function pickVerseForDate(dateStr) {
  const verses = db.prepare('SELECT * FROM bible_verses ORDER BY sort_order, id').all();
  if (verses.length === 0) return null;
  const dayNumber = Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 86400000);
  const index = ((dayNumber % verses.length) + verses.length) % verses.length;
  return verses[index];
}

// Henter dagens vers: engelsk tekst fra bible-api.com (ingen norsk oversettelse
// tilgjengelig der), med kuratert norsk fallback ved feil/nettverksproblemer.
// AI-en oversetter og reflekterer over verset når briefen settes sammen.
export async function getDailyVerse(dateStr) {
  const verse = pickVerseForDate(dateStr);
  if (!verse) return null;

  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(verse.reference)}`);
    if (!res.ok) throw new Error(`bible-api.com svarte med status ${res.status}`);
    const json = await res.json();
    return {
      reference: verse.reference,
      textEnglish: (json.text || '').trim(),
      fallbackTextNo: verse.fallback_text_no,
    };
  } catch {
    return {
      reference: verse.reference,
      textEnglish: null,
      fallbackTextNo: verse.fallback_text_no,
    };
  }
}
