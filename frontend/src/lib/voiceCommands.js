// Tolker en talekommando (norsk tekst) til et strukturert intent-objekt.
//
// I dag gjøres dette med enkel nøkkelord-matching. Funksjonen er bevisst
// asynkron og returnerer samme intent-form som et fremtidig AI-API-kall
// ville gjort (f.eks. et LLM-kall som klassifiserer setningen) – slik kan
// implementasjonen byttes ut uten at noe annet i appen må endres.
//
// Intent-former:
//   { type: 'ADD_SHOPPING_ITEM', item: string }
//   { type: 'SET_TIMER', minutes: number, label: string }
//   { type: 'TOGGLE_PLUG', name: string, on: boolean }
//   { type: 'TODAY_SUMMARY' }
//   { type: 'ADD_CALENDAR_EVENT', title: string, start_at: string, end_at: string, all_day: boolean }
//   { type: 'PLAY_MORNING_BRIEF' }
//   { type: 'UNKNOWN', raw: string }

const WEEKDAYS_NB = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

function resolveCalendarDate(clause) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const text = (clause || '').toLowerCase();
  if (text.includes('i morgen')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text.includes('i dag')) return now;
  for (let i = 0; i < WEEKDAYS_NB.length; i += 1) {
    if (text.includes(WEEKDAYS_NB[i])) {
      const delta = (i - now.getDay() + 7) % 7;
      const d = new Date(now);
      d.setDate(d.getDate() + delta);
      return d;
    }
  }
  return now;
}

function buildCalendarEvent(m) {
  const title = m[1].trim();
  const rest = m[2] || '';
  const date = resolveCalendarDate(rest);
  const timeMatch = rest.match(/kl(?:okka|okken)?\.?\s*(\d{1,2})(?:[:.](\d{2}))?/i);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = timeMatch[2] ? Number(timeMatch[2]) : 0;
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { title, start_at: start.toISOString(), end_at: end.toISOString(), all_day: false };
  }
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return { title, start_at: start.toISOString(), end_at: end.toISOString(), all_day: true };
}

const PATTERNS = [
  {
    type: 'ADD_CALENDAR_EVENT',
    regex: /(?:legg til|sett inn|book|opprett)\s+(.+?)\s+(?:i|til)\s+kalender(?:en)?\b(.*)$/i,
    build: buildCalendarEvent,
  },
  {
    type: 'ADD_SHOPPING_ITEM',
    regex: /legg til (.+?) (?:på|i) handle\s?listen?/i,
    build: (m) => ({ item: m[1].trim() }),
  },
  {
    type: 'SET_TIMER',
    regex: /(?:sett|start)\s*(?:en\s*)?timer(?:\s*på)?\s*(\d+)\s*minutt/i,
    build: (m) => ({ minutes: Number(m[1]), label: '' }),
  },
  {
    type: 'TOGGLE_PLUG',
    regex: /slå\s+(på|av)\s+(.+)/i,
    build: (m) => ({ on: m[1].toLowerCase() === 'på', name: m[2].trim() }),
  },
  {
    type: 'TODAY_SUMMARY',
    regex: /hva skjer i dag/i,
    build: () => ({}),
  },
  {
    type: 'PLAY_MORNING_BRIEF',
    regex: /god morgen/i,
    build: () => ({}),
  },
];

export async function parseVoiceCommand(text) {
  const raw = text.trim();
  for (const pattern of PATTERNS) {
    const match = raw.match(pattern.regex);
    if (match) {
      return { type: pattern.type, raw, ...pattern.build(match) };
    }
  }
  return { type: 'UNKNOWN', raw };
}
