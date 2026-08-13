import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { generateWeeklyBrief, getBriefHistory, askFinanceChat } from '../services/financeBriefService.js';
import { categorizeTransactions } from '../services/financeCategorizer.js';

const router = Router();
router.use(requireAuth);
router.use(requireFamilyPin);

router.get('/briefs', (req, res) => {
  res.json(getBriefHistory(req.familyId));
});

router.post('/briefs/regenerate', async (req, res) => {
  try {
    const result = await generateWeeklyBrief(req.familyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kjøres normalt automatisk etter hver import, men eksponert som egen rute
// slik at man kan trigge kategorisering på nytt manuelt – f.eks. for
// transaksjoner som ble importert FØR en Claude-nøkkel ble lagt inn.
router.post('/categorize', async (req, res) => {
  try {
    const result = await categorizeTransactions(req.familyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message er påkrevd' });
  try {
    const reply = await askFinanceChat(req.familyId, message.trim());
    res.json({ reply });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
