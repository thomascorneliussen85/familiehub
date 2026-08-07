import { createDAVClient } from 'tsdav';
import ical from 'node-ical';
import { db } from '../db/index.js';

const SYNC_DAYS_BACK = 7;
const SYNC_DAYS_AHEAD = 90;

function connectClient(appleId, appPassword) {
  return createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: appleId, password: appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

export async function testICloudConnection(appleId, appPassword) {
  let client;
  try {
    client = await connectClient(appleId, appPassword);
  } catch {
    throw new Error(
      'Feil Apple-ID eller passord. Husk at du må bruke et app-spesifikt passord ' +
        '(opprettes på appleid.apple.com), ikke det vanlige Apple ID-passordet ditt.'
    );
  }
  const calendars = await client.fetchCalendars();
  if (!calendars.length) {
    throw new Error('Fant ingen kalendere på denne iCloud-kontoen');
  }
  return calendars.length;
}

function expandEvents(parsed, timeMin, timeMax) {
  const events = [];
  for (const key in parsed) {
    const item = parsed[key];
    if (item.type !== 'VEVENT' || !item.start) continue;

    if (item.rrule) {
      const duration = new Date(item.end).getTime() - new Date(item.start).getTime();
      const occurrences = item.rrule.between(timeMin, timeMax, true);
      for (const occStart of occurrences) {
        events.push({
          summary: item.summary,
          location: item.location,
          uid: `${item.uid}-${occStart.toISOString()}`,
          start: occStart,
          end: new Date(occStart.getTime() + duration),
          allDay: item.datetype === 'date',
        });
      }
    } else if (new Date(item.start) < timeMax && new Date(item.end || item.start) > timeMin) {
      events.push({
        summary: item.summary,
        location: item.location,
        uid: item.uid,
        start: new Date(item.start),
        end: new Date(item.end || item.start),
        allDay: item.datetype === 'date',
      });
    }
  }
  return events;
}

export async function syncICloudConnection(connection) {
  const creds = JSON.parse(connection.credentials);
  const client = await connectClient(creds.appleId, creds.appPassword);
  const calendars = await client.fetchCalendars();

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - SYNC_DAYS_BACK);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + SYNC_DAYS_AHEAD);

  const allEvents = [];
  for (const cal of calendars) {
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: { start: timeMin.toISOString(), end: timeMax.toISOString() },
    });
    for (const obj of objects) {
      if (!obj.data) continue;
      const parsed = ical.sync.parseICS(obj.data);
      allEvents.push(...expandEvents(parsed, timeMin, timeMax));
    }
  }

  const clear = db.prepare(
    `DELETE FROM calendar_events WHERE connection_id = ? AND start_at >= ? AND start_at <= ?`
  );
  const insert = db.prepare(
    `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, location, source, external_id, connection_id)
     VALUES (?, ?, ?, ?, ?, ?, 'icloud', ?, ?)`
  );

  const importTx = db.transaction(() => {
    clear.run(connection.id, timeMin.toISOString(), timeMax.toISOString());
    for (const e of allEvents) {
      insert.run(
        connection.member_id,
        e.summary || '(uten tittel)',
        e.start.toISOString(),
        e.end.toISOString(),
        e.allDay ? 1 : 0,
        e.location || null,
        e.uid,
        connection.id
      );
    }
  });
  importTx();

  db.prepare(`UPDATE calendar_connections SET last_synced_at = datetime('now') WHERE id = ?`).run(connection.id);
  return allEvents.length;
}
