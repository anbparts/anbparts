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

// Credenciais OAuth ficam na DetranConfig (gmailClientId, gmailClientSecret, gmailRefreshToken)
// Configurações do Drive (rootFolderId, motoDirs, accessToken cache) ficam na ConfiguracaoGeral
async function getConfig() {
  let cfg = await prisma.configuracaoGeral.findFirst();
  if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });

  const detranCfg = await prisma.detranConfig.findFirst();

  // Usa credenciais do DetranConfig como fonte principal (mesmas do Gmail)
  const clientId = detranCfg?.gmailClientId || cfg.googleDriveClientId || '';
  const clientSecret = detranCfg?.gmailClientSecret || cfg.googleDriveClientSecret || '';
  const refreshToken = detranCfg?.gmailRefreshToken || cfg.googleDriveRefreshToken || '';

  return {
    ...cfg,
    googleDriveClientId: clientId,
    googleDriveClientSecret: clientSecret,
    googleDriveRefreshToken: refreshToken,
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

function escapeDriveQueryValue(value: any) {
  return normalizeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function buildDrivePath(path: string, params: Record<string, string>, options?: { includeListParams?: boolean }) {
  const searchParams = new URLSearchParams({
    supportsAllDrives: 'true',
    ...params,
  });
  if (options?.includeListParams) searchParams.set('includeItemsFromAllDrives', 'true');
  return `${path}?${searchParams.toString()}`;
}

async function getValidToken(cfg: any, options?: { forceRefresh?: boolean }): Promise<string | null> {
  const now = new Date();
  const expiry = cfg.googleDriveTokenExpiry ? new Date(cfg.googleDriveTokenExpiry) : null;

  // Usa token em cache se ainda válido por mais de 5 minutos
  if (!options?.forceRefresh && cfg.googleDriveAccessToken && expiry && expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
    return cfg.googleDriveAccessToken;
  }

  const refreshToken = normalizeText(cfg.googleDriveRefreshToken);
  if (!refreshToken) return null;

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
    await clearCachedGoogleDriveToken();
    const errMsg = getGoogleApiErrorMessage(data, 'Não foi possível renovar o acesso ao Google Drive. Verifique o Refresh Token na Config. Gmail.');
    throw createGoogleDriveError(errMsg, 401);
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
  if (!token) throw createGoogleDriveError('Google Drive não conectado. Configure o Refresh Token na Config. Gmail.', 401);

  let resp = await execute(token);

  // Token expirado durante a requisição — força renovação e tenta novamente
  if (resp.status === 401 || resp.status === 403) {
    await clearCachedGoogleDriveToken();
    token = await getValidToken({ ...cfg, googleDriveAccessToken: '', googleDriveTokenExpiry: null }, { forceRefresh: true });
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

async function listDriveFiles(cfg: any, q: string, fields: string, extraParams: Record<string, string> = {}) {
  const files: any[] = [];
  let pageToken = '';

  do {
    const params: Record<string, string> = {
      q,
      fields: `nextPageToken,${fields}`,
      pageSize: extraParams.pageSize || '100',
      orderBy: extraParams.orderBy || 'name',
      ...extraParams,
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await driveGet(cfg, buildDrivePath('/files', params, { includeListParams: true }));
    files.push(...(Array.isArray(data.files) ? data.files : []));
    pageToken = normalizeText(data.nextPageToken);
  } while (pageToken);

  return files;
}

async function getDriveFolder(cfg: any, folderId: string) {
  return driveGet(cfg, buildDrivePath(`/files/${encodeURIComponent(folderId)}`, {
    fields: 'id,name,mimeType',
  }));
}

async function listDriveFoldersInParent(cfg: any, parentId: string, pageSize = '100') {
  return listDriveFiles(
    cfg,
    `'${escapeDriveQueryValue(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'files(id,name)',
    { pageSize, orderBy: 'name', corpora: 'allDrives' },
  );
}

async function listDriveSkuFolders(cfg: any, parentId: string, skuBase: string) {
  return listDriveFiles(
    cfg,
    `'${escapeDriveQueryValue(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${escapeDriveQueryValue(skuBase)}' and trashed = false`,
    'files(id,name)',
    { pageSize: '100', orderBy: 'name' },
  );
}

async function listDriveImagesInParent(cfg: any, parentId: string) {
  return listDriveFiles(
    cfg,
    `'${escapeDriveQueryValue(parentId)}' in parents and mimeType contains 'image/' and trashed = false`,
    'files(id,name,mimeType,size)',
    { pageSize: '100', orderBy: 'name' },
  );
}

// GET /google-drive/config
googleDriveRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    let connectionError = '';
    const connected = await driveGet(cfg, '/about?fields=user').then(() => true).catch((error: any) => {
      connectionError = error?.message || 'Falha ao validar conexão com Google Drive';
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

// GET /google/callback — OAuth callback (público — sem authMiddleware)
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
// Estrutura esperada: rootFolder → Marcas (BMW, HONDA...) → Pastas das motos (02-BM01-F800 GS...)
// Retorna apenas as pastas das motos (2º nível), agrupadas por marca
googleDriveRouter.get('/listar-pastas-moto', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    const rootId = normalizeText(cfg.googleDriveRootFolderId);
    if (!rootId) return res.status(400).json({ error: 'ID da pasta raiz não configurado. Salve o ID na seção "Configuração Acesso Fotos Drive".' });

    // Verifica se a pasta raiz existe e é acessível
    let rootFolder: any = null;
    try {
      rootFolder = await getDriveFolder(cfg, rootId);
    } catch (e: any) {
      return res.status(400).json({
        error: `Pasta raiz não encontrada ou sem acesso: ${e?.message || 'verifique o ID configurado'}`,
      });
    }

    // 1. Lista marcas (BMW, HONDA, YAMAHA...) dentro do root
    // Tenta com corpora=allDrives primeiro (cobre "Outros computadores" / Drive for Desktop)
    let marcas: any[] = [];
    try {
      marcas = await listDriveFoldersInParent(cfg, rootId);
    } catch {}

    // Fallback: tenta sem corpora (Drive pessoal simples)
    if (!marcas.length) {
      try {
        marcas = await listDriveFiles(
          cfg,
          `'${escapeDriveQueryValue(rootId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          'files(id,name)',
          { pageSize: '100', orderBy: 'name' },
        );
      } catch {}
    }

    if (!marcas.length) {
      return res.json({
        ok: true,
        pastas: [],
        diagnostico: {
          rootFolderId: rootId,
          rootFolderName: rootFolder?.name || '',
          aviso: `Pasta raiz "${rootFolder?.name || rootId}" encontrada mas sem subpastas visíveis. O Refresh Token pode não ter escopo drive.readonly completo, ou as pastas estão em outro computador sincronizado.`,
        },
      });
    }

    // 2. Para cada marca, lista as pastas de moto (2º nível)
    const todasPastas: any[] = [];
    for (const marca of marcas) {
      const motoPastas = await listDriveFoldersInParent(cfg, marca.id);
      for (const pasta of motoPastas) {
        todasPastas.push({ id: pasta.id, nome: pasta.name, marca: marca.name });
      }
    }

    // Inclui pastas já configuradas mas não encontradas na varredura
    const motoDirs = (cfg.googleDriveMotoDirs as any) || {};
    const idsEncontrados = new Set(todasPastas.map((p: any) => p.id));
    for (const [motoId, folderIdValue] of Object.entries(motoDirs)) {
      const folderId = normalizeText(folderIdValue);
      if (!folderId || idsEncontrados.has(folderId)) continue;
      let nome = `Moto ID ${motoId}`;
      try {
        const folder = await getDriveFolder(cfg, folderId);
        nome = normalizeText(folder?.name) || nome;
      } catch {}
      todasPastas.push({ id: folderId, nome, marca: 'Configurado anteriormente' });
    }

    todasPastas.sort((a, b) =>
      `${a.marca}/${a.nome}`.localeCompare(`${b.marca}/${b.nome}`, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    res.json({
      ok: true,
      pastas: todasPastas,
      diagnostico: {
        rootFolderId: rootId,
        rootFolderName: rootFolder?.name || '',
        marcasEncontradas: marcas.length,
        totalPastas: todasPastas.length,
      },
    });
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
    const pastas: any[] = await listDriveSkuFolders(cfg, motoPastaId, skuBase);
    const pasta = pastas.find((p: any) => String(p.name).toUpperCase().startsWith(skuBase));

    if (!pasta) {
      return res.json({ ok: true, fotos: [], mensagem: `Pasta do SKU ${skuBase} não encontrada` });
    }

    // Lista imagens dentro da pasta
    let fotos: any[] = (await listDriveImagesInParent(cfg, pasta.id)).map((f: any) => ({
      id: f.id, nome: f.name, mimeType: f.mimeType, size: f.size,
    }));

    // Ordena: capa primeiro
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
    const resp = await driveFetch(cfg, buildDrivePath(`/files/${encodeURIComponent(fileId)}`, { alt: 'media' }));
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
