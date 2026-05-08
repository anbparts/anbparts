import { Router } from 'express';
import { z } from 'zod';
import {
  APP_NOTIFICATION_CATALOG,
  canReceiveNotification,
  collectNotificationsForTypes,
  normalizeNotificationTypes,
} from '../lib/app-notifications';
import { prisma } from '../lib/prisma';

export const notificacoesRouter = Router();

const markReadSchema = z.object({
  ids: z.array(z.string().trim().min(1)).default([]),
});

function notificationId(type: string, itemKey: string) {
  return `${type}:${itemKey}`;
}

function splitNotificationId(id: string) {
  const index = id.indexOf(':');
  if (index <= 0) return null;
  return {
    type: id.slice(0, index),
    itemKey: id.slice(index + 1),
  };
}

async function loadEnabledTypesForUser(user: any) {
  const username = String(user?.username || '').trim().toLowerCase();
  const appUser = await (prisma as any).appUser.findUnique({
    where: { username },
    select: {
      id: true,
      notificationSettings: {
        where: { enabled: true },
        select: { type: true },
      },
    },
  });

  const configuredTypes = normalizeNotificationTypes(appUser?.notificationSettings?.map((item: any) => item.type));
  return APP_NOTIFICATION_CATALOG
    .filter((item) => configuredTypes.includes(item.key))
    .filter((item) => canReceiveNotification(user, item))
    .map((item) => item.key);
}

notificacoesRouter.get('/catalogo', async (_req, res) => {
  res.json({ ok: true, catalogo: APP_NOTIFICATION_CATALOG });
});

notificacoesRouter.get('/', async (req, res, next) => {
  try {
    const authUser = (req as any).authUser;
    const username = String(authUser?.username || '').trim().toLowerCase();
    const enabledTypes = await loadEnabledTypesForUser(authUser);
    const notifications = await collectNotificationsForTypes(enabledTypes, 25);
    const readRows = notifications.length
      ? await (prisma as any).appNotificationRead.findMany({
          where: {
            username,
            OR: notifications.map((item) => ({ type: item.type, itemKey: item.itemKey })),
          },
          select: { type: true, itemKey: true, readAt: true },
        })
      : [];
    const readSet = new Set(readRows.map((item: any) => notificationId(item.type, item.itemKey)));
    const items = notifications.map((item) => {
      const id = notificationId(item.type, item.itemKey);
      return {
        id,
        ...item,
        read: readSet.has(id),
      };
    });

    res.json({
      ok: true,
      total: items.length,
      unread: items.filter((item) => !item.read).length,
      items,
    });
  } catch (e) {
    next(e);
  }
});

notificacoesRouter.post('/read', async (req, res, next) => {
  try {
    const authUser = (req as any).authUser;
    const username = String(authUser?.username || '').trim().toLowerCase();
    const payload = markReadSchema.parse(req.body || {});
    const parsed = payload.ids.map(splitNotificationId).filter(Boolean) as Array<{ type: string; itemKey: string }>;

    await Promise.all(parsed.map((item) => (prisma as any).appNotificationRead.upsert({
      where: {
        username_type_itemKey: {
          username,
          type: item.type,
          itemKey: item.itemKey,
        },
      },
      update: { readAt: new Date() },
      create: {
        username,
        type: item.type,
        itemKey: item.itemKey,
      },
    })));

    res.json({ ok: true, read: parsed.length });
  } catch (e) {
    next(e);
  }
});
