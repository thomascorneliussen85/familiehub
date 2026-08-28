import garminConnectPkg from 'garmin-connect';
const { GarminConnect } = garminConnectPkg;
import { db } from '../db/index.js';

// Én innlogget garmin-connect-klient per familie (ikke global lenger, siden
// hver familie nå kan ha sin egen konto) – kartlagt på familyId slik at to
// familier som synkroniserer samtidig på samme installasjon ikke deler økt.
const clientsByFamily = new Map();

function getClient(familyId, username, password) {
  let entry = clientsByFamily.get(familyId);
  if (!entry) {
    entry = { client: new GarminConnect({ username, password }), loggedIn: false };
    clientsByFamily.set(familyId, entry);
  }
  return entry;
}

const upsertActivity = db.prepare(`
  INSERT INTO garmin_activities
    (family_id, garmin_activity_id, name, activity_type, start_time, duration_seconds, distance_m, calories, avg_hr, max_hr, elevation_gain_m,
     elapsed_seconds, moving_seconds, elevation_loss_m, min_elevation_m, avg_speed_mps, max_speed_mps,
     avg_cadence, max_cadence, vo2max, aerobic_effect, anaerobic_effect, avg_stride_length_m, lap_count, device_name, raw_json, synced_at)
  VALUES (@familyId, @garminActivityId, @name, @activityType, @startTime, @durationSeconds, @distanceM, @calories, @avgHr, @maxHr, @elevationGainM,
          @elapsedSeconds, @movingSeconds, @elevationLossM, @minElevationM, @avgSpeedMps, @maxSpeedMps,
          @avgCadence, @maxCadence, @vo2max, @aerobicEffect, @anaerobicEffect, @avgStrideLengthM, @lapCount, @deviceName, @rawJson, datetime('now'))
  ON CONFLICT(garmin_activity_id) DO UPDATE SET
    family_id = excluded.family_id,
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

const insertActivities = db.transaction((familyId, activities) => {
  for (const a of activities) {
    upsertActivity.run({
      familyId,
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

// Logger inn (kaster ved feil brukernavn/passord) – brukes både til å teste
// en tilkobling før den lagres, og som første steg i en vanlig synk.
export async function testGarminConnection(username, password) {
  const gc = new GarminConnect({ username, password });
  await gc.login();
  return true;
}

export async function syncGarminActivities(familyId, username, password, limit = 20) {
  const entry = getClient(familyId, username, password);
  if (!entry.loggedIn) {
    try {
      await entry.client.login();
      entry.loggedIn = true;
    } catch (err) {
      clientsByFamily.delete(familyId);
      throw err;
    }
  }
  const activities = await entry.client.getActivities(0, limit);
  insertActivities(familyId, activities);
  return activities.length;
}
