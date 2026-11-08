import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { scanRoomForClutter } from '../services/declutterScanService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 6 },
});

// Tar imot ett bilde, eller noen bilder plukket ut fra en video (se
// lib/videoFrames.js i frontend), av et rom – og bruker Claude til å finne
// ting som bør ryddes bort. Oppretter ikke gjøremål ennå, frontend viser
// funnene for bekreftelse først, samme mønster som /calendar/scan.
router.post('/scan', upload.array('images', 6), async (req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ error: 'Ingen bilde mottatt' });
  }
  if (req.files.some((f) => !f.mimetype?.startsWith('image/'))) {
    return res.status(400).json({ error: 'Filene må være bilder' });
  }
  try {
    const mediaType = req.files[0].mimetype;
    const base64Images = req.files.map((f) => f.buffer.toString('base64'));
    const result = await scanRoomForClutter(base64Images, mediaType);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
