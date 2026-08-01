import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM play_locations ORDER BY sort_order, id').all());
});

export default router;
