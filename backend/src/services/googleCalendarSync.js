import { google } from 'googleapis';
import { config } from '../config.js';
import { db } from '../db/index.js';

const SYNC_DAYS_BACK = 7;
const SYNC_DAYS_AHEAD = 90;

function createOAuthClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export function getAuthUrl(memberId) {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state: String(memberId),
  });
}

export async function handleGoogleCallback(code, memberId) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Fikk ikke refresh-token fra Google. Fjern FamilieHub sin tilgang på ' +
        'myaccount.google.com/permissions og prøv å koble til på nytt.'
    );
  }
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  const info = db
    .prepare(
      `INSERT INTO calendar_connections (member_id, provider, label, credentials) VALUES (?, 'google', ?, ?)`
    )
    .run(
      memberId,
      userInfo.email || 'Google-kalender',
      JSON.stringify({ refresh_token: tokens.refresh_token })
    );
  return db.prepare('SELECT * FROM calendar_connections WHERE id = ?').get(info.lastInsertRowid);
}

export async function syncGoogleConnection(connection) {
  const creds = JSON.parse(connection.credentials);
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: creds.refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - SYNC_DAYS_BACK);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + SYNC_DAYS_AHEAD);

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const events = (data.items || []).filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date));

  const clear = db.prepare(
    `DELETE FROM calendar_events WHERE connection_id = ? AND start_at >= ? AND start_at <= ?`
  );
  const insert = db.prepare(
    `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, location, source, external_id, connection_id)
     VALUES (?, ?, ?, ?, ?, ?, 'google', ?, ?)`
  );

  const importTx = db.transaction(() => {
    clear.run(connection.id, timeMin.toISOString(), timeMax.toISOString());
    for (const e of events) {
      const allDay = Boolean(e.start.date && !e.start.dateTime);
      const startAt = allDay ? new Date(`${e.start.date}T00:00:00`).toISOString() : e.start.dateTime;
      const endAt = allDay ? new Date(`${e.end.date}T00:00:00`).toISOString() : e.end.dateTime;
      insert.run(
        connection.member_id,
        e.summary || '(uten tittel)',
        startAt,
        endAt,
        allDay ? 1 : 0,
        e.location || null,
        e.id,
        connection.id
      );
    }
  });
  importTx();

  db.prepare(`UPDATE calendar_connections SET last_synced_at = datetime('now') WHERE id = ?`).run(connection.id);
  return events.length;
}
