import { Router } from 'express';
import { runAssistantCommand } from '../services/assistantService.js';

const router = Router();

router.post('/command', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Ingen tekst mottatt' });
  }
  try {
    const result = await runAssistantCommand(text.trim(), req.app.get('io'));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
