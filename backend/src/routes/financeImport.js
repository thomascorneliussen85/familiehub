import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { previewCsv } from '../services/financeCsvParser.js';
import {
  guessColumnMapping,
  getBankMapping,
  importCsv,
  listImports,
  undoImport,
} from '../services/financeImportService.js';
import { categorizeTransactions } from '../services/financeCategorizer.js';
import { detectRecurring } from '../services/financeRecurringService.js';

const router = Router();
// Økonomidata er blant det mest sensitive i appen – hele denne ruten krever
// derfor familiens PIN (samme mønster som Enheter/reward-admin), ikke bare
// requireAuth. Frontend bruker den eksisterende createAdminApi(pin)-klienten.
router.use(requireAuth);
router.use(requireFamilyPin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Viser kolonner + eksempelrader til ColumnMappingModal, forhåndsutfylt med
// gjettet mapping (eller en tidligere lagret mapping for samme bank).
router.post('/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen fil lastet opp' });
  const bankName = (req.body.bankName || '').trim();
  try {
    const preview = previewCsv(req.file.buffer);
    const savedMapping = bankName ? getBankMapping(req.familyId, bankName) : null;
    res.json({
      ...preview,
      suggestedMapping: savedMapping || { ...guessColumnMapping(preview.headers), dateFormat: preview.guessedDateFormat },
    });
  } catch (err) {
    res.status(400).json({ error: 'Kunne ikke lese filen: ' + err.message });
  }
});

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen fil lastet opp' });
  const { accountId, bankName, mapping } = req.body;
  if (!accountId || !mapping) return res.status(400).json({ error: 'accountId og mapping er påkrevd' });
  let parsedMapping;
  try {
    parsedMapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;
  } catch {
    return res.status(400).json({ error: 'Ugyldig mapping-format' });
  }
  try {
    const result = importCsv(req.familyId, Number(accountId), {
      filename: req.file.originalname,
      bankName: bankName || null,
      buffer: req.file.buffer,
      mapping: parsedMapping,
    });
    // Gjentakelses-gjenkjenning er ren SQL/JS (ingen API-kall) og kjøres
    // derfor synkront før svaret sendes – kategorisering under er det eneste
    // som kan innebære et Claude-kall og skal ikke forsinke responsen.
    detectRecurring(req.familyId);
    res.status(201).json(result);
    categorizeTransactions(req.familyId).catch((err) =>
      console.error('Finance-kategorisering feilet etter import:', err.message)
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/imports', (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : null;
  res.json(listImports(req.familyId, accountId));
});

router.post('/imports/:importId/undo', (req, res) => {
  try {
    res.json(undoImport(req.familyId, Number(req.params.importId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
