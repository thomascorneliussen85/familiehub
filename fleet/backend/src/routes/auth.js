import { Router } from 'express';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { signAdminSession, requireAdminAuth, SESSION_COOKIE, cookieOptions } from '../middleware/requireAdminAuth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!config.admin.username || !config.admin.passwordHash) {
    return res.status(500).json({
      error: 'Admin-innlogging er ikke satt opp på serveren (FLEET_ADMIN_USERNAME/FLEET_ADMIN_PASSWORD_HASH mangler i .env)',
    });
  }
  if (username !== config.admin.username) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }
  const ok = await bcrypt.compare(password || '', config.admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }
  res.cookie(SESSION_COOKIE, signAdminSession(), cookieOptions());
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ username: config.admin.username });
});

export default router;
