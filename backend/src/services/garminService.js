import { GarminConnect } from 'garmin-connect';
import { config } from '../config.js';
import { db } from '../db/index.js';

let client = null;
let loggedIn = false;

function getClient() {
  if (!client) {
    client = new GarminConnect({
      username: config.garmin.username,
      password: config.garmin.password,
    });
  }
  return client;
}

const upsertActivity = db.prepare(`
  INSERT INTO garmin_activities
    (garmin_activity_id, name, activity_type, start_time, duration_seconds, distance_m, calories, avg_hr, max_hr, elevation_gain_m, synced_at)
  VALUES (@garminActivityId, @name, @activityType, @startTime, @durationSeconds, @distanceM, @calories, @avgHr, @maxHr, @elevationGainM, datetime('now'))
  ON CONFLICT(garmin_activity_id) DO UPDATE SET
    name = excluded.name,
    activity_type = excluded.activity_type,
    start_time = excluded.start_time,
    duration_seconds = excluded.duration_seconds,
    distance_m = excluded.distance_m,
    calories = excluded.calories,
    avg_hr = excluded.avg_hr,
    max_hr = excluded.max_hr,
    elevation_gain_m = excluded.elevation_gain_m,
    synced_at = datetime('now')
`);

const insertActivities = db.transaction((activities) => {
  for (const a of activities) {
    upsertActivity.run({
      garminActivityId: a.activityId,
      name: a.activityName || 'Treningsøkt',
      activityType: a.activityType?.typeKey || 'other',
      startTime: a.startTimeLocal,
      durationSeconds: a.duration ?? null,
      distanceM: a.distance ?? null,
      calories: a.calories ?? null,
      avgHr: a.averageHR ?? null,
      maxHr: a.maxHR ?? null,
      elevationGainM: a.elevationGain ?? null,
    });
  }
});

export async function syncGarminActivities(limit = 20) {
  if (!config.garmin.username || !config.garmin.password) {
    throw new Error('Garmin er ikke konfigurert i .env');
  }
  const gc = getClient();
  if (!loggedIn) {
    try {
      await gc.login();
      loggedIn = true;
    } catch (err) {
      client = null;
      loggedIn = false;
      throw err;
    }
  }
  const activities = await gc.getActivities(0, limit);
  insertActivities(activities);
  return activities.length;
}
