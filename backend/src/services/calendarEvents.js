import { DateTime } from 'luxon';
import { db } from '../db/index.js';

export function validateEvent(body, familyId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Ugyldig avtale.';
  if (typeof body.start_at !== 'string' || typeof body.end_at !== 'string') return 'Ugyldig dato.';
  const start = DateTime.fromISO(body.start_at || '');
  const end = DateTime.fromISO(body.end_at || '');
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 300 || !start.isValid || !end.isValid || end <= start) return 'Fyll inn tittel og en gyldig start- og sluttid.';
  if (!['once', 'weekly'].includes(body.recurrence || 'once')) return 'Ugyldig gjentakelse.';
  if (!DateTime.now().setZone(body.time_zone || 'Europe/Oslo').isValid) return 'Ugyldig tidssone.';
  for (const field of ['member_id', 'responsible_id', 'driver_id', 'pickup_id']) {
    if (body[field] != null && !Number.isSafeInteger(Number(body[field]))) return 'Ugyldig familiemedlem.';
    if (body[field] != null && !db.prepare(`SELECT id FROM family_members WHERE id = ? AND family_id = ?${field !== 'member_id' ? " AND role = 'voksen'" : ''}`).get(body[field], familyId)) return 'Velg et familiemedlem fra din familie. Transport og ansvar må tildeles en voksen.';
  }
  for (const field of ['bring_list', 'notes', 'location']) if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 5000)) return 'Tekstfeltet er for langt.';
  return null;
}

export function createEvent(body, familyId) {
  const info = db.prepare(`INSERT INTO calendar_events
    (family_id, member_id, title, start_at, end_at, all_day, location, notes, source, recurrence, responsible_id, driver_id, pickup_id, bring_list, time_zone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(familyId, body.member_id ?? null, body.title.trim(), new Date(body.start_at).toISOString(), new Date(body.end_at).toISOString(), body.all_day ? 1 : 0,
      body.location ?? null, body.notes ?? null, body.source === 'homework' ? 'homework' : 'local', body.recurrence || 'once',
      body.responsible_id ?? null, body.driver_id ?? null, body.pickup_id ?? null, body.bring_list || '', body.time_zone || 'Europe/Oslo');
  return db.prepare('SELECT * FROM calendar_events WHERE id = ? AND family_id = ?').get(info.lastInsertRowid, familyId);
}
