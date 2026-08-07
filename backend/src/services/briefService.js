import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getWeather } from './weatherService.js';
import { getBusDepartures } from './enturService.js';
import { getPowerPrices } from './powerPriceService.js';
import { getNews } from './newsService.js';
import { getMarketData } from './marketService.js';
import { getDailyVerse } from './verseService.js';
import { getDailyQuote, getDailyFunFact } from './quoteFactService.js';

const SYSTEM_PROMPT =
  'Du er en varm, kortfattet norsk morgenvert. Lag en brief på maks 200 ord i naturlig ' +
  'muntlig språk. Rekkefølge: hilsen med navn, dagens viktigste kalenderpunkt, vær + buss, ' +
  'deretter valgte moduler. For marked: kun fakta og tall, aldri råd. For bibelvers: verset ' +
  '+ 2-3 setninger varm refleksjon. Avslutt med en kort oppmuntring.';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function todayStr(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function defaultSettings(memberId) {
  return {
    member_id: memberId,
    module_calendar: 1,
    module_weather: 1,
    module_power: 0,
    module_chores: 1,
    module_news: 0,
    module_market: 0,
    module_verse: 0,
    module_quote: 0,
    module_fact: 0,
    tickers: '[]',
    rss_feed_urls: '[]',
    preferred_time: '07:00',
  };
}

export function getMemberBriefSettings(memberId) {
  const existing = db.prepare('SELECT * FROM brief_settings WHERE member_id = ?').get(memberId);
  if (existing) return existing;
  const defaults = defaultSettings(memberId);
  db.prepare(
    `INSERT INTO brief_settings
       (member_id, module_calendar, module_weather, module_power, module_chores,
        module_news, module_market, module_verse, module_quote, module_fact,
        tickers, rss_feed_urls, preferred_time)
     VALUES (@member_id, @module_calendar, @module_weather, @module_power, @module_chores,
             @module_news, @module_market, @module_verse, @module_quote, @module_fact,
             @tickers, @rss_feed_urls, @preferred_time)`
  ).run(defaults);
  return defaults;
}

// Utvider ukentlig gjentakende avtaler til dagens forekomst (samme logikk som
// backend/src/routes/calendar.js).
function expandWeeklyForToday(events, dayStartMs, dayEndMs) {
  const result = [];
  for (const e of events) {
    const originalStart = new Date(e.start_at).getTime();
    const duration = new Date(e.end_at).getTime() - originalStart;
    let occStart = originalStart;
    if (occStart < dayStartMs) {
      occStart += Math.ceil((dayStartMs - occStart) / WEEK_MS) * WEEK_MS;
    }
    if (occStart < dayEndMs && occStart + duration > dayStartMs) {
      result.push({ ...e, start_at: new Date(occStart).toISOString() });
    }
  }
  return result;
}

function getTodaysEvents(memberId, dayStart, dayEnd) {
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();
  const onceRows = db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE (member_id = ? OR member_id IS NULL) AND recurrence = 'once'
         AND start_at < ? AND end_at > ?
       ORDER BY start_at`
    )
    .all(memberId, dayEndIso, dayStartIso);
  const weeklyBases = db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE (member_id = ? OR member_id IS NULL) AND recurrence = 'weekly'`
    )
    .all(memberId);
  const expanded = expandWeeklyForToday(weeklyBases, dayStart.getTime(), dayEnd.getTime());
  return [...onceRows, ...expanded].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
}

function getTodaysChores(memberId) {
  const chores = db
    .prepare(`SELECT * FROM chores WHERE member_id = ? AND active = 1`)
    .all(memberId);
  const today = todayStr();
  const completionStmt = db.prepare(
    'SELECT 1 FROM chore_completions WHERE chore_id = ? AND completed_on = ?'
  );
  return chores
    .filter((c) => c.recurrence === 'daily' || c.due_date === today || c.recurrence.startsWith('weekly:'))
    .map((c) => ({ ...c, done: Boolean(completionStmt.get(c.id, today)) }));
}

// Samler inn data for hver aktiverte modul for et familiemedlem. Barneprofiler
// (role='barn') får ALDRI nyheter eller marked, uansett lagrede innstillinger.
async function gatherModuleData(member, settings, dateStr) {
  const isChild = member.role === 'barn';
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const data = {};
  const usedModules = [];

  if (settings.module_calendar) {
    data.calendar = getTodaysEvents(member.id, dayStart, dayEnd);
    usedModules.push('calendar');
  }
  if (settings.module_weather) {
    const [weather, bus] = await Promise.allSettled([getWeather(), getBusDepartures()]);
    data.weather = weather.status === 'fulfilled' ? weather.value : null;
    data.bus = bus.status === 'fulfilled' ? bus.value : null;
    usedModules.push('weather');
  }
  if (settings.module_power) {
    data.power = await getPowerPrices().catch(() => null);
    usedModules.push('power');
  }
  if (settings.module_chores) {
    data.chores = getTodaysChores(member.id);
    usedModules.push('chores');
  }
  if (settings.module_news && !isChild) {
    const feeds = JSON.parse(settings.rss_feed_urls || '[]');
    data.news = await getNews(feeds).catch(() => []);
    usedModules.push('news');
  }
  if (settings.module_market && !isChild) {
    const tickers = JSON.parse(settings.tickers || '[]');
    data.market = await getMarketData(tickers).catch(() => []);
    usedModules.push('market');
  }
  if (settings.module_verse) {
    data.verse = await getDailyVerse(dateStr).catch(() => null);
    usedModules.push('verse');
  }
  if (settings.module_quote) {
    data.quote = getDailyQuote(dateStr);
    usedModules.push('quote');
  }
  if (settings.module_fact && isChild) {
    data.fact = getDailyFunFact(dateStr);
    usedModules.push('fact');
  }

  return { data, usedModules };
}

function formatDataForPrompt(member, data) {
  const lines = [`Navn: ${member.name}`];

  if (data.calendar) {
    if (data.calendar.length === 0) {
      lines.push('Kalender i dag: ingen avtaler.');
    } else {
      lines.push(
        'Kalender i dag: ' +
          data.calendar
            .map((e) => {
              const time = e.all_day ? 'hele dagen' : new Date(e.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
              return `${e.title} (${time}${e.location ? ', ' + e.location : ''})`;
            })
            .join('; ')
      );
    }
  }

  if (data.weather) {
    const hours = data.weather.hourly || [];
    const nowHour = hours[0];
    const temps = hours.slice(0, 24).map((h) => h.temperature).filter((t) => t != null);
    const min = temps.length ? Math.min(...temps) : null;
    const max = temps.length ? Math.max(...temps) : null;
    lines.push(
      `Vær nå: ${nowHour?.temperature ?? '?'}°C. I dag mellom ${min ?? '?'}°C og ${max ?? '?'}°C.` +
        (nowHour?.precipitation ? ` Nedbør ventet.` : '')
    );
  }
  if (data.bus) {
    if (data.bus.configured && data.bus.departures?.length) {
      lines.push(
        'Neste busser fra ' +
          (data.bus.stopName || 'holdeplassen') +
          ': ' +
          data.bus.departures
            .slice(0, 3)
            .map((d) => `linje ${d.line} kl. ${new Date(d.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`)
            .join(', ')
      );
    }
  }

  if (data.power && data.power.today) {
    const currentPrice = data.power.today[data.power.currentHour]?.nokPerKwh;
    lines.push(
      `Strømpris nå: ${currentPrice != null ? (currentPrice * 100).toFixed(0) + ' øre/kWh' : 'ukjent'}.` +
        (data.power.cheapestToday?.length
          ? ` Billigst i dag rundt kl. ${new Date(data.power.cheapestToday[0]).toLocaleTimeString('nb-NO', { hour: '2-digit' })}.`
          : '')
    );
  }

  if (data.chores) {
    const undone = data.chores.filter((c) => !c.done);
    lines.push(
      undone.length === 0
        ? 'Gjøremål i dag: alt er gjort! 🎉'
        : `Gjøremål i dag: ${undone.map((c) => c.title).join(', ')}.`
    );
  }

  if (data.news && data.news.length) {
    lines.push(
      'Nyhetsoverskrifter: ' + data.news.slice(0, 5).map((n) => n.title).join('; ')
    );
  }

  if (data.market && data.market.length) {
    lines.push(
      'Markedstall (kun fakta, ingen anbefalinger): ' +
        data.market
          .map((m) => `${m.symbol}: ${m.price != null ? m.price.toFixed(2) : '?'} ${m.currency} (${m.changePercent != null ? (m.changePercent >= 0 ? '+' : '') + m.changePercent.toFixed(2) + '%' : '?'})`)
          .join(', ')
    );
  }

  if (data.verse) {
    lines.push(
      `Dagens bibelvers (${data.verse.reference}), engelsk originaltekst du skal oversette til norsk: "${data.verse.textEnglish || data.verse.fallbackTextNo}"`
    );
  }

  if (data.quote) {
    lines.push(`Dagens sitat: "${data.quote}"`);
  }

  if (data.fact) {
    lines.push(`Morsom fakta: ${data.fact}`);
  }

  return lines.join('\n');
}

// Enkel, ferdiggenerert demobrief (ingen AI-kall) – brukes når ANTHROPIC_API_KEY
// mangler eller AI-kallet feiler, slik at modulen kan demonstreres uansett.
function buildDemoBrief(member, data) {
  const parts = [`God morgen, ${member.name}! ☀️`];

  if (data.calendar) {
    parts.push(
      data.calendar.length === 0
        ? 'Ingen avtaler i dag – en rolig dag foran deg.'
        : `Først ut i dag: ${data.calendar[0].title}${data.calendar[0].location ? ' på ' + data.calendar[0].location : ''}.`
    );
  }
  if (data.weather) {
    const nowHour = data.weather.hourly?.[0];
    parts.push(`Det er ${nowHour?.temperature ?? '?'}°C ute nå.`);
  }
  if (data.bus?.configured && data.bus.departures?.length) {
    const next = data.bus.departures[0];
    parts.push(`Neste buss (linje ${next.line}) går kl. ${new Date(next.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}.`);
  }
  if (data.power?.today) {
    const currentPrice = data.power.today[data.power.currentHour]?.nokPerKwh;
    if (currentPrice != null) parts.push(`Strømprisen nå er ${(currentPrice * 100).toFixed(0)} øre/kWh.`);
  }
  if (data.chores) {
    const undone = data.chores.filter((c) => !c.done);
    parts.push(undone.length === 0 ? 'Alle gjøremål er unnagjort – bra jobbet!' : `Husk: ${undone.map((c) => c.title).join(', ')}.`);
  }
  if (data.news?.length) {
    parts.push(`I nyhetsbildet: ${data.news[0].title}.`);
  }
  if (data.market?.length) {
    parts.push(
      'Markedet: ' +
        data.market
          .map((m) => `${m.symbol} ${m.changePercent != null ? (m.changePercent >= 0 ? '+' : '') + m.changePercent.toFixed(1) + '%' : ''}`)
          .join(', ') +
        '.'
    );
  }
  if (data.verse) {
    parts.push(`Dagens vers (${data.verse.reference}): ${data.verse.fallbackTextNo || data.verse.textEnglish}`);
  }
  if (data.quote) {
    parts.push(`Dagens sitat: «${data.quote}»`);
  }
  if (data.fact) {
    parts.push(`Visste du at... ${data.fact}`);
  }
  parts.push('Ha en fin dag! 💪');

  return parts.join(' ');
}

async function callClaude(member, dataText) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: dataText }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text?.trim() || '';
}

// Genererer (eller regenererer) dagens brief for et familiemedlem, og cacher
// resultatet i daily_briefs. Kalles fra POST /api/brief/generate/:memberId.
export async function generateBrief(memberId) {
  const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);
  if (!member) throw new Error('Familiemedlem ikke funnet');

  const settings = getMemberBriefSettings(memberId);
  const dateStr = todayStr();
  const { data, usedModules } = await gatherModuleData(member, settings, dateStr);

  let content;
  let isDemo = false;
  if (config.anthropicApiKey) {
    try {
      content = await callClaude(member, formatDataForPrompt(member, data));
      if (!content) throw new Error('Tomt svar fra Claude');
    } catch (err) {
      console.error('Morgenbrief: Claude-kall feilet, bruker demobrief.', err.message);
      content = buildDemoBrief(member, data);
      isDemo = true;
    }
  } else {
    content = buildDemoBrief(member, data);
    isDemo = true;
  }

  db.prepare('DELETE FROM daily_briefs WHERE member_id = ? AND brief_date = ?').run(memberId, dateStr);
  const info = db
    .prepare(
      `INSERT INTO daily_briefs (member_id, brief_date, content, modules, is_demo)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(memberId, dateStr, content, JSON.stringify(usedModules), isDemo ? 1 : 0);

  return db.prepare('SELECT * FROM daily_briefs WHERE id = ?').get(info.lastInsertRowid);
}

export function getTodaysBrief(memberId) {
  return db
    .prepare('SELECT * FROM daily_briefs WHERE member_id = ? AND brief_date = ?')
    .get(memberId, todayStr());
}
