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
export async function magaluReq(path: string, init?: { method?: string; body?: any; hostOverride?: string; headers?: Record<string, string> }) {
  let config = await getMagaluConfig();
  if (!config.accessToken) throw new Error('Magalu nao autorizado. Conecte em Configuracao.');

  const precisaRenovar = config.expiresAt ? new Date(config.expiresAt).getTime() < Date.now() + 60_000 : false;
  if (precisaRenovar) {
    await magaluRefreshToken();
    config = await getMagaluConfig();
  }

  async function doRequest(accessToken: string) {
    const host = init?.hostOverride || getApiHost(config.environment);
    return fetch(`${host}${path}`, {
      method: init?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
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
    // Erros de validacao (422) trazem o motivo no corpo (ex: detail/errors por campo) — sem isso so
    // aparecia "Magalu 422". Inclui o corpo (truncado) pra apontar exatamente qual campo reprovou.
    const texto = payload?.error_description || payload?.message || payload?.error;
    const corpo = Object.keys(payload || {}).length ? JSON.stringify(payload).slice(0, 900) : '';
    throw new Error(`Magalu ${response.status}${texto ? `: ${texto}` : ''}${corpo ? ` | ${corpo}` : ''}`);
  }
  return payload;
}

// GET /seller/v1/portfolios/me — confirmado na doc oficial (Seller > Consultar informacoes do
// seller). Devolve tenant/channel/seller — e' daqui que pegamos o channel.id real da loja (nao
// precisa ficar fixo/hardcoded), usado em channels[], prices e stocks. Cacheado em memoria por
// processo (raramente muda), mesmo padrao do canal de logistica da Shopee.
let magaluSellerInfoCache: { ts: number; info: { channelId: string; tenantId: string } } | null = null;
export async function getMagaluSellerInfo(): Promise<{ channelId: string; tenantId: string }> {
  const agora = Date.now();
  if (!magaluSellerInfoCache || agora - magaluSellerInfoCache.ts > 10 * 60_000) {
    const payload = await magaluReq('/seller/v1/portfolios/me');
    const channelId = String(payload?.channel?.id || '');
    if (!channelId) throw new Error('Magalu nao retornou channel.id em /seller/v1/portfolios/me.');
    magaluSellerInfoCache = { ts: agora, info: { channelId, tenantId: String(payload?.tenant?.id || "") } };
  }
  return magaluSellerInfoCache.info;
}

// GET /seller/v1/portfolios/me/warehouses — confirmado na doc oficial (Seller > Consultar CDs de
// estoque do seller). Usado como branch.id opcional no POST de estoque. Cacheado igual acima.
let magaluWarehouseCache: { ts: number; warehouseId: string | null } | null = null;
export async function getMagaluWarehouseId(): Promise<string | null> {
  const agora = Date.now();
  if (!magaluWarehouseCache || agora - magaluWarehouseCache.ts > 10 * 60_000) {
    const payload = await magaluReq('/seller/v1/portfolios/me/warehouses');
    const primeiro = (payload?.results || [])[0];
    magaluWarehouseCache = { ts: agora, warehouseId: primeiro?.id ? String(primeiro.id) : null };
  }
  return magaluWarehouseCache.warehouseId;
}

export type MagaluCreateSkuInput = {
  sku: string;
  title: string;
  description: string;
  brand: string;
  categoryId: string;
  weightKg: number;
  heightCm: number;
  lengthCm: number;
  widthCm: number;
  imageUrls: string[];
  ean?: string | null;
};

// POST /seller/v1/portfolios/skus — confirmado na doc oficial (Produtos > SKUs > Criar). So os
// campos que a doc marca como REQUIRED no schema. `condition: 'USED'` fixo (nosso negocio e' peca
// desmontada usada). `group` usa o proprio SKU como id com main_variation:true, ja que nao temos
// produtos com variacao (cor/tamanho) — cada peca e' um grupo de 1 item, ele mesmo (ver doc: group.id
// e group.main_variation sao obrigatorios, mas a doc nao explica o conceito de grupo em detalhe;
// essa e' a interpretacao mais direta pra produto sem variacao). `attributes`/`datasheet` ficam
// vazios por enquanto — sao especificos por categoria (ainda nao mapeada, ver pendencia de
// Categorias) e a API deve retornar erro claro se algum for obrigatorio pra essa categoria, igual
// fizemos com a Shopee (preferimos deixar a API apontar o que falta a adivinhar antecipadamente).
export async function magaluCreateSku(input: MagaluCreateSkuInput) {
  const { channelId } = await getMagaluSellerInfo();
  const payload = await magaluReq('/seller/v1/portfolios/skus', {
    method: 'POST',
    body: {
      active: true,
      attributes: [],
      brand: input.brand.slice(0, 100),
      category: { id: input.categoryId },
      channels: [{ id: channelId }],
      condition: 'USED',
      datasheet: [],
      description: input.description.slice(0, 7000),
      // A API exige no minimo 2 entradas (422 "List should have at least 2 items"): "package"
      // (embalagem) e "product" (produto), como no exemplo da doc. So temos 1 conjunto de medidas
      // por peca, entao enviamos o mesmo pras duas.
      dimensions: ['package', 'product'].map((name) => ({
        name,
        height: { unit: 'cm', value: Math.max(1, Math.round(input.heightCm)) },
        length: { unit: 'cm', value: Math.max(1, Math.round(input.lengthCm)) },
        width: { unit: 'cm', value: Math.max(1, Math.round(input.widthCm)) },
        weight: { unit: 'g', value: Math.max(1, Math.round(input.weightKg * 1000)) },
      })),
      extra_data: [],
      fulfillment: false,
      group: { id: input.sku.slice(0, 50), main_variation: true },
      has_ean: !!input.ean,
      identifiers: input.ean ? [{ type: 'ean', value: input.ean }] : [],
      images: input.imageUrls.map((url) => ({ reference: url, type: 'image/jpeg' })),
      perishable: false,
      podcasts: [],
      sku: input.sku.slice(0, 32),
      title: input.title.slice(0, 150),
      type: 'product',
      videos: [],
    },
  });
  // Resposta e' assincrona (202 + trace_id) — a doc nao devolve o SKU criado na hora. O proprio
  // `sku` que mandamos e' o identificador usado nas chamadas seguintes (preco/estoque/consulta).
  return { sku: input.sku, traceId: payload?.trace_id || null };
}

// A criacao de SKU e' assincrona (202 + trace_id): preco/estoque so funcionam depois que o SKU
// existe de fato do lado deles (antes disso respondem 404 "Resource Not Found"). Consulta
// GET /skus/:sku ate aparecer (404 = ainda processando) ou estourar o tempo.
// GET /v0/traces?code=<sku> — confirmado na doc (Traces > Consultar). Devolve o resultado das
// operacoes assincronas daquele codigo, com `message` e `severity` (info|warning|error|critical).
// Exige o escopo open:trace:read. Retorna null se o escopo nao estiver liberado.
export async function magaluTracesPorCodigo(code: string): Promise<Array<{ severity: string; message: string; reference: string; sent_at: string }> | null> {
  try {
    const data = await magaluReq(`/v0/traces?code=${encodeURIComponent(code)}&_limit=10`);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    return results.map((t) => ({ severity: String(t.severity || ''), message: String(t.message || ''), reference: String(t.reference || ''), sent_at: String(t.sent_at || t.created_at || '') }));
  } catch {
    return null;
  }
}

export async function magaluAguardarSku(sku: string, tentativas = 5, intervaloMs = 3000) {
  let ultimoErro = '';
  for (let i = 0; i < tentativas; i += 1) {
    try {
      return await magaluGetSku(sku);
    } catch (e: any) {
      ultimoErro = e?.message || String(e);
      if (!/\b404\b/.test(ultimoErro)) throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
  const traces = await magaluTracesPorCodigo(sku);
  const detalhe = traces === null
    ? 'nao foi possivel consultar os traces (escopo open:trace:read nao liberado)'
    : traces.length
      ? traces.map((t) => `[${t.severity}] ${t.message}`).join(' || ')
      : 'nenhum trace registrado ainda';
  throw new Error(`SKU ${sku} aceito pelo Magalu mas ainda nao confirmado apos ${Math.round((tentativas * intervaloMs) / 1000)}s. Traces: ${detalhe}. Tente novamente em instantes (a criacao e retomavel).`);
}

// POST /seller/v1/portfolios/prices/:sku — confirmado na doc oficial (Produtos > Precos > Criar).
// Valores em centavos (normalizer:100), moeda BRL (nao e' o default — a doc usa USD como default).
export async function magaluSetPrice(sku: string, precoReais: number) {
  const { channelId } = await getMagaluSellerInfo();
  const centavos = Math.max(0, Math.round(precoReais * 100));
  const body = { channel: { id: channelId }, currency: 'BRL', list_price: centavos, price: centavos, normalizer: 100 };
  const path = `/seller/v1/portfolios/prices/${encodeURIComponent(sku)}`;
  try {
    return await magaluReq(path, { method: 'POST', body });
  } catch (e: any) {
    // POST so cria: se o preco ja existe (409 PRICE_ALREADY_EXISTS) atualiza via PATCH (doc: Precos > Atualizar).
    if (/409|ALREADY_EXISTS/.test(String(e?.message))) return magaluReq(path, { method: 'PATCH', body });
    throw e;
  }
}

// POST /seller/v1/portfolios/stocks/:sku — confirmado na doc oficial (Produtos > Estoques > Criar).
// `branch` (CD) e opcional no schema — inclui se a conta tiver algum CD configurado. Se o estoque
// ja existe, atualiza via PATCH (mesmo corpo), igual ao preco.
export async function magaluSetStock(sku: string, quantidade: number) {
  const { channelId } = await getMagaluSellerInfo();
  const warehouseId = await getMagaluWarehouseId();
  const body = {
    channel: { id: channelId },
    ...(warehouseId ? { branch: { id: warehouseId } } : {}),
    quantity: Math.max(0, Math.round(quantidade)),
    type: 'AVAILABLE',
  };
  const path = `/seller/v1/portfolios/stocks/${encodeURIComponent(sku)}`;
  try {
    return await magaluReq(path, { method: 'POST', body });
  } catch (e: any) {
    if (/409|ALREADY_EXISTS/.test(String(e?.message))) return magaluReq(path, { method: 'PATCH', body });
    throw e;
  }
}

// PATCH /seller/v1/portfolios/skus/:sku — confirmado na doc oficial (Produtos > SKUs > Atualizar
// (parcial)). Usado pela aba Fotos Anuncios pra trocar so as fotos de um SKU ja criado — como o
// Magalu so aceita URL (nao upload binario), as fotos sao servidas pelo nosso proxy publico
// GET /magalu/imagem/:id (ver routes/magalu.ts).
export async function magaluUpdateSkuImages(sku: string, imageUrls: string[]) {
  return magaluReq(`/seller/v1/portfolios/skus/${encodeURIComponent(sku)}`, {
    method: 'PATCH',
    body: {
      images: imageUrls.map((url) => ({ reference: url, type: 'image/jpeg' })),
    },
  });
}

// GET /seller/v1/portfolios/skus/:sku — confirmado na doc oficial (Produtos > SKUs > Consultar pelo
// SKU). Usado pra saber quantas fotos o SKU ja tem antes de completar (mesmo padrao do
// shopeeGetItemBaseInfo).
export async function magaluGetSku(sku: string) {
  return magaluReq(`/seller/v1/portfolios/skus/${encodeURIComponent(sku)}`);
}

// GET /seller/v1/portfolios/skus/:sku/validation-info — confirmado na doc (SKUs > Consultar eventos de
// politicas de SKU). Exige o header X-Tenant-Id (vem de /me). Devolve `errors[]`: o que falta/foi
// reprovado pra o SKU sair de DRAFT e ser publicado.
export async function magaluValidacaoSku(sku: string) {
  const { tenantId } = await getMagaluSellerInfo();
  return magaluReq(`/seller/v1/portfolios/skus/${encodeURIComponent(sku)}/validation-info`, { headers: { "X-Tenant-Id": tenantId } });
}
