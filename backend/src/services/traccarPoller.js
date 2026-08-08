import fetch from 'node-fetch';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { isInsideGeofence } from '../services/geofence.js';
import { getOwnerFamilyId } from './ownerFamily.js';

let wasHome = null; // null = ukjent ennå (unngår falsk varsel ved oppstart)

async function pollOnce(io) {
  const { url, username, password, deviceId } = config.traccar;
  if (!url || !deviceId) return; // ikke konfigurert i .env ennå
  const familyId = getOwnerFamilyId();
  if (!familyId) return;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(`${url.replace(/\/$/, '')}/api/positions?deviceId=${deviceId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Traccar svarte med status ${res.status}`);
  const positions = await res.json();
  const latest = Array.isArray(positions) ? positions[positions.length - 1] : null;
  if (!latest) return;

  db.prepare(
    `INSERT INTO gps_positions (family_id, device_name, lat, lon, speed, battery, accuracy, recorded_at, source)
     VALUES (?, 'Adelia', ?, ?, ?, ?, ?, ?, 'traccar')`
  ).run(
    familyId,
    latest.latitude,
    latest.longitude,
    latest.speed ?? null,
    latest.attributes?.batteryLevel ?? null,
    latest.accuracy ?? null,
    latest.fixTime ?? latest.deviceTime ?? new Date().toISOString()
  );

  const isHome = isInsideGeofence(latest.latitude, latest.longitude, config.geofenceHome);
  const room = `family:${familyId}`;
  if (wasHome === false && isHome === true) {
    io.to(room).emit('gps:arrived-home', { at: new Date().toISOString() });
  }
  wasHome = isHome;

  io.to(room).emit('gps:update', {
    lat: latest.latitude,
    lon: latest.longitude,
    speed: latest.speed ?? null,
    battery: latest.attributes?.batteryLevel ?? null,
    recordedAt: latest.fixTime ?? latest.deviceTime,
    isHome,
    source: 'traccar',
  });
}

export function startTraccarPolling(io) {
  if (!config.traccar.url || !config.traccar.deviceId) {
    console.log('ℹ️  Traccar er ikke konfigurert i .env – GPS-modulen bruker siste kjente posisjon.');
    return;
  }
  pollOnce(io).catch((err) => console.error('Feil ved polling av Traccar:', err.message));
  setInterval(() => {
    pollOnce(io).catch((err) => console.error('Feil ved polling av Traccar:', err.message));
  }, config.traccar.pollIntervalMs);
}
