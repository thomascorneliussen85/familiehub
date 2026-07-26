import { Router } from 'express';
import { getBusDepartures } from '../services/enturService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await getBusDepartures();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å hente busstider', detail: err.message });
  }
});

export default router;
