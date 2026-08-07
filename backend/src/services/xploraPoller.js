import { db } from '../db/index.js';
import { config } from '../config.js';
import { isInsideGeofence } from './geofence.js';
import { getLastLocation } from './xploraService.js';

let wasHome = null; // null = ukjent ennå (unngår falsk varsel ved oppstart)

async function pollOnce(io) {
  const { phoneNumber, email, password } = config.xplora;
  if (!password || (!phoneNumber && !email)) return; // ikke konfigurert i .env ennå

  const loc = await getLastLocation();
  if (!loc) return;

  db.prepare(
    `INSERT INTO gps_positions (device_name, lat, lon, speed, battery, accuracy, recorded_at, source)
     VALUES (?, ?, ?, NULL, ?, NULL, ?, 'xplora')`
  ).run(loc.wardName, loc.lat, loc.lon, loc.battery, loc.recordedAt);

  const isHome = isInsideGeofence(loc.lat, loc.lon, config.geofenceHome);
  if (wasHome === false && isHome === true) {
    io.emit('gps:arrived-home', { at: new Date().toISOString() });
  }
  wasHome = isHome;

  io.emit('gps:update', {
    lat: loc.lat,
    lon: loc.lon,
    speed: null,
    battery: loc.battery,
    recordedAt: loc.recordedAt,
    isHome,
    source: 'xplora',
  });
}

export function startXploraPolling(io) {
  if (!config.xplora.password || (!config.xplora.phoneNumber && !config.xplora.email)) {
    console.log('ℹ️  Xplora er ikke konfigurert i .env – hopper over.');
    return;
  }
  pollOnce(io).catch((err) => console.error('Feil ved polling av Xplora:', err.message));
  setInterval(() => {
    pollOnce(io).catch((err) => console.error('Feil ved polling av Xplora:', err.message));
  }, config.xplora.pollIntervalMs);
}
