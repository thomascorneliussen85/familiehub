import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(backendRoot, '.env') });

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5180').split(',').map((s) => s.trim()),

  dbPath: path.resolve(backendRoot, process.env.DB_PATH || './data/fleet.db'),

  jwtSecret: process.env.JWT_SECRET || 'INSECURE_DEV_SECRET_CHANGE_ME',

  // Admin-innlogging til dashbordet – kun én bruker i v1 (meg selv, per
  // spec). Passordet lagres ALDRI i klartekst, kun som bcrypt-hash i .env –
  // generer én med: node src/scripts/hashPassword.mjs <passord>
  admin: {
    username: process.env.FLEET_ADMIN_USERNAME || '',
    passwordHash: process.env.FLEET_ADMIN_PASSWORD_HASH || '',
  },

  // Delt hemmelighet en hub-eier (dvs. meg, ved oppsett av en ny kunde) bruker
  // til å registrere en NY hub – adskilt fra admin-innloggingen over, siden
  // hub-registrering skjer fra en kommandolinje, ikke en innlogget nettleserøkt.
  setupToken: process.env.FLEET_SETUP_TOKEN || '',
};
