import { Router } from 'express';
import { config } from '../config.js';
import { getPhotosAuthUrl, handlePhotosCallback, getSessionStatus, importPickedPhotos } from '../services/googlePhotosService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();
router.use(requireAuth);

router.get('/auth-url', requireFamilyPin, (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.photosRedirectUri) {
    return res.status(400).json({ error: 'Google Photos er ikke konfigurert i .env ennå' });
  }
  res.json({ url: getPhotosAuthUrl() });
});

// Google redirigerer hit direkte i en popup – økt-cookien følger med som
// vanlig siden det er samme nettleser/origin. Sender brukeren videre til
// Googles egen bilde-plukker, som lukker popupen selv når valget er ferdig.
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.status(400).send('Tilkobling til Google Photos ble avbrutt eller feilet. Du kan lukke dette vinduet.');
  }
  try {
    const session = await handlePhotosCallback(req.familyId, code);
    res.redirect(`${session.pickerUri}/autoclose`);
  } catch (err) {
    console.error('Google Photos-tilkobling feilet:', err.message);
    res.status(502).send(`Tilkobling til Google Photos feilet: ${err.message}. Du kan lukke dette vinduet.`);
  }
});

router.get('/session-status', requireFamilyPin, async (req, res) => {
  try {
    res.json(await getSessionStatus(req.familyId));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/import', requireFamilyPin, async (req, res) => {
  try {
    const imported = await importPickedPhotos(req.familyId);
    res.json({ imported });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
