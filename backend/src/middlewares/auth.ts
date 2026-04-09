import { NextFunction, Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  parseCookies,
  readSessionFromToken,
  serializeClearedSessionCookie,
} from '../lib/auth';

const PUBLIC_PATHS = new Set([
  '/health',
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/bling/callback',
  '/mercado-livre/callback',
  '/mercado-livre/mercado-pago/callback',
]);

function isSecureRequest(req: Request) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return process.env.NODE_ENV === 'production' || forwardedProto === 'https' || req.secure;
}

function getRequestPath(req: Request) {
  return String(req.path || req.originalUrl || '').split('?')[0];
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') return next();

  const path = getRequestPath(req);
  if (PUBLIC_PATHS.has(path)) return next();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.get(AUTH_COOKIE_NAME);
  const session = readSessionFromToken(token);

  if (!session) {
    res.setHeader('Set-Cookie', serializeClearedSessionCookie(isSecureRequest(req)));
    return res.status(401).json({ error: 'Sessao invalida ou expirada. Faca login novamente.' });
  }

  (req as any).authUser = session;
  next();
}
