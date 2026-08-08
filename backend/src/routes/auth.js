import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { signSession, cookieOptions, SESSION_COOKIE, requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';

const router = Router();

const DEFAULT_PLAY_LOCATIONS = [
  ['Hjemme hos oss', '🏠', 1],
  ['Lekeplassen', '🛝', 2],
  ['Ballbingen', '⚽', 3],
  ['Ute i gaten', '🚸', 4],
];

router.post('/signup', async (req, res) => {
  const { familyName, email, password } = req.body || {};
  if (!familyName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Familienavn, e-post og passord er påkrevd' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passordet må være minst 8 tegn' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Det finnes allerede en konto med denne e-posten' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createFamily = db.transaction(() => {
    const familyId = db.prepare('INSERT INTO families (name) VALUES (?)').run(familyName.trim()).lastInsertRowid;
    const userId = db
      .prepare('INSERT INTO users (family_id, email, password_hash) VALUES (?, ?, ?)')
      .run(familyId, normalizedEmail, passwordHash).lastInsertRowid;
    const insertLocation = db.prepare(
      'INSERT INTO play_locations (family_id, label, emoji, sort_order) VALUES (?, ?, ?, ?)'
    );
    for (const [label, emoji, sortOrder] of DEFAULT_PLAY_LOCATIONS) {
      insertLocation.run(familyId, label, emoji, sortOrder);
    }
    return { id: userId, family_id: familyId };
  });

  const user = createFamily();
  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.status(201).json({ email: normalizedEmail, familyName: familyName.trim() });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'E-post og passord er påkrevd' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: 'Feil e-post eller passord' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Feil e-post eller passord' });
  }
  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(user.family_id);
  res.json({ email: user.email, familyName: family?.name || '' });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(req.familyId);
  if (!user || !family) return res.status(401).json({ error: 'Ikke innlogget' });
  res.json({ email: user.email, familyName: family.name });
});

// Bytt foreldre-PIN for familien (standard '1234' til den byttes) – krever
// gjeldende PIN, samme mønster som resten av admin-handlingene.
router.patch('/pin', requireAuth, requireFamilyPin, (req, res) => {
  const { newPin } = req.body || {};
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'Ny PIN må være 4 siffer' });
  }
  db.prepare(
    `INSERT INTO settings (family_id, key, value) VALUES (?, 'parent_pin', ?)
     ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value`
  ).run(req.familyId, newPin);
  res.status(204).end();
});

export default router;
