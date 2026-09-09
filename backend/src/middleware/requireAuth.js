import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'familiehub_session';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dager
  };
}

export function signSession(user) {
  return jwt.sign({ userId: user.id, familyId: user.family_id, version: user.session_version ?? db.prepare('SELECT session_version FROM users WHERE id = ?').get(user.id)?.session_version ?? 0 }, config.jwtSecret, { expiresIn: '30d' });
}

// Setter req.familyId/req.userId fra økt-cookien. family_id herfra er den
// ENESTE kilden til sannhet for hvilken familie en forespørsel tilhører –
// aldri stol på en family_id sendt fra klienten selv.
export function verifySession(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  const user = db.prepare('SELECT family_id, session_version FROM users WHERE id = ?').get(payload.userId);
  if (!user || user.family_id !== payload.familyId || user.session_version !== (payload.version ?? 0)) throw new Error('Revoked session');
  return payload;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Ikke innlogget' });
  try {
    const payload = verifySession(token);
    req.familyId = payload.familyId;
    req.userId = payload.userId;
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return res.status(401).json({ error: 'Økten er utløpt – logg inn på nytt' });
  }
}
