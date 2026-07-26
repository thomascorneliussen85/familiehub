import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { isInsideGeofence } from '../services/geofence.js';

const router = Router();

router.get('/latest', (req, res) => {
  const latest = db
    .prepare('SELECT * FROM gps_positions ORDER BY recorded_at DESC LIMIT 1')
    .get();
  if (!latest) return res.json(null);
  const isHome = isInsideGeofence(latest.lat, latest.lon, config.geofenceHome);
  res.json({ ...latest, isHome, home: config.geofenceHome });
});

router.get('/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json(
    db
      .prepare('SELECT * FROM gps_positions ORDER BY recorded_at DESC LIMIT ?')
      .all(limit)
  );
});

export default router;
