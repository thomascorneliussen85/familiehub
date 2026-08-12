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
    photosRedirectUri: process.env.GOOGLE_PHOTOS_REDIRECT_URI || '',
  },

  traccar: {
    url: process.env.TRACCAR_URL || '',
    username: process.env.TRACCAR_USERNAME || '',
    password: process.env.TRACCAR_PASSWORD || '',
    deviceId: process.env.TRACCAR_DEVICE_ID || '',
    pollIntervalMs: num(process.env.TRACCAR_POLL_INTERVAL_MS, 180000),
  },

  xplora: {
    countryPhoneNumber: process.env.XPLORA_COUNTRY_CODE || '+47',
    phoneNumber: process.env.XPLORA_PHONE || '',
    email: process.env.XPLORA_EMAIL || '',
    password: process.env.XPLORA_PASSWORD || '',
    // Navnet på barnet (ward) klokken tilhører i Xplora-appen din – brukes til
    // å velge riktig barn hvis kontoen har flere. Faller tilbake til det
    // eneste barnet på kontoen hvis dette ikke er satt eller ikke matcher.
    wardName: process.env.XPLORA_WARD_NAME || 'Adelia',
    pollIntervalMs: num(process.env.XPLORA_POLL_INTERVAL_MS, 180000),
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

  playStatus: {
    expiryHours: num(process.env.PLAY_STATUS_EXPIRY_HOURS, 2),
  },

  relay: {
    url: (process.env.RELAY_URL || '').replace(/\/+$/, ''),
    familyName: process.env.FAMILY_NAME || 'Vår familie',
  },

  // Signerer JWT-økt-cookien for innlogging (families/users). MÅ settes til en
  // ekte hemmelighet i .env før dette hostes for andre familier – med
  // standardverdien kan hvem som helst forfalske en innloggingsøkt.
  jwtSecret: process.env.JWT_SECRET || 'INSECURE_DEV_SECRET_CHANGE_ME',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // HOME_LAT/HOME_LNG faller tilbake til samme koordinater som geofenceHome
  // over hvis ikke satt eksplisitt – de fleste familier har uansett bare ett
  // "hjemme"-punkt å regne butikk-nærhet ut fra.
  kassalapp: {
    apiKey: process.env.KASSALAPP_API_KEY || '',
    homeLat: num(process.env.HOME_LAT, num(process.env.GEOFENCE_HOME_LAT, 60.51)),
    homeLng: num(process.env.HOME_LNG, num(process.env.GEOFENCE_HOME_LON, 5.24)),
    radiusKm: num(process.env.SHOP_RADIUS_KM, 10),
  },

  // financeEncryptionKey krypterer Claude-nøkkel + Enable Banking-PEM i
  // finance_config (se financeCrypto.js). MÅ settes til en ekte 32-byte
  // hex-nøkkel (openssl rand -hex 32) før dette hostes for andre familier.
  // enableBankingActive er en GLOBAL bryter: selv om en familie har slått på
  // enable_banking_active i sin egen finance_config, kjører ingenting med
  // mindre denne også er true – dobbel sikring mot utilsiktet bank-sync før
  // en ekte Enable Banking-avtale/app-id finnes.
  financeEncryptionKey: process.env.FINANCE_ENCRYPTION_KEY || '',
  enableBankingActive: process.env.ENABLE_BANKING_ACTIVE === 'true',
  enableBankingBaseUrl: process.env.ENABLE_BANKING_BASE_URL || 'https://api.enablebanking.com',

  rewardsImagesDir: path.resolve(backendRoot, process.env.REWARDS_IMAGES_DIR || 'data/reward-images'),

  brief: {
    defaultRssFeeds: (process.env.BRIEF_RSS_FEEDS || 'https://www.nrk.no/toppsaker.rss')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
