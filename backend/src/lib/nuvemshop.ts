import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type NuvemshopAnuncioStatus = {
  encontrado: boolean;
  publicado: boolean;   // true = ativo na loja
  estoqueNuvemshop?: number; // soma do estoque das variantes na Nuvemshop
  productId?: number;
  sku?: string;
  nome?: string;
  erro?: string;
};

let _credentialsCache: { accessToken: string; storeId: string; expiresAt: number } | null = null;

async function getCredentials(): Promise<{ accessToken: string; storeId: string } | null> {
  const now = Date.now();
  if (_credentialsCache && _credentialsCache.expiresAt > now) {
    return { accessToken: _credentialsCache.accessToken, storeId: _credentialsCache.storeId };
  }

  const cfg = await prisma.configuracaoGeral.findFirst();
  const accessToken = cfg?.nuvemshopAccessToken || '';
  const storeId = cfg?.nuvemshopStoreId || '';

  if (!accessToken || !storeId) return null;

  _credentialsCache = { accessToken, storeId, expiresAt: now + 60_000 }; // cache 1 min
  return { accessToken, storeId };
}

export function clearNuvemshopCredentialsCache() {
  _credentialsCache = null;
}

async function nuvemshopReq<T = unknown>(path: string, accessToken: string, storeId: string): Promise<T> {
  const url = `https://api.nuvemshop.com.br/v1/${storeId}${path}`;
  const resp = await fetch(url, {
    headers: {
      'Authentication': `bearer ${accessToken}`,
      'User-Agent': 'ANB Parts (contato@anbparts.com.br)',
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Nuvemshop API ${resp.status}: ${text.slice(0, 200)}`);
  }

  return (await resp.json()) as T;
}

// Cache do catálogo completo da Nuvemshop (evita 995 chamadas individuais)
let _catalogCache: { map: Map<string, NuvemshopAnuncioStatus>; expiresAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * Busca TODOS os produtos da Nuvemshop paginado e monta um Map<sku, status>.
 * Muito mais eficiente que consultar SKU por SKU — evita rate limit.
 */
export async function buildNuvemshopCatalogMap(): Promise<Map<string, NuvemshopAnuncioStatus>> {
  const now = Date.now();
  if (_catalogCache && _catalogCache.expiresAt > now) return _catalogCache.map;

  const creds = await getCredentials();
  if (!creds) return new Map();

  const { accessToken, storeId } = creds;
  const map = new Map<string, NuvemshopAnuncioStatus>();

  let page = 1;
  const perPage = 200;

  while (true) {
    const data = await nuvemshopReq<any[]>(
      `/products?page=${page}&per_page=${perPage}&fields=id,name,published,variants`,
      accessToken,
      storeId,
    );

    if (!Array.isArray(data) || data.length === 0) break;

    for (const produto of data) {
      const publicado = produto.published === true;
      const variants: any[] = Array.isArray(produto.variants) ? produto.variants : [];
      const estoqueTotal = variants.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);
      const nome = typeof produto.name === 'object'
        ? (produto.name.pt || produto.name.en || '')
        : String(produto.name || '');

      for (const v of variants) {
        const sku = String(v.sku || '').trim();
        if (!sku) continue;
        map.set(sku.toUpperCase(), {
          encontrado: true,
          publicado,
          estoqueNuvemshop: estoqueTotal,
          productId: produto.id,
          nome,
          sku,
        });
      }
    }

    if (data.length < perPage) break;
    page++;
    await new Promise(r => setTimeout(r, 300)); // respeitar rate limit
  }

  _catalogCache = { map, expiresAt: now + CATALOG_CACHE_TTL_MS };
  return map;
}

export function clearNuvemshopCatalogCache() {
  _catalogCache = null;
}

/**
 * Consulta o status de um anúncio na Nuvemshop por SKU.
 * Usa o catálogo paginado em cache — não faz chamada individual por SKU.
 */
export async function getNuvemshopStatusBySku(sku: string): Promise<NuvemshopAnuncioStatus> {
  try {
    const map = await buildNuvemshopCatalogMap();
    const status = map.get(sku.trim().toUpperCase());
    return status || { encontrado: false, publicado: false };
  } catch (e: any) {
    return { encontrado: false, publicado: false, erro: String(e?.message || e) };
  }
}

/**
 * Consulta em lote os status de múltiplos SKUs na Nuvemshop.
 * Retorna um Map<sku, NuvemshopAnuncioStatus>
 */
export async function getNuvemshopStatusBySkus(
  skus: string[],
  pauseMs = 200,
): Promise<Map<string, NuvemshopAnuncioStatus>> {
  const result = new Map<string, NuvemshopAnuncioStatus>();

  for (const sku of skus) {
    result.set(sku, await getNuvemshopStatusBySku(sku));
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }

  return result;
}
