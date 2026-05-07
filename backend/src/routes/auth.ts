import { Router } from 'express';
import { z } from 'zod';
import {
  AUTH_COOKIE_NAME,
  authenticateAppUser,
  createSessionToken,
  parseCookies,
  readSessionFromToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../lib/auth';

export const authRouter = Router();

const loginSchema = z.object({
  user: z.string().trim().min(1),
  pass: z.string().trim().min(1),
});

function isSecureRequest(req: any) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return process.env.NODE_ENV === 'production' || forwardedProto === 'https' || req.secure;
}

function readSessionFromRequest(req: any) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.get(AUTH_COOKIE_NAME);
  return readSessionFromToken(token);
}

authRouter.post('/login', async (req, res) => {
  const payload = loginSchema.parse(req.body || {});
  const user = await authenticateAppUser(payload.user, payload.pass);

  if (!user) {
    return res.status(401).json({ error: 'Usuario ou senha incorretos' });
  }

  const token = createSessionToken(user);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Set-Cookie', serializeSessionCookie(token, isSecureRequest(req)));
  return res.json({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      permissions: user.permissions,
    },
  });
});

authRouter.get('/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');

  const session = readSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Sessao invalida ou expirada' });
  }

  return res.json({
    ok: true,
    user: {
      username: session.username,
      displayName: session.displayName,
      isAdmin: session.isAdmin,
      permissions: session.permissions,
    },
  });
});

authRouter.post('/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Set-Cookie', serializeClearedSessionCookie(isSecureRequest(req)));
  return res.json({ ok: true });
});
