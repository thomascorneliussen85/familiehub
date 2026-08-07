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
