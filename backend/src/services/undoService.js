import crypto from 'node:crypto';
import { db } from '../db/index.js';

const TABLES = new Set(['calendar_events', 'dinner_plans', 'shopping_items', 'chores']);
export function archiveDeletion(req, table, rows, remove) {
  if (!TABLES.has(table)) throw new Error('Unsupported undo table');
  return db.transaction(() => {
    if (table === 'calendar_events') rows = rows.map(row => ({ ...row, _packing: db.prepare('SELECT date, item FROM calendar_packing WHERE event_id = ?').all(row.id) }));
    remove();
    if (!rows.length) return {};
    const token = crypto.randomUUID();
    db.prepare('DELETE FROM undo_actions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO undo_actions (token, family_id, table_name, rows_json, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(token, req.familyId, table, JSON.stringify(rows), Date.now() + 600000);
    return { undoToken: token };
  })();
}

export function restoreDeletion(familyId, token) {
  return db.transaction(() => {
    const action = db.prepare('SELECT * FROM undo_actions WHERE token = ? AND family_id = ? AND expires_at >= ?').get(token, familyId, Date.now());
    if (!action || !TABLES.has(action.table_name)) return null;
    const rows = JSON.parse(action.rows_json);
    for (const row of rows) {
      if (row.family_id !== familyId) throw new Error('Invalid family');
      if (action.table_name === 'chores') {
        const result = db.prepare('UPDATE chores SET active = 1 WHERE id = ? AND family_id = ? AND active = 0').run(row.id, familyId);
        if (!result.changes) throw new Error('Gjøremålet er endret siden det ble slettet.');
      } else {
        // Never overwrite newer data. SQLite constraints abort the whole restore.
        const columns = db.prepare(`PRAGMA table_info(${action.table_name})`).all().map(c => c.name).filter(k => Object.hasOwn(row, k));
        db.prepare(`INSERT INTO ${action.table_name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(k => row[k]));
        if (action.table_name === 'calendar_events') for (const item of row._packing || []) {
          db.prepare('INSERT INTO calendar_packing (event_id, date, item) VALUES (?, ?, ?)').run(row.id, item.date, item.item);
        }
      }
    }
    db.prepare('DELETE FROM undo_actions WHERE token = ?').run(token);
    return action.table_name;
  })();
}
