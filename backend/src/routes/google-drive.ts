import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const googleDriveRouter = Router();

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_URL = 'https://www.googleapis.com/drive/v3';
const DEFAULT_DETRAN_CONFIG_SLUG = 'default';
const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

function normalizeText(value: any) {
  return String(value || '').trim();
}

async function getConfig() {
  // Credenciais OAuth ficam na DetranConfig (gmailClientId, gmailClientSecret, gmailRefreshToken)
  // Configurações do Drive (rootFolderId, motoDirs, accessToken) ficam na ConfiguracaoGeral
  let cfg = await prisma.configuracaoGeral.findFirst();
  if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });

  const detranCfg = await prisma.detranConfig.findFirst();
  const driveRefreshToken = normalizeText(cfg.googleDriveRefreshToken);
  const gmailRefreshToken = normalizeText(detranCfg?.gmailRefreshToken);

  return {
    ...cfg,
    // Sobrepõe com as credenciais OAuth do DetranConfig
    googleDriveClientId: detranCfg?.gmailClientId || cfg.googleDriveClientId || '',
    googleDriveClientSecret: detranCfg?.gmailClientSecret || cfg.googleDriveClientSecret || '',
    googleDriveRefreshToken: driveRefreshToken || gmailRefreshToken,
    googleDriveFallbackRefreshToken: driveRefreshToken && gmailRefreshToken && driveRefreshToken !== gmailRefreshToken ? gmailRefreshToken : '',
  };
}

function createGoogleDriveError(message: string, status = 500) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

async function clearCachedGoogleDriveToken() {
  await prisma.configuracaoGeral.updateMany({
    data: { googleDriveAccessToken: '', googleDriveTokenExpiry: null },
  });
}

function getGoogleApiErrorMessage(payload: any, fallback: string) {
  return String(
    payload?.error_description
    || payload?.error?.message
    || payload?.error
    || fallback,
  ).trim();
}

async function getValidToken(cfg: any, options?: { forceRefresh?: boolean }): Promise<string | null> {
  const now = new Date();
  const expiry = cfg.googleDriveTokenExpiry ? new Date(cfg.googleDriveTokenExpiry) : null;
  if (!options?.forceRefresh && cfg.googleDriveAccessToken && expiry && expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
    return cfg.googleDriveAccessToken;
  }

  const refreshTokens = [
    normalizeText(cfg.googleDriveRefreshToken),
    normalizeText(cfg.googleDriveFallbackRefreshToken),
  ].filter((token, index, array) => token && array.indexOf(token) === index);
  if (!refreshTokens.length) return null;

  let lastError: any = null;
  for (const refreshToken of refreshTokens) {
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.googleDriveClientId,
        client_secret: cfg.googleDriveClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json().catch(() => ({})) as any;
    if (!resp.ok || !data.access_token) {
      lastError = data;
      continue;
    }

    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await prisma.configuracaoGeral.updateMany({
      data: {
        googleDriveAccessToken: data.access_token,
        googleDriveRefreshToken: normalizeText(data.refresh_token) || refreshToken,
        googleDriveTokenExpiry: newExpiry,
      },
    });
    return data.access_token;
  }

  await clearCachedGoogleDriveToken();
  throw createGoogleDriveError(
    getGoogleApiErrorMessage(lastError, 'Nao foi possivel renovar o acesso ao Google Drive. Reconecte o Google.'),
    401,
  );
}

async function saveGoogleDriveOAuthTokens(data: any, cfg: any, expiry: Date) {
  const refreshToken = normalizeText(data.refresh_token) || normalizeText(cfg.googleDriveRefreshToken);
  await prisma.configuracaoGeral.updateMany({
    data: {
      googleDriveAccessToken: normalizeText(data.access_token),
      googleDriveRefreshToken: refreshToken,
      googleDriveTokenExpiry: expiry,
    },
  });

  if (refreshToken) {
    await prisma.detranConfig.upsert({
      where: { slug: DEFAULT_DETRAN_CONFIG_SLUG },
      update: {
        gmailClientId: normalizeText(cfg.googleDriveClientId),
        gmailClientSecret: normalizeText(cfg.googleDriveClientSecret),
        gmailRefreshToken: refreshToken,
      },
      create: {
        slug: DEFAULT_DETRAN_CONFIG_SLUG,
        gmailClientId: normalizeText(cfg.googleDriveClientId),
        gmailClientSecret: normalizeText(cfg.googleDriveClientSecret),
        gmailRefreshToken: refreshToken,
      },
    });
  }
}

async function driveFetch(cfg: any, path: string) {
  const execute = (token: string) => fetch(`${GOOGLE_DRIVE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let token = await getValidToken(cfg);
  if (!token) throw createGoogleDriveError('Google Drive nao conectado', 401);

  let resp = await execute(token);
  if ((resp.status === 401 || resp.status === 403) && cfg.googleDriveRefreshToken) {
    await clearCachedGoogleDriveToken();
    const fallbackRefreshToken = normalizeText(cfg.googleDriveFallbackRefreshToken);
    const primaryRefreshToken = normalizeText(cfg.googleDriveRefreshToken);
    token = await getValidToken({
      ...cfg,
      googleDriveRefreshToken: fallbackRefreshToken || primaryRefreshToken,
      googleDriveFallbackRefreshToken: fallbackRefreshToken ? primaryRefreshToken : '',
      googleDriveAccessToken: '',
      googleDriveTokenExpiry: null,
    }, { forceRefresh: true });
    if (token) resp = await execute(token);
  }

  return resp;
}

async function driveGet(cfg: any, path: string): Promise<any> {
  const resp = await driveFetch(cfg, path);
  const data = await resp.json().catch(() => ({})) as any;
  if (!resp.ok) {
    throw createGoogleDriveError(getGoogleApiErrorMessage(data, `Google Drive ${resp.status}`), resp.status);
  }
  return data;
}

// GET /google-drive/config
googleDriveRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    let connectionError = '';
    const connected = await driveGet(cfg, '/about?fields=user').then(() => true).catch((error: any) => {
      connectionError = error?.message || 'Falha ao validar conexao com Google Drive';
      return false;
    });
    res.json({
      ok: true,
      clientId: cfg.googleDriveClientId || '',
      connected,
      connectionError,
      rootFolderId: cfg.googleDriveRootFolderId || '',
      motoDirs: cfg.googleDriveMotoDirs || {},
    });
  } catch (e) { next(e); }
});

// POST /google-drive/config
googleDriveRouter.post('/config', async (req, res, next) => {
  try {
    const { clientId, clientSecret, rootFolderId, motoDirs } = req.body || {};
    const data: any = {};
    if (clientId !== undefined) data.googleDriveClientId = String(clientId).trim();
    if (clientSecret !== undefined) data.googleDriveClientSecret = String(clientSecret).trim();
    if (rootFolderId !== undefined) data.googleDriveRootFolderId = String(rootFolderId).trim();
    if (motoDirs !== undefined) data.googleDriveMotoDirs = motoDirs;
    if (clientId !== undefined || clientSecret !== undefined) {
      data.googleDriveAccessToken = '';
      data.googleDriveTokenExpiry = null;
    }
    await prisma.configuracaoGeral.updateMany({ data });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /google-drive/auth-url
googleDriveRouter.get('/auth-url', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    if (!cfg.googleDriveClientId) return res.status(400).json({ error: 'Client ID não configurado' });
    const backendUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (process.env.BACKEND_URL || 'http://localhost:8080');
    const redirectUri = `${backendUrl}/google/callback`;
    const params = new URLSearchParams({
      client_id: cfg.googleDriveClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });
    res.json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (e) { next(e); }
});

// GET /google/callback — OAuth callback
googleDriveRouter.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('Código não encontrado');
    const cfg = await getConfig();
    const backendUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (process.env.BACKEND_URL || 'http://localhost:8080');
    const redirectUri = `${backendUrl}/google/callback`;
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.googleDriveClientId,
        client_secret: cfg.googleDriveClientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await resp.json() as any;
    if (!data.access_token) return res.status(400).send(`Erro OAuth: ${JSON.stringify(data)}`);
    const expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await saveGoogleDriveOAuthTokens(data, cfg, expiry);
    const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.anbparts.com.br';
    res.redirect(`${frontendUrl}/conf-google-drive?connected=1`);
  } catch (e) { next(e); }
});

// GET /google-drive/listar-pastas-moto
// Lista subpastas do rootFolderId para mapear motos
googleDriveRouter.get('/listar-pastas-moto', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    const rootId = cfg.googleDriveRootFolderId;
    if (!rootId) return res.status(400).json({ error: 'ID da pasta raiz não configurado' });

    // Lista todas as subpastas dentro do root (marcas) e dentro delas (motos)
    const marcasResp = await driveGet(cfg, `/files?q='${rootId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&fields=files(id,name)&pageSize=50&orderBy=name`);
    const marcas: any[] = marcasResp.files || [];

    const todasPastas: any[] = [];
    for (const marca of marcas) {
      const motosResp = await driveGet(cfg, `/files?q='${marca.id}'+in+parents+and+mimeType='application/vnd.google-apps.folder'&fields=files(id,name)&pageSize=100&orderBy=name`);
      const motos: any[] = (motosResp.files || []).map((m: any) => ({
        id: m.id,
        nome: m.name,
        marca: marca.name,
      }));
      todasPastas.push(...motos);
    }

    res.json({ ok: true, pastas: todasPastas });
  } catch (e) { next(e); }
});

// POST /google-drive/buscar-fotos-sku
// Body: { motoId, sku }
googleDriveRouter.post('/buscar-fotos-sku', async (req, res, next) => {
  try {
    const { motoId, sku } = req.body || {};
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });

    const cfg = await getConfig();

    const motoDirs = (cfg.googleDriveMotoDirs as any) || {};
    const motoPastaId = motoId ? motoDirs[String(motoId)] : null;
    if (!motoPastaId) return res.status(400).json({ error: `Pasta não configurada para moto ID ${motoId}` });

    const skuBase = String(sku).toUpperCase().replace(/-\d+$/, '');

    // Busca subpasta da moto cujo nome começa com o SKU
    const pastasResp = await driveGet(cfg, `/files?q='${motoPastaId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+name+contains+'${skuBase}'&fields=files(id,name)&pageSize=10`);
    const pastas: any[] = pastasResp.files || [];
    const pasta = pastas.find((p: any) => String(p.name).toUpperCase().startsWith(skuBase));

    if (!pasta) {
      return res.json({ ok: true, fotos: [], mensagem: `Pasta do SKU ${skuBase} não encontrada` });
    }

    // Lista imagens dentro da pasta
    const fotosResp = await driveGet(cfg, `/files?q='${pasta.id}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name,mimeType,size)&orderBy=name&pageSize=50`);
    let fotos: any[] = (fotosResp.files || []).map((f: any) => ({
      id: f.id, nome: f.name, mimeType: f.mimeType, size: f.size,
    }));

    // Ordena: capa primeiro (qualquer variação: SKU_CAPA, CAPA, SKU_Capa, etc.)
    fotos.sort((a, b) => {
      const aCapa = a.nome.toLowerCase().includes('capa') ? 0 : 1;
      const bCapa = b.nome.toLowerCase().includes('capa') ? 0 : 1;
      if (aCapa !== bCapa) return aCapa - bCapa;
      return a.nome.localeCompare(b.nome);
    });

    res.json({ ok: true, fotos, pasta: pasta.name, totalFotos: fotos.length });
  } catch (e) { next(e); }
});

// POST /google-drive/download-foto
googleDriveRouter.post('/download-foto', async (req, res, next) => {
  try {
    const { fileId, mimeType } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'fileId obrigatorio' });
    const cfg = await getConfig();
    const resp = await driveFetch(cfg, `/files/${fileId}?alt=media`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({})) as any;
      return res.status(resp.status).json({ error: getGoogleApiErrorMessage(data, `Erro ao baixar: ${resp.status}`) });
    }
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mime = mimeType || resp.headers.get('content-type') || 'image/jpeg';
    res.json({ ok: true, dataUrl: `data:${mime};base64,${base64}`, base64, mimeType: mime });
  } catch (e) { next(e); }
});

// POST /google-drive/desconectar
googleDriveRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await prisma.configuracaoGeral.updateMany({
      data: { googleDriveAccessToken: '', googleDriveRefreshToken: '', googleDriveTokenExpiry: null },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
