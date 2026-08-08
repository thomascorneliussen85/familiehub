import { db } from '../db/index.js';

export function getSetting(familyId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE family_id = ? AND key = ?').get(familyId, key);
  return row ? row.value : fallback;
}

export function setSetting(familyId, key, value) {
  db.prepare(
    `INSERT INTO settings (family_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value`
  ).run(familyId, key, value);
}
