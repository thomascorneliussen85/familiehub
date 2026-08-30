import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { db } from './db/index.js';
import { registerSockets } from './sockets/index.js';
import authRouter from './routes/auth.js';
import ansatteRouter from './routes/ansatte.js';
import skiftRouter from './routes/skift.js';
import oppgaverRouter from './routes/oppgaver.js';
import beskjederRouter from './routes/beskjeder.js';
import temperaturRouter from './routes/temperatur.js';
import kalenderRouter from './routes/kalender.js';
import bestillingerRouter from './routes/bestillinger.js';

process.on('unhandledRejection', (err) => console.error('Uventet feil (unhandled rejection):', err));
process.on('uncaughtException', (err) => console.error('Uventet feil (uncaught exception):', err));

if (config.jwtSecret === 'INSECURE_DEV_SECRET_CHANGE_ME') {
  console.warn('⚠️  JWT_SECRET er ikke satt i .env – bruker en usikker standardverdi. Sett en ekte verdi før produksjon.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'], credentials: true },
});

app.set('io', io);
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/ansatte', ansatteRouter);
app.use('/api/skift', skiftRouter);
app.use('/api/oppgaver', oppgaverRouter);
app.use('/api/beskjeder', beskjederRouter);
app.use('/api/temperatur', temperaturRouter);
app.use('/api/kalender', kalenderRouter);
app.use('/api/bestillinger', bestillingerRouter);

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

registerSockets(io);

server.listen(config.port, () => {
  console.log(`🏪 ButikkHub-backend kjører på port ${config.port} (${config.nodeEnv})`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
