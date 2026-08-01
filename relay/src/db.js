import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const relayRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = path.resolve(relayRoot, process.env.DB_PATH || './data/relay.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Personvern: relayen lagrer KUN hvem som er parret med hvem (metadata).
// Ingen lekestatuser, meldinger eller posisjonsdata lagres noensinne her –
// de videresendes bare gjennom aktive socket-tilkoblinger i minnet.
db.exec(`
  CREATE TABLE IF NOT EXISTS hubs (
    id            TEXT PRIMARY KEY,
    family_name   TEXT NOT NULL,
    api_key_hash  TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pairing_codes (
    code        TEXT PRIMARY KEY,
    hub_id      TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pairings (
    id            TEXT PRIMARY KEY,
    hub_a_id      TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    hub_b_id      TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at  TEXT,
    UNIQUE(hub_a_id, hub_b_id)
  );
`);
