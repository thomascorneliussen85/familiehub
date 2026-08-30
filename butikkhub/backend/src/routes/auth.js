import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { signSession, requireAuth, SESSION_COOKIE, cookieOptions } from '../middleware/requireAuth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  const { butikknavn, email, password } = req.body || {};
  if (!butikknavn?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Butikknavn, e-post og passord er påkrevd' });
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
  const createButikk = db.transaction(() => {
    const butikkId = db.prepare('INSERT INTO butikker (navn) VALUES (?)').run(butikknavn.trim()).lastInsertRowid;
    const userId = db
      .prepare('INSERT INTO users (butikk_id, email, password_hash) VALUES (?, ?, ?)')
      .run(butikkId, normalizedEmail, passwordHash).lastInsertRowid;
    return { id: userId, butikk_id: butikkId };
  });

  const user = createButikk();
  res.cookie(SESSION_COOKIE, signSession(user), cookieOptions());
  res.status(201).json({ email: normalizedEmail, butikknavn: butikknavn.trim() });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Feil e-post eller passord' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Feil e-post eller passord' });
  res.cookie(SESSION_COOKIE, signSession(user), cookieOptions());
  const butikk = db.prepare('SELECT * FROM butikker WHERE id = ?').get(user.butikk_id);
  res.json({ email: user.email, butikknavn: butikk?.navn });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  const butikk = db.prepare('SELECT * FROM butikker WHERE id = ?').get(req.butikkId);
  res.json({ email: user?.email, butikknavn: butikk?.navn });
});

router.post('/verify-pin', requireAuth, (req, res) => {
  const { pin } = req.body || {};
  const row = db.prepare('SELECT value FROM settings WHERE butikk_id = ? AND key = ?').get(req.butikkId, 'butikksjef_pin');
  const expected = row?.value || '1234';
  res.json({ ok: pin === expected });
});

export default router;
