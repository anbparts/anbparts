import { prisma } from './prisma';

// Hosts confirmados na doc oficial (developers.magalu.com/docs/apis/sandbox/overview e
// /docs/first-steps/create-an-application/authentication-authorization).
const MAGALU_API_HOST_LIVE = process.env.MAGALU_API_HOST_LIVE || 'https://api.magalu.com';
const MAGALU_API_HOST_SANDBOX = process.env.MAGALU_API_HOST_SANDBOX || 'https://api-sandbox.magalu.com';
const MAGALU_TOKEN_URL = process.env.MAGALU_TOKEN_URL || 'https://id.magalu.com/oauth/token';
// Canal de sandbox do Magalu tem id fixo documentado (um unico canal "Magalu" disponivel hoje).
const MAGALU_SANDBOX_CHANNEL_ID = process.env.MAGALU_SANDBOX_CHANNEL_ID || '5f62650a-0039-4d65-9b96-266d498c03bd';

function normalizeText(value: any) {
  return String(value || '').trim();
}

export async function getMagaluConfig() {
  let config = await prisma.magaluConfig.findFirst();
  if (!config) {
    config = await prisma.magaluConfig.create({ data: {} });
  }
  return config;
}

export async function saveMagaluConfig(data: Record<string, any>) {
  const current = await getMagaluConfig();
  return prisma.magaluConfig.update({
    where: { id: current.id },
    data: {
      environment: data.environment !== undefined ? normalizeText(data.environment) || 'sandbox' : current.environment,
      clientId: data.clientId !== undefined ? normalizeText(data.clientId) : current.clientId,
      clientSecret: data.clientSecret !== undefined ? normalizeText(data.clientSecret) : current.clientSecret,
      accessToken: data.accessToken !== undefined ? normalizeText(data.accessToken) : current.accessToken,
      refreshToken: data.refreshToken !== undefined ? normalizeText(data.refreshToken) : current.refreshToken,
      expiresAt: data.expiresAt !== undefined ? data.expiresAt : current.expiresAt,
      connectedAt: data.connectedAt !== undefined ? data.connectedAt : current.connectedAt,
    },
  });
}

function getApiHost(environment: string) {
  return environment === 'live' ? MAGALU_API_HOST_LIVE : MAGALU_API_HOST_SANDBOX;
}

export function getMagaluSandboxChannelId() {
  return MAGALU_SANDBOX_CHANNEL_ID;
}

// POST https://id.magalu.com/oauth/token — troca o `code` do callback pelo primeiro par de tokens.
// Confirmado na doc oficial (Obter Autorizacao do Seller via OAuth 2.0, passo 5).
export async function magaluExchangeCodeForToken(code: string, redirectUri: string) {
  const config = await getMagaluConfig();
  if (!config.clientId || !config.clientSecret) throw new Error('Client ID/Secret do Magalu nao configurados.');

  const response = await fetch(MAGALU_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `Magalu ${response.status}`);
  }
  return payload;
}

// Renova o access_token usando o refresh_token (doc: passo 6 da autenticacao). Chamado sob demanda
// quando a chamada autenticada falhar ou o token estiver perto de vencer (mesmo padrao da Shopee).
async function magaluRefreshToken() {
  const config = await getMagaluConfig();
  if (!config.refreshToken) throw new Error('Sem refresh token do Magalu. Reconecte em Configuracao.');
  if (!config.clientId || !config.clientSecret) throw new Error('Client ID/Secret do Magalu nao configurados.');

  const response = await fetch(MAGALU_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `Magalu ${response.status}`);
  }

  const expiresAt = new Date(Date.now() + Number(payload.expires_in || 0) * 1000);
  await saveMagaluConfig({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || config.refreshToken,
    expiresAt,
  });

  return String(payload.access_token || '');
}

// Chamada generica autenticada nas APIs do Magalu (Produtos, Pedidos, Autopecas, etc). Renova o
// token sozinho se estiver perto de vencer ou se a resposta vier com erro de autenticacao.
export async function magaluReq(path: string, init?: { method?: string; body?: any }) {
  let config = await getMagaluConfig();
  if (!config.accessToken) throw new Error('Magalu nao autorizado. Conecte em Configuracao.');

  const precisaRenovar = config.expiresAt ? new Date(config.expiresAt).getTime() < Date.now() + 60_000 : false;
  if (precisaRenovar) {
    await magaluRefreshToken();
    config = await getMagaluConfig();
  }

  async function doRequest(accessToken: string) {
    const host = getApiHost(config.environment);
    return fetch(`${host}${path}`, {
      method: init?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  let response = await doRequest(config.accessToken);
  if (response.status === 401) {
    const novoToken = await magaluRefreshToken();
    response = await doRequest(novoToken);
  }

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.message || payload?.error || `Magalu ${response.status}`);
  }
  return payload;
}
