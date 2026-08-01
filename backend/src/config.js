import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectRoot = path.dirname(backendRoot);

// .env ligger i prosjektroten (ikke i backend/), og må lastes med eksplisitt
// sti – "dotenv/config" ville ellers lete relativt til process.cwd(), som er
// backend/ når serveren startes via "npm run dev" fra roten.
dotenv.config({ path: path.join(projectRoot, '.env') });

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

  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',

  garmin: {
    username: process.env.GARMIN_USERNAME || '',
    password: process.env.GARMIN_PASSWORD || '',
  },

  cameras: [1, 2]
    .map((n) => ({
      id: n,
      name: process.env[`CAMERA_${n}_NAME`] || `Kamera ${n}`,
      rtspUrl: process.env[`CAMERA_${n}_RTSP_URL`] || '',
    }))
    .filter((c) => c.rtspUrl),

  playStatus: {
    expiryHours: num(process.env.PLAY_STATUS_EXPIRY_HOURS, 2),
  },

  relay: {
    url: (process.env.RELAY_URL || '').replace(/\/+$/, ''),
    familyName: process.env.FAMILY_NAME || 'Vår familie',
  },

  parentPin: process.env.PARENT_PIN || '1234',
};
