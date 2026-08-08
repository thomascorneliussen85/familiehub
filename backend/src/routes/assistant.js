import { Router } from 'express';
import { runAssistantCommand } from '../services/assistantService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.post('/command', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Ingen tekst mottatt' });
  }
  try {
    const result = await runAssistantCommand(text.trim(), req.app.get('io'), req.familyId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
