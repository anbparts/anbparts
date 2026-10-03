import crypto from 'crypto';
import { prisma } from './prisma';

// Hosts confirmados na documentacao oficial (API reference > v2.media_space.upload_image, que
// lista os hosts por regiao/ambiente explicitamente) e validados ao vivo: o callback de
// autorizacao (GetAccessToken) via SHOPEE_API_HOST_SANDBOX ja funcionou de ponta a ponta com a
// loja de teste sandbox (shopId 227946191). Brasil usa host regional proprio em producao.
const SHOPEE_API_HOST_LIVE = process.env.SHOPEE_API_HOST_LIVE || 'https://openplatform.shopee.com.br';
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
// Separa o pathname (o que entra na assinatura) de uma eventual query string ja presente em
// `path` (ex: "/api/v2/product/get_item_base_info?item_id_list=123") — a assinatura usa so o
// pathname, e a query original precisa ser preservada (com "&", nao um segundo "?") na URL final.
function splitPath(path: string) {
  const idx = path.indexOf('?');
  return idx === -1 ? { pathname: path, query: '' } : { pathname: path.slice(0, idx), query: path.slice(idx + 1) };
}

function buildPublicUrl(environment: string, path: string) {
  const { pathname, query } = splitPath(path);
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(partnerKey, [partnerId, pathname, timestamp]);
  const host = getApiHost(environment);
  const authQuery = `partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`;
  return `${host}${pathname}?${query ? `${query}&` : ''}${authQuery}`;
}

// Assina e monta a URL pra uma "Shop API" (com access_token/shop_id no sign base string).
function buildShopUrl(environment: string, path: string, accessToken: string, shopId: string) {
  const { pathname, query } = splitPath(path);
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(partnerKey, [partnerId, pathname, timestamp, accessToken, shopId]);
  const host = getApiHost(environment);
  const authQuery = `partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&access_token=${accessToken}&shop_id=${shopId}`;
  return `${host}${pathname}?${query ? `${query}&` : ''}${authQuery}`;
}

// Diagnostico da conexao: chamada "Public API" assinada com partner_id/key do servidor
// (v2.public.get_shops_by_partner) contra o host do ambiente. Mostra qual partner_id/host estao em
// uso e se a Shopee aceita a assinatura — sem devolver a chave (so tamanho e prefixo).
export async function shopeeDiagnostico(environment: string) {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const url = buildPublicUrl(environment, '/api/v2/public/get_shops_by_partner?page_size=10&page_no=1');
  const response = await fetch(url);
  const payload: any = await response.json().catch(() => ({}));
  return {
    ambiente: environment,
    host: getApiHost(environment),
    partnerId,
    chave: { tamanho: partnerKey.length, prefixo: partnerKey.slice(0, 4) },
    http: response.status,
    resposta: payload,
  };
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

// POST /api/v2/media_space/upload_image — multipart/form-data (campo "image" = arquivo). Ate 10MB,
// JPG/JPEG/PNG. Retorna response.image_info.image_id (usado no update_item depois). Confirmado na
// doc oficial (v2.media_space.upload_image, Request Parameters).
export async function shopeeUploadImage(fileBuffer: Buffer, fileName: string) {
  let config = await getShopeeConfig();
  if (!config.accessToken || !config.shopId) throw new Error('Shopee nao autorizada. Conecte a loja em Configuracao.');

  const precisaRenovar = config.expiresAt ? new Date(config.expiresAt).getTime() < Date.now() + 60_000 : false;
  if (precisaRenovar) {
    await shopeeRefreshToken();
    config = await getShopeeConfig();
  }

  async function doUpload(accessToken: string) {
    const url = buildShopUrl(config.environment, '/api/v2/media_space/upload_image', accessToken, config.shopId);
    const form = new FormData();
    form.append('image', new Blob([fileBuffer]), fileName);
    return fetch(url, { method: 'POST', body: form as any });
  }

  let response = await doUpload(config.accessToken);
  let payload: any = await response.json().catch(() => ({}));

  if (payload?.error && /token/i.test(String(payload.error))) {
    const novoToken = await shopeeRefreshToken();
    response = await doUpload(novoToken);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || payload?.error || `Shopee ${response.status}`);
  }

  const imageId = payload?.response?.image_info?.image_id;
  if (!imageId) throw new Error('Shopee nao retornou image_id no upload.');
  return String(imageId);
}

// GET /api/v2/product/get_item_base_info — busca o item pra saber quantas fotos ja tem (mesmo
// padrao do buscarProdutoNuvemshopPorSku / mercadoLivreReq('/items/:id') em fotos-cadastro.ts).
export async function shopeeGetItemBaseInfo(itemId: string) {
  const payload = await shopeeReq(`/api/v2/product/get_item_base_info?item_id_list=${encodeURIComponent(itemId)}&need_tax_info=false&need_complaint_policy=false`);
  const item = payload?.response?.item_list?.[0];
  if (!item) throw new Error('Item nao encontrado na Shopee.');
  return item;
}

// POST /api/v2/product/update_item — usado aqui so pra anexar as novas fotos (image.image_id_list),
// reenviando tambem as que ja existiam pra nao perde-las (a API substitui a lista inteira).
export async function shopeeUpdateItemImages(itemId: string, imageIdList: string[]) {
  return shopeeReq('/api/v2/product/update_item', {
    method: 'POST',
    body: { item_id: Number(itemId), image: { image_id_list: imageIdList } },
  });
}

// GET /api/v2/logistics/get_channel_list — canais de logistica habilitados na loja. Precisamos de
// pelo menos 1 logistic_id valido pra criar qualquer anuncio (campo obrigatorio do add_item).
// Cacheado em memoria por processo (raramente muda) pra nao chamar isso a cada SKU da fila.
let canaisLogisticaCache: { ts: number; canais: any[] } | null = null;
export async function shopeeGetLogisticChannel(): Promise<{ logistic_id: number; nome: string }> {
  const agora = Date.now();
  if (!canaisLogisticaCache || agora - canaisLogisticaCache.ts > 10 * 60_000) {
    const payload = await shopeeReq('/api/v2/logistics/get_channel_list');
    const canais = payload?.response?.logistics_channel_list || payload?.response?.logistic_channel_list || [];
    canaisLogisticaCache = { ts: agora, canais };
  }
  const habilitado = canaisLogisticaCache.canais.find((c: any) => c.enabled && (c.logistics_channel_id || c.logistic_id));
  if (!habilitado) throw new Error('Nenhum canal de logistica habilitado encontrado na loja Shopee (get_channel_list).');
  const logisticId = Number(habilitado.logistics_channel_id || habilitado.logistic_id);
  return { logistic_id: logisticId, nome: String(habilitado.logistics_channel_name || habilitado.channel_name || logisticId) };
}

// GET /api/v2/product/get_brand_list — marcas validas pra uma categoria (algumas categorias exigem
// brand obrigatorio no add_item, ex: "Brand information required"). Prioridade: (1) a marca da moto
// do produto (Honda, Yamaha, BMW...), se ela existir na lista de marcas aceitas por essa categoria
// na Shopee; (2) a opcao generica "NoBrand" (brand_id 0), quando existir; (3) a primeira da lista.
// Nao cacheamos porque e' especifico por categoria (ao contrario do canal de logistica, que e' fixo
// pra loja inteira).
// Remove acentos/caixa pra comparacao "igual" (ex: "BMW" == "bmw"). Mantem espacos/hifen.
function normalizarNomeMarca(valor: any) {
  return String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Alem de normalizarNomeMarca, remove tudo que nao for letra/numero — pra igualar nomes compostos
// escritos diferente (ex: "Harley Davidson" no nosso sistema vs "Harley-Davidson" na Shopee).
function normalizarNomeMarcaEstrito(valor: any) {
  return normalizarNomeMarca(valor).replace(/[^a-z0-9]/g, '');
}

export async function shopeeGetBrandForCategory(categoryId: number, marcaMoto?: string | null): Promise<{ brand_id: number; original_brand_name: string } | null> {
  const payload = await shopeeReq(`/api/v2/product/get_brand_list?category_id=${categoryId}&status=1&offset=0&page_size=20`);
  const marcas = payload?.response?.brand_list || [];
  if (!marcas.length) return null;

  const marcaMotoEstrita = normalizarNomeMarcaEstrito(marcaMoto);
  // 1a tentativa: igual ignorando espaco/hifen/acento (cobre "Harley Davidson" vs "Harley-Davidson").
  let daMoto = marcaMotoEstrita
    ? marcas.find((m: any) => normalizarNomeMarcaEstrito(m.original_brand_name) === marcaMotoEstrita || normalizarNomeMarcaEstrito(m.display_brand_name) === marcaMotoEstrita)
    : null;
  // 2a tentativa: um nome "contem" o outro (cobre coisas como so "Harley" vs "Harley Davidson").
  if (!daMoto && marcaMotoEstrita) {
    daMoto = marcas.find((m: any) => {
      const nomeOriginal = normalizarNomeMarcaEstrito(m.original_brand_name);
      const nomeExibicao = normalizarNomeMarcaEstrito(m.display_brand_name);
      return (nomeOriginal && (nomeOriginal.includes(marcaMotoEstrita) || marcaMotoEstrita.includes(nomeOriginal)))
        || (nomeExibicao && (nomeExibicao.includes(marcaMotoEstrita) || marcaMotoEstrita.includes(nomeExibicao)));
    });
  }
  const semMarca = marcas.find((m: any) => Number(m.brand_id) === 0);
  const escolhida = daMoto || semMarca || marcas[0];
  return { brand_id: Number(escolhida.brand_id), original_brand_name: String(escolhida.original_brand_name || 'NoBrand') };
}

export type ShopeeAddItemInput = {
  itemName: string;
  description: string;
  price: number;
  weightKg: number;
  packageHeightCm: number;
  packageLengthCm: number;
  packageWidthCm: number;
  categoryId: number;
  imageIdList: string[];
  itemSku: string;
  stock: number;
  logisticId: number;
  marcaMoto?: string | null;
};

// POST /api/v2/product/add_item — cria o anuncio. So os campos que a doc oficial confirma como
// obrigatorios (original_price, description, weight, item_name, logistic_info[], category_id,
// image.image_id_list; condition = obrigatorio no Brasil). Categorias especificas podem exigir
// attribute_list/compatibility_info alem disso — nesses casos a Shopee retorna um erro claro
// (error_invalid_category_attribute etc.) que a gente repassa pro usuario, em vez de tentar
// adivinhar de antemao quais atributos cada uma das ~90 categorias exige.
export async function shopeeAddItem(input: ShopeeAddItemInput) {
  const brand = await shopeeGetBrandForCategory(input.categoryId, input.marcaMoto);
  const payload = await shopeeReq('/api/v2/product/add_item', {
    method: 'POST',
    body: {
      original_price: input.price,
      description: input.description,
      weight: input.weightKg,
      item_name: input.itemName,
      dimension: {
        package_height: Math.max(1, Math.round(input.packageHeightCm)),
        package_length: Math.max(1, Math.round(input.packageLengthCm)),
        package_width: Math.max(1, Math.round(input.packageWidthCm)),
      },
      logistic_info: [{ logistic_id: input.logisticId, enabled: true }],
      category_id: input.categoryId,
      image: { image_id_list: input.imageIdList },
      item_sku: input.itemSku,
      condition: 'USED',
      seller_stock: [{ stock: Math.max(1, Math.round(input.stock)) }],
      ...(brand ? { brand: { brand_id: brand.brand_id, original_brand_name: brand.original_brand_name } } : {}),
    },
  });
  const itemId = payload?.response?.item_id;
  if (!itemId) throw new Error('Shopee nao retornou item_id na criacao do anuncio.');
  return { itemId: String(itemId), raw: payload?.response };
}
