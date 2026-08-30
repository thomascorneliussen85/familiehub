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
  port: num(process.env.PORT, 4200),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5190').split(',').map((s) => s.trim()),
  dbPath: path.resolve(backendRoot, process.env.DB_PATH || './data/butikkhub.db'),
  jwtSecret: process.env.JWT_SECRET || 'INSECURE_DEV_SECRET_CHANGE_ME',
};
