// Estoque dos anuncios ATIVOS na Shopee e no Magalu, pra auditoria automatica (Bling ERP > Auditoria Automatica).
// Foco: anuncio ativo com estoque la e sem estoque no nosso sistema (risco de venda sem peca). Anuncios bloqueados,
// excluidos, pausados ou em rascunho ficam de fora de proposito.
import { prisma } from './prisma';
import { getShopeeConfig, shopeeReq } from './shopee-api';
import { getMagaluConfig, magaluGetSku, magaluReq, getMagaluSellerInfo } from './magalu-api';

export type AnuncioEstoque = { ativo: boolean; estoque: number; status: string; itemId: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseSku = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');
const soma = (arr: any[], campo: string) => arr.reduce((acc, x) => acc + (Number(x?.[campo]) || 0), 0);

// ───────────── Shopee ─────────────
let shopeeCache: { expiraEm: number; mapa: Map<string, AnuncioEstoque> } | null = null;

function estoqueDoItemShopee(item: any): number | null {
  const v2 = item?.stock_info_v2;
  if (v2?.summary_info?.total_available_stock != null) return Number(v2.summary_info.total_available_stock) || 0;
  if (Array.isArray(v2?.seller_stock) && v2.seller_stock.length) return soma(v2.seller_stock, 'stock');
  if (Array.isArray(item?.stock_info) && item.stock_info.length) return soma(item.stock_info, 'current_stock');
  return null;
}

// Catalogo Shopee com status NORMAL (anuncios no ar). Devolve null se a loja nao esta conectada.
export async function buscarEstoqueShopee(): Promise<Map<string, AnuncioEstoque> | null> {
  if (shopeeCache && shopeeCache.expiraEm > Date.now()) return shopeeCache.mapa;
  const cfg = await getShopeeConfig();
  if (!cfg.accessToken || !cfg.shopId) return null;

  const ids: string[] = [];
  let offset = 0;
  for (let guarda = 0; guarda < 100; guarda += 1) {
    const r = await shopeeReq(`/api/v2/product/get_item_list?offset=${offset}&page_size=100&item_status=NORMAL`);
    const lista: any[] = r?.response?.item || [];
    for (const it of lista) if (it?.item_id != null) ids.push(String(it.item_id));
    if (!r?.response?.has_next_page) break;
    offset = Number(r?.response?.next_offset ?? offset + 100);
    await sleep(250);
  }

  const mapa = new Map<string, AnuncioEstoque>();
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const r = await shopeeReq(`/api/v2/product/get_item_base_info?item_id_list=${lote.join(',')}&need_tax_info=false&need_complaint_policy=false`);
    for (const item of (r?.response?.item_list || [])) {
      const sku = baseSku(item?.item_sku);
      if (!sku) continue;
      // anuncio com variacoes: o saldo vem por modelo (nao lido aqui) — ignora pra nao gerar alerta falso
      if (item?.has_model) continue;
      const estoque = estoqueDoItemShopee(item);
      if (estoque == null) continue;
      const anterior = mapa.get(sku);
      mapa.set(sku, { ativo: true, estoque: (anterior?.estoque || 0) + estoque, status: String(item?.item_status || 'NORMAL'), itemId: String(item?.item_id ?? '') || null });
    }
    await sleep(250);
  }
  shopeeCache = { expiraEm: Date.now() + 10 * 60 * 1000, mapa };
  return mapa;
}

// ───────────── Magalu ─────────────
// SKUs que nos criamos no Magalu (Peca.magaluItemId preenchido) — a API de listagem nao e usada, so esses sao conferidos.
export async function skusComAnuncioMagalu(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ idPeca: string }>>('SELECT "idPeca" FROM "Peca" WHERE "magaluItemId" IS NOT NULL');
  return new Set(rows.map((r) => baseSku(r.idPeca)).filter(Boolean));
}

function estoqueDoPayloadMagalu(p: any): number | null {
  const lista = Array.isArray(p) ? p : (p?.results || p?.items || p?.data || p?.stocks);
  if (Array.isArray(lista)) return lista.length ? lista.reduce((acc: number, x: any) => acc + (Number(x?.quantity ?? x?.available ?? x?.stock) || 0), 0) : 0;
  const unico = p?.quantity ?? p?.available ?? p?.stock;
  return unico != null ? Number(unico) || 0 : null;
}

const STATUS_MAGALU_NAO_ATIVO = /draft|rascunho|inativ|inactive|block|bloque|delet|exclu|reject|reprov|suspend|pause|pend|disable|desativ/i;

// Consulta o SKU (status) e o saldo no Magalu, um por vez. Devolve so os SKUs ativos que foi possivel ler.
export async function consultarEstoqueMagalu(skus: string[], pausaMs = 350): Promise<{ mapa: Map<string, AnuncioEstoque>; falhas: number; ultimoErro: string }> {
  const mapa = new Map<string, AnuncioEstoque>();
  let falhas = 0;
  let ultimoErro = '';
  const cfg = await getMagaluConfig();
  if (!cfg.accessToken) return { mapa, falhas: 0, ultimoErro: '' };
  for (const sku of skus) {
    try {
      const dados: any = await magaluGetSku(sku);
      const status = String(dados?.status || '');
      if (STATUS_MAGALU_NAO_ATIVO.test(status)) { await sleep(pausaMs); continue; }
      const { channelId } = await getMagaluSellerInfo();
      const bruto = await magaluReq(`/seller/v1/portfolios/stocks/${encodeURIComponent(sku)}?channel_id=${encodeURIComponent(channelId)}`);
      const estoque = estoqueDoPayloadMagalu(bruto);
      if (estoque == null) { falhas += 1; ultimoErro = `Saldo do SKU ${sku} em formato nao reconhecido`; }
      else mapa.set(sku, { ativo: true, estoque, status: status || 'ativo', itemId: sku });
    } catch (e: any) {
      if (/\b404\b/.test(String(e?.message))) { await sleep(pausaMs); continue; } // SKU nao existe no Magalu
      falhas += 1;
      ultimoErro = String(e?.message || e).slice(0, 200);
      if (/nao autorizado|401|403/i.test(ultimoErro)) break;
    }
    await sleep(pausaMs);
  }
  return { mapa, falhas, ultimoErro };
}
