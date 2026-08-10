import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
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

// Henter ut den nøyaktige "CREATE TABLE IF NOT EXISTS <table> (...);"-blokken
// for én tabell fra schema.sql, ved å telle parenteser (ikke en enkel regex,
// siden kolonnedefinisjoner selv inneholder parenteser). Brukes til å bygge
// tabellen på nytt i riktig (ny) form under migrering under.
function getCreateTableSql(table) {
  const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = schema.indexOf(marker);
  if (start === -1) throw new Error(`Fant ikke CREATE TABLE for ${table} i schema.sql`);
  let depth = 0;
  let end = start + marker.length - 1;
  for (let i = end; i < schema.length; i += 1) {
    if (schema[i] === '(') depth += 1;
    else if (schema[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        end = schema.indexOf(';', i) + 1;
        break;
      }
    }
  }
  return schema.slice(start, end);
}

// ====== Migrering: flerfamilie-støtte (families/users + family_id) ======
//
// "families"/"users" er helt nye tabeller og opprettes alltid friskt av
// db.exec(schema) over. Men på en database som fantes FØR flerfamilie-støtten
// er alle andre tabeller fortsatt i sin gamle, family_id-løse form (CREATE
// TABLE IF NOT EXISTS er en no-op når tabellen allerede finnes). Denne
// blokken kjører KUN da – styrt av om family_members mangler family_id ennå
// – og bygger de berørte tabellene på nytt med riktig kolonne/UNIQUE-form,
// uten å miste eksisterende data eller endre noen primærnøkler (fremmednøkler
// andre tabeller peker på må forbli identiske).
const familyMembersColumns = db.prepare('PRAGMA table_info(family_members)').all().map((c) => c.name);
const needsTenantMigration = !familyMembersColumns.includes('family_id');

if (needsTenantMigration) {
  console.log('🔧 Migrerer eksisterende database til flerfamilie-støtte …');

  // Viktig: SQLite skriver som standard om REFERENCES-klausuler i ANDRE
  // tabeller når en tabell RENAME-es (f.eks. brief_settings.member_id blir
  // til "family_members_old_migrate") – de blir da hengende til et navn som
  // slettes rett etterpå. "legacy_alter_table" slår av nettopp den
  // automatikken, så uberørte tabeller fortsatt sier "family_members" (som
  // igjen peker riktig med det samme den nye family_members-tabellen finnes).
  // foreign_keys skrus også av under selve ombyggingen siden referanse-
  // integriteten er forbigående i flux mens tabellene bygges om.
  db.pragma('legacy_alter_table = ON');
  db.pragma('foreign_keys = OFF');

  const existingFamily = db.prepare('SELECT id FROM families ORDER BY id LIMIT 1').get();
  let familyId = existingFamily?.id;

  if (!familyId) {
    const email = process.env.INITIAL_ADMIN_EMAIL;
    if (!email) {
      throw new Error(
        'Migrering til flerfamilie-støtte krever INITIAL_ADMIN_EMAIL (og valgfritt ' +
          'INITIAL_ADMIN_PASSWORD) i .env, slik at eksisterende data kan knyttes til en ' +
          'innlogging. Se README.'
      );
    }
    let password = process.env.INITIAL_ADMIN_PASSWORD;
    const generatedPassword = !password;
    if (generatedPassword) password = crypto.randomBytes(9).toString('base64url');

    const familyName = process.env.INITIAL_ADMIN_FAMILY_NAME || config.relay.familyName || 'Min familie';
    familyId = db.prepare('INSERT INTO families (name) VALUES (?)').run(familyName).lastInsertRowid;
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (family_id, email, password_hash) VALUES (?, ?, ?)').run(
      familyId,
      email,
      passwordHash
    );

    if (generatedPassword) {
      console.log('='.repeat(64));
      console.log(`🔑 Opprettet innlogging ${email} med generert passord: ${password}`);
      console.log('   Skriv den ned nå og bytt passord ved første innlogging.');
      console.log('='.repeat(64));
    }
  }

  function migrateTable(table, columns) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (cols.includes('family_id')) return; // allerede migrert (idempotent)
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old_migrate`);
    db.exec(getCreateTableSql(table));
    const colList = columns.join(', ');
    db.exec(
      `INSERT INTO ${table} (${colList}, family_id) SELECT ${colList}, ${familyId} FROM ${table}_old_migrate`
    );
    db.exec(`DROP TABLE ${table}_old_migrate`);
  }

  // family_members først – calendar_events/chores/telemedicine_bookings har
  // fremmednøkkel dit, og skal migreres etter at den er på plass igjen.
  migrateTable('family_members', ['id', 'name', 'role', 'color', 'avatar', 'sort_order', 'created_at']);
  migrateTable('calendar_events', [
    'id', 'member_id', 'title', 'start_at', 'end_at', 'all_day', 'location', 'notes',
    'source', 'google_event_id', 'recurrence', 'external_id', 'connection_id', 'created_at',
  ]);
  migrateTable('chores', ['id', 'member_id', 'title', 'recurrence', 'due_date', 'stars', 'active', 'created_at']);
  migrateTable('shopping_items', ['id', 'name', 'checked', 'checked_at', 'position', 'created_at']);
  migrateTable('quick_items', ['id', 'name', 'icon']);
  migrateTable('smart_plugs', ['id', 'name', 'ip', 'is_on', 'last_watt', 'last_seen_at', 'online', 'created_at']);
  migrateTable('gps_positions', [
    'id', 'device_name', 'lat', 'lon', 'speed', 'battery', 'accuracy', 'recorded_at', 'source', 'created_at',
  ]);
  migrateTable('messages', ['id', 'author', 'text', 'color', 'pos_x', 'pos_y', 'rotation', 'created_at']);
  migrateTable('settings', ['key', 'value']);
  migrateTable('play_locations', ['id', 'label', 'emoji', 'sort_order']);
  migrateTable('friend_families', ['id', 'name', 'pairing_code', 'paired_at', 'approved', 'friend_hub_id']);
  migrateTable('cameras', ['id', 'name', 'rtsp_url', 'created_at']);
  migrateTable('dinner_plans', ['id', 'date', 'title', 'emoji', 'notes', 'created_at']);
  migrateTable('rewards', ['id', 'title', 'description', 'star_cost', 'image', 'active', 'sort_order', 'created_at']);
  migrateTable('telemedicine_bookings', [
    'id', 'member_id', 'doctor_id', 'start_at', 'end_at', 'reason', 'status', 'calendar_event_id', 'created_at',
  ]);

  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
  console.log('✅ Flerfamilie-migrering ferdig.');
}

// Disse kan først opprettes her – etter en ev. migrering over – siden
// kolonnen ikke finnes ennå på en database som migreres fra før flerfamilie-
// støtten fantes (se merknad i schema.sql).
db.exec('CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_family ON calendar_events(family_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_chores_family ON chores(family_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_shopping_items_family ON shopping_items(family_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id)');

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

// Migrering: garmin_activities kan finnes fra før, uten de nye detalj-kolonnene
// for treningscoach-siden (lagt til senere).
const garminActivitiesColumns = db.prepare('PRAGMA table_info(garmin_activities)').all().map((c) => c.name);
[
  'elapsed_seconds',
  'moving_seconds',
  'elevation_loss_m',
  'min_elevation_m',
  'avg_speed_mps',
  'max_speed_mps',
  'avg_cadence',
  'max_cadence',
  'vo2max',
  'aerobic_effect',
  'anaerobic_effect',
  'avg_stride_length_m',
  'lap_count',
  'device_name',
  'raw_json',
].forEach((col) => {
  if (!garminActivitiesColumns.includes(col)) {
    const type = col === 'lap_count' ? 'INTEGER' : col === 'device_name' || col === 'raw_json' ? 'TEXT' : 'REAL';
    db.exec(`ALTER TABLE garmin_activities ADD COLUMN ${col} ${type}`);
  }
});

// Migrering: cameras kan finnes fra før kamera-bro-støtten (auto-oppdagelse
// via en lokal Raspberry Pi-bro), uten disse kolonnene.
const camerasColumns = db.prepare('PRAGMA table_info(cameras)').all().map((c) => c.name);
if (!camerasColumns.includes('status')) {
  db.exec("ALTER TABLE cameras ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
['local_ip', 'manufacturer', 'model', 'serial'].forEach((col) => {
  if (!camerasColumns.includes(col)) {
    db.exec(`ALTER TABLE cameras ADD COLUMN ${col} TEXT`);
  }
});

// DoktorNå: kuratert liste over fiktive leger til demo-legetjenesten.
const { n: doctorCount } = db.prepare('SELECT COUNT(*) AS n FROM telemedicine_doctors').get();
if (doctorCount === 0) {
  const insertDoctor = db.prepare(
    'INSERT INTO telemedicine_doctors (name, specialty, avatar, sort_order) VALUES (?, ?, ?, ?)'
  );
  [
    ['Dr. Ingrid Fossheim', 'Allmennlege', '🩺'],
    ['Dr. Kasper Lindqvist', 'Allmennlege', '🩺'],
    ['Dr. Nora Bakke', 'Barnelege', '🧒'],
    ['Dr. Amir Sæther', 'Hudlege', '🧴'],
    ['Dr. Live Solheim', 'Psykolog', '🧠'],
  ].forEach(([name, specialty, avatar], i) => insertDoctor.run(name, specialty, avatar, i + 1));
}

// play_locations og bible_verses seedes nå per familie (se familyMembers.js-
// aktiveringen / seed.js) i stedet for globalt her, bortsett fra bible_verses
// som forblir delt referansedata.
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
