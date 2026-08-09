import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { signSession, cookieOptions, SESSION_COOKIE, requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import { getOwnerFamilyId } from '../services/ownerFamily.js';

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
  res.status(201).json({
    email: normalizedEmail,
    familyName: familyName.trim(),
    isOwnerFamily: user.family_id === getOwnerFamilyId(),
  });
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
  res.json({
    email: user.email,
    familyName: family?.name || '',
    isOwnerFamily: user.family_id === getOwnerFamilyId(),
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(req.familyId);
  if (!user || !family) return res.status(401).json({ error: 'Ikke innlogget' });
  res.json({
    email: user.email,
    familyName: family.name,
    isOwnerFamily: req.familyId === getOwnerFamilyId(),
  });
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

// Flere voksne i samme familie kan ha hver sin innlogging (egen e-post/
// passord), i stedet for å dele én konto – de havner i samme family_id og
// ser derfor nøyaktig den samme familiens data.
router.get('/users', requireAuth, requireFamilyPin, (req, res) => {
  const rows = db
    .prepare('SELECT id, email, created_at FROM users WHERE family_id = ? ORDER BY created_at ASC')
    .all(req.familyId);
  res.json(rows);
});

router.post('/users', requireAuth, requireFamilyPin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'E-post og passord er påkrevd' });
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
  const userId = db
    .prepare('INSERT INTO users (family_id, email, password_hash) VALUES (?, ?, ?)')
    .run(req.familyId, normalizedEmail, passwordHash).lastInsertRowid;
  res.status(201).json({ id: userId, email: normalizedEmail });
});

router.delete('/users/:id', requireAuth, requireFamilyPin, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users WHERE family_id = ?').get(req.familyId).c;
  if (count <= 1) {
    return res.status(400).json({ error: 'Kan ikke slette den siste innloggingen for familien' });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Fant ikke innloggingen' });
  }
  res.status(204).end();
});

export default router;
