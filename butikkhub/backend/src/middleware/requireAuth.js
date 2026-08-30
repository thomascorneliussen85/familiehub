import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'butikkhub_session';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

export function signSession(user) {
  return jwt.sign({ userId: user.id, butikkId: user.butikk_id }, config.jwtSecret, { expiresIn: '30d' });
}

// butikkId herfra er ENESTE kilde til sannhet for hvilken butikk en
// forespørsel tilhører – akkurat som familyId i FamilieHub, aldri fra klienten selv.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Ikke innlogget' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.butikkId = payload.butikkId;
    req.userId = payload.userId;
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return res.status(401).json({ error: 'Økten er utløpt – logg inn på nytt' });
  }
}
