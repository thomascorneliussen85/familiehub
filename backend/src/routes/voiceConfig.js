import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { encryptSecret, decryptSecret, isFinanceEncryptionConfigured } from '../services/financeCrypto.js';
import { synthesizeSpeech, listVoices } from '../services/elevenLabsService.js';

const router = Router();
router.use(requireAuth);

function getConfig(familyId) {
  return db.prepare('SELECT * FROM voice_config WHERE family_id = ?').get(familyId);
}

router.get('/config', requireFamilyPin, (req, res) => {
  const cfg = getConfig(req.familyId);
  res.json({
    configured: Boolean(cfg?.elevenlabs_api_key_encrypted),
    voiceId: cfg?.voice_id || null,
    encryptionConfigured: isFinanceEncryptionConfigured(),
  });
});

router.patch('/config', requireFamilyPin, (req, res) => {
  if (!isFinanceEncryptionConfigured()) {
    return res.status(500).json({
      error: 'FINANCE_ENCRYPTION_KEY er ikke satt på serveren. Kontakt den som satte opp installasjonen.',
    });
  }
  const { apiKey, voiceId } = req.body || {};
  const existing = getConfig(req.familyId);
  const next = {
    familyId: req.familyId,
    apiKeyEncrypted:
      apiKey !== undefined ? (apiKey ? encryptSecret(apiKey) : null) : existing?.elevenlabs_api_key_encrypted ?? null,
    voiceId: voiceId !== undefined ? voiceId || null : existing?.voice_id ?? null,
  };
  db.prepare(
    `INSERT INTO voice_config (family_id, elevenlabs_api_key_encrypted, voice_id, updated_at)
     VALUES (@familyId, @apiKeyEncrypted, @voiceId, datetime('now'))
     ON CONFLICT(family_id) DO UPDATE SET
       elevenlabs_api_key_encrypted = excluded.elevenlabs_api_key_encrypted,
       voice_id = excluded.voice_id,
       updated_at = datetime('now')`
  ).run(next);
  res.json({ ok: true });
});

router.get('/voices', requireFamilyPin, async (req, res) => {
  const cfg = getConfig(req.familyId);
  const apiKey = decryptSecret(cfg?.elevenlabs_api_key_encrypted);
  if (!apiKey) return res.status(400).json({ error: 'Ingen ElevenLabs-nøkkel lagret ennå' });
  try {
    const voices = await listVoices(apiKey);
    res.json(voices);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Kalles av VoiceButton hver gang assistenten skal si noe høyt – ikke
// PIN-gated (dette er vanlig bruk, ikke en admin-handling), kun innlogget.
router.post('/speak', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Ingen tekst å lese opp' });
  const cfg = getConfig(req.familyId);
  const apiKey = decryptSecret(cfg?.elevenlabs_api_key_encrypted);
  if (!apiKey || !cfg?.voice_id) {
    return res.status(400).json({ error: 'ElevenLabs er ikke satt opp ennå' });
  }
  try {
    const audio = await synthesizeSpeech(text.trim(), apiKey, cfg.voice_id);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
