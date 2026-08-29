import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'fleet_admin_session';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000, // 12 timer – kortere enn FamilieHub sin egen 30-dagers økt, siden dette er et administrasjonspanel
  };
}

export function signAdminSession() {
  return jwt.sign({ admin: true }, config.jwtSecret, { expiresIn: '12h' });
}

export function requireAdminAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Ikke innlogget' });
  try {
    jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return res.status(401).json({ error: 'Økten er utløpt – logg inn på nytt' });
  }
}
