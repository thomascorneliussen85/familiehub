import { Router } from 'express';
import { getWeather } from '../services/weatherService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const data = await getWeather();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Klarte ikke å hente værmelding', detail: err.message });
  }
});

export default router;
