import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { db } from './db/index.js';
import { registerSockets } from './sockets/index.js';
import familyMembersRouter from './routes/familyMembers.js';
import calendarRouter from './routes/calendar.js';
import choresRouter from './routes/chores.js';
import shoppingRouter from './routes/shopping.js';
import smartPlugsRouter from './routes/smartPlugs.js';
import weatherRouter from './routes/weather.js';
import busRouter from './routes/bus.js';
import powerPriceRouter from './routes/powerPrice.js';
import gpsRouter from './routes/gps.js';
import messagesRouter from './routes/messages.js';
import photosRouter from './routes/photos.js';
import { startPlugPolling } from './services/shellyPoller.js';
import { startTraccarPolling } from './services/traccarPoller.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
});

app.set('io', io);
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use('/photos', express.static(config.photos.dir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/family-members', familyMembersRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/chores', choresRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/smart-plugs', smartPlugsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/bus', busRouter);
app.use('/api/power-price', powerPriceRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/photos', photosRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Ikke funnet' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Intern feil på serveren' });
});

registerSockets(io);

server.listen(config.port, () => {
  console.log(`🏠 FamilieHub-backend kjører på port ${config.port} (${config.nodeEnv})`);
  startPlugPolling(io);
  startTraccarPolling(io);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
