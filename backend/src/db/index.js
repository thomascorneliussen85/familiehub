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
