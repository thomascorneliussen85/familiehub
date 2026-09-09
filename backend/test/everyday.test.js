import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { DateTime } from 'luxon';
import { expandWeeklyOccurrences } from '../src/services/calendarTime.js';
import { combineIngredients } from '../src/services/ingredients.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'familyhub-test-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.JWT_SECRET = 'isolated-familyhub-test-secret';
const { db } = await import('../src/db/index.js');
const { signSession, verifySession } = await import('../src/middleware/requireAuth.js');
const { registerSockets } = await import('../src/sockets/index.js');
let server, io, base, cookie, otherCookie, family, otherFamily, child, adult, stranger, userId;
async function call(url, method = 'GET', body, session = cookie) {
  const res = await fetch(base + url, { method, headers: { Cookie: session, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const event = (overrides = {}) => ({ title: 'Trening', start_at: '2026-09-10T14:00:00.000Z', end_at: '2026-09-10T15:00:00.000Z', ...overrides });
before(async () => {
  const insertFamily = db.prepare('INSERT INTO families (name) VALUES (?)');
  family = Number(insertFamily.run('Testfamilie').lastInsertRowid);
  otherFamily = Number(insertFamily.run('Annen testfamilie').lastInsertRowid);
  const user = db.prepare('INSERT INTO users (family_id, email, password_hash) VALUES (?, ?, ?)');
  userId = Number(user.run(family, 'test@example.invalid', 'unused').lastInsertRowid);
  const otherId = Number(user.run(otherFamily, 'other@example.invalid', 'unused').lastInsertRowid);
  cookie = `familiehub_session=${signSession({ id: userId, family_id: family })}`;
  otherCookie = `familiehub_session=${signSession({ id: otherId, family_id: otherFamily })}`;
  const member = db.prepare('INSERT INTO family_members (family_id, name, role) VALUES (?, ?, ?)');
  child = Number(member.run(family, 'Barn', 'barn').lastInsertRowid);
  adult = Number(member.run(family, 'Voksen', 'voksen').lastInsertRowid);
  stranger = Number(member.run(otherFamily, 'Annen voksen', 'voksen').lastInsertRowid);
  const app = express(); app.use(express.json()); app.use(cookieParser());
  for (const [route, file] of [['auth', 'auth'], ['calendar', 'calendar'], ['shopping', 'shopping'], ['chores', 'chores'], ['dinner-plans', 'dinnerPlans'], ['undo', 'undo']]) app.use('/' + route, (await import(`../src/routes/${file}.js`)).default);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  io = new Server(server); registerSockets(io); app.set('io', io);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => io.close(resolve)); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('weekly times stay 17:00 in Oslo across both DST transitions', () => {
  for (const date of ['2026-03-22', '2026-10-18']) {
    const start = DateTime.fromISO(date + 'T17:00', { zone: 'Europe/Oslo' });
    const rows = expandWeeklyOccurrences([event({ start_at: start.toUTC().toISO(), end_at: start.plus({ hours: 1 }).toUTC().toISO() })], start.toUTC().toISO(), start.plus({ weeks: 3 }).toUTC().toISO());
    assert.equal(rows.length, 3);
    for (const row of rows) assert.equal(DateTime.fromISO(row.start_at, { zone: 'Europe/Oslo' }).hour, 17);
    assert.notEqual(Date.parse(rows[1].start_at) - Date.parse(rows[0].start_at), 7 * 86400000);
  }
});
test('weekly all-day event keeps midnight boundaries and overlapping occurrences', () => {
  const rows = expandWeeklyOccurrences([event({ all_day: 1, start_at: '2026-03-21T23:00:00Z', end_at: '2026-03-22T23:00:00Z' })], '2026-03-29T08:00:00Z', '2026-03-29T22:00:00Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start_at, '2026-03-28T23:00:00.000Z');
  assert.equal(rows[0].end_at, '2026-03-29T22:00:00.000Z');
});
test('removed or moved users cannot reuse old session', () => {
  const id = Number(db.prepare('INSERT INTO users (family_id,email,password_hash) VALUES (?,?,?)').run(family, 'revoked@example.invalid', 'unused').lastInsertRowid);
  const token = signSession({ id, family_id: family });
  assert.equal(verifySession(token).familyId, family);
  db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(otherFamily, id);
  assert.throws(() => verifySession(token));
  db.prepare('UPDATE users SET family_id = ?, session_version = session_version + 1 WHERE id = ?').run(family, id);
  assert.throws(() => verifySession(token));
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  assert.throws(() => verifySession(token));
});
test('deleting a login immediately disconnects its socket and prevents reconnect', async () => {
  const id = Number(db.prepare('INSERT INTO users (family_id,email,password_hash) VALUES (?,?,?)').run(family, 'socket@example.invalid', 'unused').lastInsertRowid);
  const token = signSession({ id, family_id: family });
  const client = connectSocket(base, { transports: ['websocket'], extraHeaders: { Cookie: `familiehub_session=${token}` }, reconnection: false, autoConnect: false });
  try {
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); });
    const disconnected = new Promise(resolve => client.once('disconnect', resolve));
    const response = await fetch(base + '/auth/users/' + id, { method: 'DELETE', headers: { Cookie: cookie, 'x-parent-pin': '1234' } });
    assert.equal(response.status, 204);
    assert.equal(await disconnected, 'io server disconnect');
    const refused = new Promise(resolve => client.once('connect_error', resolve)); client.connect();
    assert.equal((await refused).message, 'unauthorized');
  } finally { client.disconnect(); }
});
test('calendar validates range and family logistics', async () => {
  assert.equal((await call('/calendar/events?from=bad&to=bad')).status, 400);
  assert.equal((await call('/calendar/events', 'POST', event({ driver_id: stranger }))).status, 400);
  assert.equal((await call('/calendar/events', 'POST', event({ driver_id: child }))).status, 400);
  assert.equal((await call('/calendar/events', 'POST', event({ end_at: 'invalid' }))).status, 400);
  const saved = await call('/calendar/events', 'POST', event({ member_id: child, driver_id: adult, pickup_id: adult, bring_list: 'Flaske\nSko' }));
  assert.equal(saved.status, 201); assert.equal(saved.data.driver_id, adult);
  const denied = await call(`/calendar/events/${saved.data.id}`, 'PUT', event({ title: 'Oops' }), otherCookie);
  assert.equal(denied.status, 404);
});
test('calendar import is atomic, retry-safe and rejects changed retry payload', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n;
  const invalid = { requestId: 'atomic-import-test', events: [event(), event({ member_id: stranger })] };
  assert.equal((await call('/calendar/events/import', 'POST', invalid)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n, before);
  const body = { requestId: 'atomic-import-test', events: [event({ source: 'homework' }), event({ title: 'Lesing', source: 'homework' })] };
  const first = await call('/calendar/events/import', 'POST', body);
  const retry = await call('/calendar/events/import', 'POST', body);
  assert.equal(first.status, 201); assert.deepEqual(retry.data, first.data);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n, before + 2);
  assert.equal((await call('/calendar/events/import', 'POST', { ...body, events: [event()] })).status, 409);
});
test('calendar packing is scoped by family and occurrence', async () => {
  const { data } = await call('/calendar/events', 'POST', event({ bring_list: 'Flaske' }));
  const url = `/calendar/events/${data.id}/packing`;
  assert.equal((await call(url, 'PUT', { date: '2026-09-10', item: 'Flaske', checked: true }, otherCookie)).status, 404);
  assert.deepEqual((await call(url, 'PUT', { date: '2026-09-10', item: 'Flaske', checked: true })).data, ['Flaske']);
  assert.deepEqual((await call(url + '?date=2026-09-17')).data, []);
  const removed = await call(`/calendar/events/${data.id}`, 'DELETE');
  await call('/undo/' + removed.data.undoToken, 'POST', {});
  assert.deepEqual((await call(url + '?date=2026-09-10')).data, ['Flaske']);
});
test('undo restores event with original id, is tenant-isolated and single-use', async () => {
  const saved = await call('/calendar/events', 'POST', event());
  const removed = await call(`/calendar/events/${saved.data.id}`, 'DELETE');
  assert.ok(removed.data.undoToken);
  assert.equal((await call('/undo/' + removed.data.undoToken, 'POST', {}, otherCookie)).status, 404);
  assert.equal((await call('/undo/' + removed.data.undoToken, 'POST', {})).status, 200);
  assert.ok(db.prepare('SELECT id FROM calendar_events WHERE id = ?').get(saved.data.id));
  assert.equal((await call('/undo/' + removed.data.undoToken, 'POST', {})).status, 404);
});
test('dinner undo refuses to overwrite a newer meal', async () => {
  await call('/dinner-plans', 'POST', { date: '2026-09-10', title: 'Pasta' });
  const deleted = await call('/dinner-plans/2026-09-10', 'DELETE');
  await call('/dinner-plans', 'POST', { date: '2026-09-10', title: 'Suppe' });
  assert.equal((await call('/undo/' + deleted.data.undoToken, 'POST', {})).status, 409);
  assert.equal(db.prepare('SELECT title FROM dinner_plans WHERE family_id = ? AND date = ?').get(family, '2026-09-10').title, 'Suppe');
});
test('quick dinner edit retains recipe ingredients', async () => {
  await call('/dinner-plans', 'POST', { date: '2026-09-11', title: 'Ris', ingredients: ['200 g ris'], instructions: ['Kok risen'] });
  const saved = await call('/dinner-plans', 'POST', { date: '2026-09-11', title: 'God ris', emoji: '🍚' });
  assert.deepEqual(saved.data.ingredients, ['200 g ris']); assert.deepEqual(saved.data.instructions, ['Kok risen']);
});
test('ingredient sums convert compatible units and keep different ingredients separate', () => {
  assert.deepEqual(combineIngredients(['500 g ris', '0,5 kg ris', '2 dl melk', '100 ml melk', '1 løk', '2 løk', 'salt etter smak']), ['1000 g ris', '300 ml melk', '3 løk', 'salt etter smak']);
});
test('ingredients deduplicate within request and checked shopping items can be added again', async () => {
  const initial = await call('/shopping', 'POST', { name: '200 g ris' });
  const item = initial.data.find(row => row.name === '200 g ris');
  await call(`/shopping/${item.id}/toggle`, 'PATCH');
  const response = await call('/dinner-plans/add-ingredients-to-shopping', 'POST', { items: ['200 g ris', '200 g ris'] });
  assert.equal(response.data.added, 1);
  assert.equal((await call('/dinner-plans/add-ingredients-to-shopping', 'POST', { items: ['200 g ris'] })).data.added, 0);
});
test('cleared shopping items can be restored together', async () => {
  const deleted = await call('/shopping', 'DELETE');
  assert.ok(deleted.data.undoToken);
  assert.equal((await call('/undo/' + deleted.data.undoToken, 'POST', {})).status, 200);
  assert.ok((await call('/shopping')).data.some(item => item.checked));
});
test('routine templates are optional, idempotent and child/family scoped', async () => {
  const body = { member_id: child, group: 'morning', titles: ['Kle på meg', 'Pusse tenner', 'Pusse tenner'] };
  assert.equal((await call('/chores/routines', 'POST', body)).status, 201);
  await call('/chores/routines', 'POST', body);
  const routines = (await call('/chores')).data.filter(row => row.routine_group === 'morning');
  assert.equal(routines.length, 2);
  assert.equal((await call('/chores/routines', 'POST', { ...body, member_id: stranger })).status, 400);
  await call(`/chores/${routines[0].id}/toggle`, 'POST', {});
  const removed = await call(`/chores/${routines[0].id}`, 'DELETE');
  assert.equal((await call('/undo/' + removed.data.undoToken, 'POST', {})).status, 200);
  assert.equal((await call('/chores')).data.find(row => row.id === routines[0].id).done, true);
});
