import fetch from 'node-fetch';
import { config } from '../config.js';
import { db } from '../db/index.js';

const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_BASE = 'https://www.strava.com/api/v3';

// Kun activity:read_all – FamilieHub trenger aldri å skrive til Strava.
const SCOPE = 'activity:read_all';

export function getStravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: config.strava.clientId,
    redirect_uri: config.strava.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeStravaCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Strava avviste tilkoblingen (status ${res.status})`);
  const data = await res.json();
  if (!data.access_token || !data.refresh_token) throw new Error('Fikk ikke gyldige tokens fra Strava');
  return data;
}

async function refreshStravaToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Klarte ikke å fornye Strava-tilgangen (status ${res.status})`);
  return res.json();
}

// Sørger for at connection.access_token er gyldig – fornyer og oppdaterer
// raden i databasen hvis den er utløpt eller utløper om under 5 minutter.
async function getValidAccessToken(connection) {
  const soon = Math.floor(Date.now() / 1000) + 5 * 60;
  if (connection.expires_at > soon) return connection.access_token;

  const refreshed = await refreshStravaToken(connection.refresh_token);
  db.prepare(
    `UPDATE strava_connections SET access_token = ?, refresh_token = ?, expires_at = ? WHERE family_id = ?`
  ).run(refreshed.access_token, refreshed.refresh_token, refreshed.expires_at, connection.family_id);
  return refreshed.access_token;
}

const upsertActivity = db.prepare(`
  INSERT INTO strava_activities
    (family_id, strava_activity_id, name, activity_type, start_time, duration_seconds, elapsed_seconds, distance_m,
     calories, avg_hr, max_hr, elevation_gain_m, avg_speed_mps, max_speed_mps, avg_cadence, device_name, raw_json, synced_at)
  VALUES (@familyId, @stravaActivityId, @name, @activityType, @startTime, @durationSeconds, @elapsedSeconds, @distanceM,
          @calories, @avgHr, @maxHr, @elevationGainM, @avgSpeedMps, @maxSpeedMps, @avgCadence, @deviceName, @rawJson, datetime('now'))
  ON CONFLICT(strava_activity_id) DO UPDATE SET
    family_id = excluded.family_id,
    name = excluded.name,
    activity_type = excluded.activity_type,
    start_time = excluded.start_time,
    duration_seconds = excluded.duration_seconds,
    elapsed_seconds = excluded.elapsed_seconds,
    distance_m = excluded.distance_m,
    calories = excluded.calories,
    avg_hr = excluded.avg_hr,
    max_hr = excluded.max_hr,
    elevation_gain_m = excluded.elevation_gain_m,
    avg_speed_mps = excluded.avg_speed_mps,
    max_speed_mps = excluded.max_speed_mps,
    avg_cadence = excluded.avg_cadence,
    device_name = excluded.device_name,
    raw_json = excluded.raw_json,
    synced_at = datetime('now')
`);

const insertActivities = db.transaction((familyId, activities) => {
  for (const a of activities) {
    upsertActivity.run({
      familyId,
      stravaActivityId: a.id,
      name: a.name || 'Treningsøkt',
      activityType: a.sport_type || a.type || 'other',
      startTime: a.start_date_local,
      durationSeconds: a.moving_time ?? null,
      elapsedSeconds: a.elapsed_time ?? null,
      distanceM: a.distance ?? null,
      calories: a.calories ?? null,
      avgHr: a.average_heartrate ?? null,
      maxHr: a.max_heartrate ?? null,
      elevationGainM: a.total_elevation_gain ?? null,
      avgSpeedMps: a.average_speed ?? null,
      maxSpeedMps: a.max_speed ?? null,
      avgCadence: a.average_cadence ?? null,
      deviceName: a.device_name ?? null,
      rawJson: JSON.stringify(a),
    });
  }
});

export async function syncStravaActivities(connection, perPage = 30) {
  const accessToken = await getValidAccessToken(connection);
  const url = new URL(`${API_BASE}/athlete/activities`);
  url.searchParams.set('per_page', String(perPage));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Klarte ikke å hente aktiviteter fra Strava (status ${res.status})`);
  const activities = await res.json();
  insertActivities(connection.family_id, activities);
  return activities.length;
}
