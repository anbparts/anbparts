import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type NuvemshopAnuncioStatus = {
  encontrado: boolean;
  publicado: boolean;   // true = ativo na loja
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

async function nuvemshopReq(path: string, accessToken: string, storeId: string) {
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

  return resp.json();
}

/**
 * Consulta o status de um anúncio na Nuvemshop por SKU.
 * A Nuvemshop armazena SKU nas variantes do produto.
 * Endpoint: GET /products?sku={sku}
 */
export async function getNuvemshopStatusBySku(sku: string): Promise<NuvemshopAnuncioStatus> {
  try {
    const creds = await getCredentials();
    if (!creds) {
      return { encontrado: false, publicado: false, erro: 'Credenciais Nuvemshop nao configuradas' };
    }

    const { accessToken, storeId } = creds;

    // Busca produto por SKU via variantes
    const data: any[] = await nuvemshopReq(
      `/products?sku=${encodeURIComponent(sku)}&fields=id,name,published,variants`,
      accessToken,
      storeId,
    );

    if (!Array.isArray(data) || data.length === 0) {
      return { encontrado: false, publicado: false };
    }

    const produto = data[0];
    const publicado = produto.published === true;

    return {
      encontrado: true,
      publicado,
      productId: produto.id,
      nome: typeof produto.name === 'object' ? (produto.name.pt || produto.name.en || '') : String(produto.name || ''),
      sku,
    };
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
