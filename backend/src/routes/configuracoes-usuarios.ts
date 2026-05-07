import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../lib/auth';
import { APP_PERMISSION_CATALOG, buildFullPermissions, normalizePermissions } from '../lib/app-permissions';
import { prisma } from '../lib/prisma';

export const configuracoesUsuariosRouter = Router();

function requireBruno(req: any, res: any) {
  const username = String(req.authUser?.username || '').trim().toLowerCase();
  if (username !== 'bruno') {
    res.status(403).json({ ok: false, error: 'Acesso permitido somente para Bruno.' });
    return false;
  }
  return true;
}

const userSchema = z.object({
  username: z.string().trim().min(2),
  displayName: z.string().trim().min(2),
  password: z.union([z.string().trim().min(4), z.literal('')]).optional(),
  active: z.boolean().default(true),
  isAdmin: z.boolean().default(false),
  permissions: z.record(z.array(z.string())).default({}),
});

const userUpdateSchema = userSchema.extend({
  password: z.union([z.string().trim().min(4), z.literal('')]).optional(),
});

function cleanUser(user: any) {
  const isAdmin = !!user.isAdmin || String(user.username).toLowerCase() === 'bruno';
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    active: user.active,
    isAdmin,
    permissions: isAdmin ? buildFullPermissions() : normalizePermissions(user.permissions),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function ensureBrunoFromSession(req: any) {
  const username = String(req.authUser?.username || '').trim().toLowerCase();
  if (username !== 'bruno') return;
  const exists = await (prisma as any).appUser.findUnique({ where: { username } });
  if (exists) return;

  await (prisma as any).appUser.create({
    data: {
      username: 'bruno',
      displayName: req.authUser?.displayName || 'Bruno',
      passwordHash: hashPassword(`trocar-${Date.now()}`),
      active: true,
      isAdmin: true,
      permissions: buildFullPermissions(),
    },
  });
}

configuracoesUsuariosRouter.get('/catalogo', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    res.json({ ok: true, catalogo: APP_PERMISSION_CATALOG });
  } catch (e) {
    next(e);
  }
});

configuracoesUsuariosRouter.get('/usuarios', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    await ensureBrunoFromSession(req);
    const users = await (prisma as any).appUser.findMany({ orderBy: [{ active: 'desc' }, { username: 'asc' }] });
    res.json({ ok: true, usuarios: users.map(cleanUser) });
  } catch (e) {
    next(e);
  }
});

configuracoesUsuariosRouter.post('/usuarios', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const payload = userSchema.parse(req.body || {});
    if (!payload.password) return res.status(400).json({ ok: false, error: 'Informe uma senha inicial.' });
    const username = payload.username.toLowerCase();
    const user = await (prisma as any).appUser.create({
      data: {
        username,
        displayName: payload.displayName,
        passwordHash: hashPassword(payload.password),
        active: payload.active,
        isAdmin: payload.isAdmin || username === 'bruno',
        permissions: payload.isAdmin || username === 'bruno' ? buildFullPermissions() : normalizePermissions(payload.permissions),
      },
    });
    res.json({ ok: true, usuario: cleanUser(user) });
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ ok: false, error: 'Usuario ja existe.' });
    next(e);
  }
});

configuracoesUsuariosRouter.put('/usuarios/:id', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const id = Number(req.params.id);
    const payload = userUpdateSchema.parse(req.body || {});
    const username = payload.username ? payload.username.toLowerCase() : undefined;
    const isAdmin = !!payload.isAdmin || username === 'bruno';
    const user = await (prisma as any).appUser.update({
      where: { id },
      data: {
        ...(username ? { username } : {}),
        ...(payload.displayName ? { displayName: payload.displayName } : {}),
        ...(typeof payload.active === 'boolean' ? { active: payload.active } : {}),
        ...(typeof payload.isAdmin === 'boolean' ? { isAdmin } : {}),
        ...(payload.permissions ? { permissions: isAdmin ? buildFullPermissions() : normalizePermissions(payload.permissions) } : {}),
      },
    });
    res.json({ ok: true, usuario: cleanUser(user) });
  } catch (e) {
    next(e);
  }
});

configuracoesUsuariosRouter.post('/usuarios/:id/reset-senha', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const id = Number(req.params.id);
    const password = String(req.body?.password || '').trim();
    if (password.length < 4) return res.status(400).json({ ok: false, error: 'Senha precisa ter pelo menos 4 caracteres.' });
    const user = await (prisma as any).appUser.update({
      where: { id },
      data: { passwordHash: hashPassword(password) },
    });
    res.json({ ok: true, usuario: cleanUser(user) });
  } catch (e) {
    next(e);
  }
});
