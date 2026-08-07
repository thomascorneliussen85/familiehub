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
    (garmin_activity_id, name, activity_type, start_time, duration_seconds, distance_m, calories, avg_hr, max_hr, elevation_gain_m,
     elapsed_seconds, moving_seconds, elevation_loss_m, min_elevation_m, avg_speed_mps, max_speed_mps,
     avg_cadence, max_cadence, vo2max, aerobic_effect, anaerobic_effect, avg_stride_length_m, lap_count, device_name, raw_json, synced_at)
  VALUES (@garminActivityId, @name, @activityType, @startTime, @durationSeconds, @distanceM, @calories, @avgHr, @maxHr, @elevationGainM,
          @elapsedSeconds, @movingSeconds, @elevationLossM, @minElevationM, @avgSpeedMps, @maxSpeedMps,
          @avgCadence, @maxCadence, @vo2max, @aerobicEffect, @anaerobicEffect, @avgStrideLengthM, @lapCount, @deviceName, @rawJson, datetime('now'))
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
    elapsed_seconds = excluded.elapsed_seconds,
    moving_seconds = excluded.moving_seconds,
    elevation_loss_m = excluded.elevation_loss_m,
    min_elevation_m = excluded.min_elevation_m,
    avg_speed_mps = excluded.avg_speed_mps,
    max_speed_mps = excluded.max_speed_mps,
    avg_cadence = excluded.avg_cadence,
    max_cadence = excluded.max_cadence,
    vo2max = excluded.vo2max,
    aerobic_effect = excluded.aerobic_effect,
    anaerobic_effect = excluded.anaerobic_effect,
    avg_stride_length_m = excluded.avg_stride_length_m,
    lap_count = excluded.lap_count,
    device_name = excluded.device_name,
    raw_json = excluded.raw_json,
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
      elapsedSeconds: a.elapsedDuration ?? null,
      movingSeconds: a.movingDuration ?? null,
      elevationLossM: a.elevationLoss ?? null,
      minElevationM: a.minElevation ?? null,
      avgSpeedMps: a.averageSpeed ?? null,
      maxSpeedMps: a.maxSpeed ?? null,
      avgCadence: a.averageRunningCadenceInStepsPerMinute ?? a.averageBikingCadenceInRevPerMinute ?? null,
      maxCadence: a.maxRunningCadenceInStepsPerMinute ?? a.maxBikingCadenceInRevPerMinute ?? null,
      vo2max: a.vO2MaxValue ?? null,
      aerobicEffect: typeof a.aerobicTrainingEffect === 'number' ? a.aerobicTrainingEffect : null,
      anaerobicEffect: typeof a.anaerobicTrainingEffect === 'number' ? a.anaerobicTrainingEffect : null,
      avgStrideLengthM: a.avgStrideLength ?? null,
      lapCount: a.lapCount ?? null,
      deviceName: a.manufacturer ?? null,
      rawJson: JSON.stringify(a),
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
