import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db/index.js';
import authRouter from './routes/auth.js';
import hubsRouter from './routes/hubs.js';
import hubConfigRouter from './routes/hubConfig.js';
import telemetryRouter from './routes/telemetry.js';
import errorsRouter from './routes/errors.js';
import rolloutRouter from './routes/rollout.js';

process.on('unhandledRejection', (err) => console.error('Uventet feil (unhandled rejection):', err));
process.on('uncaughtException', (err) => console.error('Uventet feil (uncaught exception):', err));

if (config.jwtSecret === 'INSECURE_DEV_SECRET_CHANGE_ME') {
  console.warn('⚠️  JWT_SECRET er ikke satt i .env – bruker en usikker standardverdi. Sett en ekte verdi før produksjon.');
}

const app = express();
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/hubs', hubsRouter);
app.use('/api/config', hubConfigRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/errors', errorsRouter);
app.use('/api/rollout', rolloutRouter);

// Servér det bygde dashbordet (fleet/frontend/dist) på samme origin i
// produksjon – samme mønster som hoved-appens backend, gjør fleet-tjenesten
// deploybar som én enkelt Cloud Run-tjeneste.
const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendDist = path.join(backendRoot, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ikke funnet' });
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: 'Ikke funnet' }));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Intern feil på serveren' });
});

app.listen(config.port, () => {
  console.log(`🚀 FamilieHub Fleet kjører på port ${config.port} (${config.nodeEnv})`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
