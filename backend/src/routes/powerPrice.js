import { Router } from 'express';
import { getPowerPrices } from '../services/powerPriceService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await getPowerPrices();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å hente strømpriser', detail: err.message });
  }
});

export default router;
