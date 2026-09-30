import crypto from 'crypto';
import { prisma } from './prisma';

// Hosts confirmados na documentacao oficial (Authorization and Authentication, Shopee Open
// Platform, 2026-07-23). O host de API de sandbox varia entre exemplos da doc (.sg vs .com.br) —
// deixamos configuravel por env pra nao travar em cima de um host nao 100% confirmado; o de
// producao (partner.shopeemobile.com) esta confirmado e fixo.
const SHOPEE_API_HOST_LIVE = 'https://partner.shopeemobile.com';
const SHOPEE_API_HOST_SANDBOX = process.env.SHOPEE_API_HOST_SANDBOX || 'https://openplatform.sandbox.test-stable.shopee.sg';

function getPartnerId() {
  const id = Number(process.env.SHOPEE_PARTNER_ID || 0);
  if (!id) throw new Error('SHOPEE_PARTNER_ID nao configurado');
  return id;
}

function getPartnerKey() {
  const key = String(process.env.SHOPEE_PARTNER_KEY || '');
  if (!key) throw new Error('SHOPEE_PARTNER_KEY nao configurado');
  return key;
}

function normalizeText(value: any) {
  return String(value || '').trim();
}

export async function getShopeeConfig() {
  let config = await prisma.shopeeConfig.findFirst();
  if (!config) {
    config = await prisma.shopeeConfig.create({ data: {} });
  }
  return config;
}

export async function saveShopeeConfig(data: Record<string, any>) {
  const current = await getShopeeConfig();
  return prisma.shopeeConfig.update({
    where: { id: current.id },
    data: {
      environment: data.environment !== undefined ? normalizeText(data.environment) || 'sandbox' : current.environment,
      shopId: data.shopId !== undefined ? normalizeText(data.shopId) : current.shopId,
      accessToken: data.accessToken !== undefined ? normalizeText(data.accessToken) : current.accessToken,
      refreshToken: data.refreshToken !== undefined ? normalizeText(data.refreshToken) : current.refreshToken,
      expiresAt: data.expiresAt !== undefined ? data.expiresAt : current.expiresAt,
      connectedAt: data.connectedAt !== undefined ? data.connectedAt : current.connectedAt,
    },
  });
}

function getApiHost(environment: string) {
  return environment === 'live' ? SHOPEE_API_HOST_LIVE : SHOPEE_API_HOST_SANDBOX;
}

// Base string = partner_id + api_path + timestamp [+ access_token + shop_id]. HMAC-SHA256 com a
// partner_key, hex minusculo. (Authorization and Authentication > Calculating the sign parameter)
function sign(partnerKey: string, parts: (string | number)[]) {
  const baseString = parts.join('');
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

// Assina e monta a URL pra uma chamada "Public API" (sem access_token/shop_id) — usada só pelo
// GetAccessToken/RefreshAccessToken, que autenticam com code/refresh_token no corpo.
function buildPublicUrl(environment: string, path: string) {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(partnerKey, [partnerId, path, timestamp]);
  const host = getApiHost(environment);
  return `${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`;
}

// Assina e monta a URL pra uma "Shop API" (com access_token/shop_id no sign base string).
function buildShopUrl(environment: string, path: string, accessToken: string, shopId: string) {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(partnerKey, [partnerId, path, timestamp, accessToken, shopId]);
  const host = getApiHost(environment);
  return `${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&access_token=${accessToken}&shop_id=${shopId}`;
}

// POST /api/v2/auth/token/get — troca o `code` (+ shop_id) recebido no callback pelo primeiro par
// access_token/refresh_token. Chamado uma vez, na autorizacao inicial.
export async function shopeeExchangeCodeForToken(code: string, shopId: string, environment: string) {
  const partnerId = getPartnerId();
  const url = buildPublicUrl(environment, '/api/v2/auth/token/get');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: partnerId }),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || payload?.error || `Shopee ${response.status}`);
  }
  return payload;
}

// POST /api/v2/auth/access_token/get — renova o access_token usando o refresh_token (valido 30
// dias). O access_token expira em 4h; chamamos isso sob demanda quando uma chamada falha com 401
// ou preventivamente quando `expiresAt` ja passou.
async function shopeeRefreshToken() {
  const config = await getShopeeConfig();
  if (!config.refreshToken) throw new Error('Sem refresh token da Shopee. Reconecte a loja em Configuracao.');
  if (!config.shopId) throw new Error('Sem shopId da Shopee configurado.');

  const partnerId = getPartnerId();
  const url = buildPublicUrl(config.environment, '/api/v2/auth/access_token/get');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: config.refreshToken, shop_id: Number(config.shopId), partner_id: partnerId }),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || payload?.error || `Shopee ${response.status}`);
  }

  const expiresAt = new Date(Date.now() + Number(payload.expire_in || 0) * 1000);
  await saveShopeeConfig({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || config.refreshToken,
    expiresAt,
  });

  return String(payload.access_token || '');
}

// Chamada generica autenticada de Shop API (produto, imagem, etc). Assina automaticamente com o
// access_token/shop_id salvos, e renova o token sozinho se estiver vencido ou se a Shopee
// responder com erro de token invalido.
export async function shopeeReq(path: string, init?: { method?: string; body?: any }) {
  let config = await getShopeeConfig();
  if (!config.accessToken || !config.shopId) throw new Error('Shopee nao autorizada. Conecte a loja em Configuracao.');

  const precisaRenovar = config.expiresAt ? new Date(config.expiresAt).getTime() < Date.now() + 60_000 : false;
  if (precisaRenovar) {
    await shopeeRefreshToken();
    config = await getShopeeConfig();
  }

  async function doRequest(accessToken: string) {
    const url = buildShopUrl(config.environment, path, accessToken, config.shopId);
    return fetch(url, {
      method: init?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  let response = await doRequest(config.accessToken);
  let payload: any = await response.json().catch(() => ({}));

  // error "error_auth" / invalid_access_token -> tenta renovar uma vez e repetir.
  if (payload?.error && /token/i.test(String(payload.error))) {
    const novoToken = await shopeeRefreshToken();
    response = await doRequest(novoToken);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || payload?.error || `Shopee ${response.status}`);
  }

  return payload;
}
