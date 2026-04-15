import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const nuvemshopRouter = Router();

async function getConfig() {
  let cfg = await prisma.configuracaoGeral.findFirst();
  if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });
  return cfg;
}

// GET /nuvemshop/config
nuvemshopRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      appId: cfg.nuvemshopAppId || '',
      clientSecret: cfg.nuvemshopClientSecret ? '********' : '',
      accessToken: cfg.nuvemshopAccessToken ? '********' : '',
      storeId: cfg.nuvemshopStoreId || '',
      configured: !!(cfg.nuvemshopAccessToken && cfg.nuvemshopStoreId),
    });
  } catch (e) {
    next(e);
  }
});

// POST /nuvemshop/config
nuvemshopRouter.post('/config', async (req, res, next) => {
  try {
    const { appId, clientSecret, accessToken, storeId } = req.body;
    const cfg = await getConfig();

    const data: any = {};
    if (appId !== undefined) data.nuvemshopAppId = String(appId || '');
    if (clientSecret !== undefined && clientSecret !== '********') data.nuvemshopClientSecret = String(clientSecret || '');
    if (accessToken !== undefined && accessToken !== '********') data.nuvemshopAccessToken = String(accessToken || '');
    if (storeId !== undefined) data.nuvemshopStoreId = String(storeId || '');

    await prisma.configuracaoGeral.update({ where: { id: cfg.id }, data });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /nuvemshop/testar-conexao
nuvemshopRouter.post('/testar-conexao', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    const accessToken = cfg.nuvemshopAccessToken;
    const storeId = cfg.nuvemshopStoreId;

    if (!accessToken || !storeId) {
      return res.json({ ok: false, error: 'Access token e Store ID nao configurados.' });
    }

    const response = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}/store`, {
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'User-Agent': 'ANB Parts (contato@anbparts.com.br)',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.json({ ok: false, error: `Erro ${response.status}: ${text.slice(0, 200)}` });
    }

    const data = await response.json() as any;
    res.json({
      ok: true,
      loja: data.name || data.original_domain || storeId,
      storeId,
    });
  } catch (e: any) {
    next(e);
  }
});
