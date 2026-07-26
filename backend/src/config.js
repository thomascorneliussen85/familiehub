import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),

  dbPath: path.resolve(backendRoot, process.env.DB_PATH || './data/familiehub.db'),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },

  traccar: {
    url: process.env.TRACCAR_URL || '',
    username: process.env.TRACCAR_USERNAME || '',
    password: process.env.TRACCAR_PASSWORD || '',
    deviceId: process.env.TRACCAR_DEVICE_ID || '',
    pollIntervalMs: num(process.env.TRACCAR_POLL_INTERVAL_MS, 180000),
  },

  geofenceHome: {
    lat: num(process.env.GEOFENCE_HOME_LAT, 60.51),
    lon: num(process.env.GEOFENCE_HOME_LON, 5.24),
    radiusM: num(process.env.GEOFENCE_RADIUS_M, 150),
  },

  weather: {
    lat: num(process.env.WEATHER_LAT, 60.51),
    lon: num(process.env.WEATHER_LON, 5.24),
    userAgent: process.env.WEATHER_USER_AGENT || 'FamilieHub/1.0',
    cacheMinutes: num(process.env.WEATHER_CACHE_MINUTES, 30),
  },

  entur: {
    stopId: process.env.ENTUR_STOP_ID || '',
    clientName: process.env.ENTUR_CLIENT_NAME || 'familiehub',
  },

  powerPrice: {
    area: process.env.POWER_PRICE_AREA || 'NO5',
  },

  photos: {
    dir: path.resolve(backendRoot, process.env.PHOTOS_DIR || '../photos'),
    idleMinutes: num(process.env.PHOTO_MODE_IDLE_MINUTES, 5),
  },
};
