import { Router } from 'express';
import { getBusDepartures } from '../services/enturService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const data = await getBusDepartures();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å hente busstider', detail: err.message });
  }
});

export default router;
