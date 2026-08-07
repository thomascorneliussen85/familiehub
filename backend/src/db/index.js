import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrering: friend_families kan finnes fra før del 1, uten friend_hub_id-kolonnen.
const friendFamiliesColumns = db.prepare('PRAGMA table_info(friend_families)').all().map((c) => c.name);
if (!friendFamiliesColumns.includes('friend_hub_id')) {
  db.exec('ALTER TABLE friend_families ADD COLUMN friend_hub_id TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_families_hub ON friend_families(friend_hub_id)');

// Migrering: calendar_events kan finnes fra før, uten disse kolonnene.
const calendarEventsColumns = db.prepare('PRAGMA table_info(calendar_events)').all().map((c) => c.name);
if (!calendarEventsColumns.includes('recurrence')) {
  db.exec("ALTER TABLE calendar_events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'once'");
}
if (!calendarEventsColumns.includes('external_id')) {
  db.exec('ALTER TABLE calendar_events ADD COLUMN external_id TEXT');
}
if (!calendarEventsColumns.includes('connection_id')) {
  db.exec('ALTER TABLE calendar_events ADD COLUMN connection_id INTEGER REFERENCES calendar_connections(id) ON DELETE CASCADE');
}

const { n: locationCount } = db.prepare('SELECT COUNT(*) AS n FROM play_locations').get();
if (locationCount === 0) {
  const insertLocation = db.prepare(
    'INSERT INTO play_locations (label, emoji, sort_order) VALUES (?, ?, ?)'
  );
  insertLocation.run('Hjemme hos oss', '🏠', 1);
  insertLocation.run('Lekeplassen', '🛝', 2);
  insertLocation.run('Ballbingen', '⚽', 3);
  insertLocation.run('Ute i gaten', '🚸', 4);
}

// Kuratert startliste med bibelvers til Morgenbrief-modulen "dagens vers".
// fallback_text_no dekker demo-/offline-bruk (bible-api.com har ikke norsk).
const { n: verseCount } = db.prepare('SELECT COUNT(*) AS n FROM bible_verses').get();
if (verseCount === 0) {
  const insertVerse = db.prepare(
    'INSERT INTO bible_verses (reference, fallback_text_no, sort_order) VALUES (?, ?, ?)'
  );
  [
    ['Salme 23:1', 'Herren er min hyrde, jeg mangler ingenting.'],
    ['Filipperne 4:13', 'Alt makter jeg i ham som gjør meg sterk.'],
    ['Jeremia 29:11', 'For jeg vet hvilke tanker jeg har med dere, sier Herren, fredstanker og ikke ulykkestanker. Jeg vil gi dere fremtid og håp.'],
    ['Ordspråkene 3:5-6', 'Sett din lit til Herren av hele ditt hjerte, og stol ikke på din egen forstand! Kjenn ham på alle dine veier, så skal han jevne dine stier.'],
    ['Jesaja 41:10', 'Vær ikke redd, for jeg er med deg. Se deg ikke rådvill om, for jeg er din Gud. Jeg gjør deg sterk og hjelper deg og holder deg oppe med min rettferds høyre hånd.'],
    ['Salme 118:24', 'Dette er dagen som Herren har gjort. La oss juble og glede oss på den!'],
    ['Matteus 6:34', 'Vær ikke bekymret for morgendagen, for morgendagen skal bekymre seg for seg selv. Hver dag har nok med sin egen plage.'],
    ['Romerne 8:28', 'Vi vet at alle ting samvirker til gode for dem som elsker Gud.'],
    ['1 Korinterbrev 13:4-7', 'Kjærligheten er tålmodig, kjærligheten er velvillig, den misunner ikke, skryter ikke, er ikke hovmodig.'],
    ['Salme 46:1', 'Gud er vår tilflukt og styrke, en hjelp i nød, funnet så visselig.'],
    ['Josva 1:9', 'Vær frimodig og sterk! La deg ikke skremme, og mist ikke motet, for Herren din Gud er med deg overalt hvor du går.'],
    ['Matteus 11:28', 'Kom til meg, alle dere som strever og bærer tunge byrder, og jeg vil gi dere hvile.'],
    ['Galaterne 5:22-23', 'Åndens frukt er kjærlighet, glede, fred, overbærenhet, vennlighet, godhet, trofasthet, ydmykhet og selvbeherskelse.'],
    ['Salme 37:4', 'Gled deg i Herren! Så skal han gi deg det ditt hjerte ber om.'],
    ['Ordspråkene 16:3', 'Legg dine gjerninger i Herrens hånd, så skal dine planer lykkes.'],
  ].forEach(([reference, fallback_text_no], i) => insertVerse.run(reference, fallback_text_no, i + 1));
}

// Morgenbrief: gi eksisterende familiemedlemmer fornuftige standardinnstillinger
// slik at modulen kan demonstreres med det samme – én voksen med markedsdata,
// én voksen med nyheter+vers, og barneprofiler med den forenklede briefen.
const { n: briefSettingsCount } = db.prepare('SELECT COUNT(*) AS n FROM brief_settings').get();
if (briefSettingsCount === 0) {
  const members = db
    .prepare('SELECT id, role FROM family_members ORDER BY sort_order, id')
    .all();
  const insertBriefSettings = db.prepare(
    `INSERT INTO brief_settings
       (member_id, module_calendar, module_weather, module_power, module_chores,
        module_news, module_market, module_verse, module_quote, module_fact,
        tickers, rss_feed_urls, preferred_time)
     VALUES (@member_id, @module_calendar, @module_weather, @module_power, @module_chores,
             @module_news, @module_market, @module_verse, @module_quote, @module_fact,
             @tickers, @rss_feed_urls, @preferred_time)`
  );
  let adultsSeen = 0;
  for (const member of members) {
    if (member.role === 'barn') {
      insertBriefSettings.run({
        member_id: member.id,
        module_calendar: 1,
        module_weather: 1,
        module_power: 0,
        module_chores: 1,
        module_news: 0,
        module_market: 0,
        module_verse: 0,
        module_quote: 0,
        module_fact: 1,
        tickers: '[]',
        rss_feed_urls: '[]',
        preferred_time: '07:00',
      });
      continue;
    }
    adultsSeen += 1;
    if (adultsSeen === 1) {
      // Første voksen: marked på (kun tall/prosent, aldri råd)
      insertBriefSettings.run({
        member_id: member.id,
        module_calendar: 1,
        module_weather: 1,
        module_power: 1,
        module_chores: 1,
        module_news: 0,
        module_market: 1,
        module_verse: 0,
        module_quote: 0,
        module_fact: 0,
        tickers: JSON.stringify(['EQNR.OL', 'DNB.OL', '^GSPC', 'TSLA']),
        rss_feed_urls: '[]',
        preferred_time: '06:45',
      });
    } else if (adultsSeen === 2) {
      // Andre voksen: nyheter + dagens vers
      insertBriefSettings.run({
        member_id: member.id,
        module_calendar: 1,
        module_weather: 1,
        module_power: 0,
        module_chores: 1,
        module_news: 1,
        module_market: 0,
        module_verse: 1,
        module_quote: 0,
        module_fact: 0,
        tickers: '[]',
        rss_feed_urls: '[]',
        preferred_time: '07:00',
      });
    } else {
      insertBriefSettings.run({
        member_id: member.id,
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
      });
    }
  }
}
