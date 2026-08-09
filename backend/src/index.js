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
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
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
import googlePhotosRouter from './routes/googlePhotos.js';
import camerasRouter from './routes/cameras.js';
import garminRouter from './routes/garmin.js';
import playStatusRouter from './routes/playStatus.js';
import playLocationsRouter from './routes/playLocations.js';
import playAdminRouter from './routes/playAdmin.js';
import relayRouter from './routes/relay.js';
import dinnerPlansRouter from './routes/dinnerPlans.js';
import calendarConnectionsRouter from './routes/calendarConnections.js';
import briefRouter from './routes/brief.js';
import telemedicineRouter from './routes/telemedicine.js';
import rewardsRouter from './routes/rewards.js';
import assistantRouter from './routes/assistant.js';
import feedbackRouter from './routes/feedback.js';
import roadmapRouter from './routes/roadmap.js';
import localFriendsRouter from './routes/localFriends.js';
import { startPlugPolling } from './services/shellyPoller.js';
import { startTraccarPolling } from './services/traccarPoller.js';
import { startXploraPolling } from './services/xploraPoller.js';
import { cleanupOldPlayStatus } from './services/playStatusService.js';
import { initRelayClient } from './services/relayClient.js';
import { startBriefScheduler } from './services/briefScheduler.js';

if (config.jwtSecret === 'INSECURE_DEV_SECRET_CHANGE_ME') {
  console.warn(
    '⚠️  JWT_SECRET er ikke satt i .env – bruker en usikker standardverdi. ' +
      'MÅ settes til noe ekte før dette hostes for flere familier.'
  );
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

// Bilder/belønningsbilder ligger i mapper per familie (photos/<familyId>/...,
// data/reward-images/<familyId>/...) – servert via en innlogget rute i stedet
// for express.static, slik at én familie ikke kan gjette seg til en annen
// familie sine filnavn (familyId i URL-en må stemme med økten).
function serveFamilyFile(baseDir) {
  return (req, res) => {
    if (Number(req.params.familyId) !== req.familyId) {
      return res.status(403).end();
    }
    const name = req.params.filename;
    if (name.includes('/') || name.includes('..')) {
      return res.status(400).end();
    }
    res.sendFile(path.join(baseDir, String(req.familyId), name), (err) => {
      if (err) res.status(404).end();
    });
  };
}
app.get('/photos/:familyId/:filename', requireAuth, serveFamilyFile(config.photos.dir));
app.get('/reward-images/:familyId/:filename', requireAuth, serveFamilyFile(config.rewardsImagesDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
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
app.use('/api/photos/google', googlePhotosRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/garmin', garminRouter);
app.use('/api/play-status', playStatusRouter);
app.use('/api/play-locations', playLocationsRouter);
app.use('/api/play-admin', playAdminRouter);
app.use('/api/relay', relayRouter);
app.use('/api/dinner-plans', dinnerPlansRouter);
app.use('/api/calendar-connections', calendarConnectionsRouter);
app.use('/api/brief', briefRouter);
app.use('/api/telemedicine', telemedicineRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/roadmap', roadmapRouter);
app.use('/api/local-friends', localFriendsRouter);

// Servér det bygde frontend-bygget (frontend/dist) på samme origin som API-et,
// hvis det finnes – dette er hva som kreves for produksjonshosting (se
// README "Plan for deploy"). I vanlig lokal utvikling kjører frontend på egen
// Vite-server i stedet, og dist/ finnes ikke, så dette gjør ingenting da.
const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendDist = path.join(backendRoot, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ikke funnet' });
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ error: 'Ikke funnet' });
  });
}

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
  startXploraPolling(io);

  cleanupOldPlayStatus();
  setInterval(cleanupOldPlayStatus, 24 * 60 * 60 * 1000);
  initRelayClient(io);
  startBriefScheduler(io);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
