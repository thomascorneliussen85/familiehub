import jwt from 'jsonwebtoken';
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
  return jwt.sign({ userId: user.id, familyId: user.family_id }, config.jwtSecret, { expiresIn: '30d' });
}

// Setter req.familyId/req.userId fra økt-cookien. family_id herfra er den
// ENESTE kilden til sannhet for hvilken familie en forespørsel tilhører –
// aldri stol på en family_id sendt fra klienten selv.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Ikke innlogget' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.familyId = payload.familyId;
    req.userId = payload.userId;
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return res.status(401).json({ error: 'Økten er utløpt – logg inn på nytt' });
  }
}
