import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const blingRouter = Router();

const BLING_API = 'https://www.bling.com.br/Api/v3';
const BLING_OAUTH = 'https://www.bling.com.br/Api/v3/oauth/token';
const DEFAULT_FRETE_PADRAO = 29.9;
const DEFAULT_TAXA_PADRAO_PCT = 17;
const STATUS_ID_CONCLUIDO = 9;
const STATUS_IDS_CANCELADO = new Set([12]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: any, fallback = 0) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    const normalized = trimmed.includes(',') && trimmed.includes('.')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed.replace(',', '.');
    const parsedString = Number(normalized);
    return Number.isFinite(parsedString) ? parsedString : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function splitEvenly(total: number, parts: number) {
  if (parts <= 0) return [];

  const normalizedTotal = roundMoney(total);
  const base = roundMoney(normalizedTotal / parts);
  const values = Array.from({ length: parts }, () => base);
  let allocated = roundMoney(values.reduce((sum, value) => sum + value, 0));
  let diff = roundMoney(normalizedTotal - allocated);
  let index = parts - 1;

  while (Math.abs(diff) >= 0.01 && index >= 0) {
    values[index] = roundMoney(values[index] + diff);
    allocated = roundMoney(values.reduce((sum, value) => sum + value, 0));
    diff = roundMoney(normalizedTotal - allocated);
    index -= 1;
  }

  return values;
}

function distributeProportionally(total: number, weights: number[]) {
  if (!weights.length) return [];

  const normalizedTotal = roundMoney(total);
  const safeWeights = weights.map((weight) => Math.max(0, roundMoney(weight)));
  const totalWeight = roundMoney(safeWeights.reduce((sum, weight) => sum + weight, 0));

  if (totalWeight <= 0) return splitEvenly(normalizedTotal, safeWeights.length);

  const values = safeWeights.map((weight) => roundMoney(normalizedTotal * (weight / totalWeight)));
  let allocated = roundMoney(values.reduce((sum, value) => sum + value, 0));
  let diff = roundMoney(normalizedTotal - allocated);
  let index = values.length - 1;

  while (Math.abs(diff) >= 0.01 && index >= 0) {
    values[index] = roundMoney(values[index] + diff);
    allocated = roundMoney(values.reduce((sum, value) => sum + value, 0));
    diff = roundMoney(normalizedTotal - allocated);
    index -= 1;
  }

  return values;
}

function calculateFinancials(precoML: number, frete: number, taxaPct: number) {
  const taxaValor = roundMoney(precoML * taxaPct / 100);
  const valorLiq = roundMoney(precoML - frete - taxaValor);
  return { taxaValor, valorLiq };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractSituationText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(extractSituationText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    const preferred = ['nome', 'descricao', 'situacao', 'label', 'value', 'descricaoSituacao'];
    const parts: string[] = [];

    for (const key of preferred) {
      if (key in value) {
        const text = extractSituationText(value[key]);
        if (text) parts.push(text);
      }
    }

    for (const nested of Object.values(value)) {
      const text = extractSituationText(nested);
      if (text) parts.push(text);
    }

    return Array.from(new Set(parts)).join(' ');
  }
  return '';
}

function extractSearchableText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(extractSearchableText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nested]) => `${key} ${extractSearchableText(nested)}`.trim())
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function hasMercadoLivreMarker(text: string) {
  const raw = String(text || '');
  const normalized = normalizeText(raw);
  return /mercado livre|mercadolivre|mlb\d+/i.test(raw) || /mercado livre|mercadolivre|mlb\d+/.test(normalized);
}

function extractSituationIds(value: any, acc: number[] = []): number[] {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item) => extractSituationIds(item, acc));
    return acc;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if ((key === 'id' || key === 'valor' || key === 'codigo') && typeof nested === 'number') {
        acc.push(nested);
      }
      extractSituationIds(nested, acc);
    }
  }
  return acc;
}

function collectFreightValues(value: any, acc: number[] = []): number[] {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item) => collectFreightValues(item, acc));
    return acc;
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (/frete/i.test(key)) {
        const freightValue = toNumber(nested, NaN);
        if (Number.isFinite(freightValue) && Math.abs(freightValue) > 0) {
          acc.push(freightValue);
        }
      }
      collectFreightValues(nested, acc);
    }
  }

  return acc;
}

function resolvePedidoFrete(pedido: any) {
  const freightCandidates = [
    ...collectFreightValues(pedido?.transportador),
    ...collectFreightValues(pedido?.transportadora),
    ...collectFreightValues(pedido?.transporte?.transportador),
    ...collectFreightValues(pedido?.transporte),
  ]
    .map((value) => roundMoney(Math.abs(toNumber(value, 0))))
    .filter((value) => value > 0);

  const transportadorFrete = freightCandidates.sort((a, b) => b - a)[0] || 0;
  const custoFrete = roundMoney(Math.abs(toNumber(pedido?.taxas?.custoFrete, 0)));

  if (transportadorFrete > 0) return transportadorFrete;
  if (custoFrete > 0) return custoFrete;
  return roundMoney(Math.abs(toNumber(pedido?.transporte?.frete, 0)));
}

function classifyOrderSituation(detail: any) {
  const source = detail?.situacao ?? detail?.situacaoPedido ?? detail?.situacoes ?? {};
  const rawText = extractSituationText(source)
    || extractSituationText(detail?.situacao)
    || extractSituationText(detail?.situacaoPedido)
    || extractSituationText(detail?.situacoes);
  const normalized = normalizeText(rawText);
  const ids = extractSituationIds(source);

  const isCancelado = ids.some((id) => STATUS_IDS_CANCELADO.has(id))
    || /cancel|anulad|reembols|estorn/.test(normalized);
  const isConcluido = ids.includes(STATUS_ID_CONCLUIDO)
    || /atendid|concluid|finaliz|faturad|entregue/.test(normalized);

  return {
    label: rawText || 'Sem situacao',
    isCancelado,
    isConcluido,
  };
}

function getProdutoDefaults(cfg: any) {
  return {
    fretePadrao: roundMoney(toNumber(cfg?.fretePadrao, DEFAULT_FRETE_PADRAO)),
    taxaPadraoPct: roundMoney(toNumber(cfg?.taxaPadraoPct, DEFAULT_TAXA_PADRAO_PCT)),
  };
}

async function getConfig(): Promise<any> {
  let cfg = await prisma.blingConfig.findFirst();
  if (!cfg) cfg = await prisma.blingConfig.create({ data: {} });

  return {
    ...cfg,
    prefixos: Array.isArray(cfg.prefixos) ? (cfg.prefixos as any[]) : [],
    ...getProdutoDefaults(cfg),
  };
}

async function saveConfig(data: any) {
  const cfg = await prisma.blingConfig.findFirst();
  if (cfg) {
    await prisma.blingConfig.update({ where: { id: cfg.id }, data });
  } else {
    await prisma.blingConfig.create({ data });
  }
}

async function blingReq(pathUrl: string, options: any = {}, retries = 3): Promise<any> {
  const cfg = await getConfig();
  let token = cfg.accessToken;

  const doReq = (currentToken: string) => fetch(`${BLING_API}${pathUrl}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let resp = await doReq(token);

  if (resp.status === 401 && cfg.refreshToken) {
    token = await refreshAccessToken();
    resp = await doReq(token);
  }

  if (resp.status === 429 && retries > 0) {
    await sleep(2000);
    return blingReq(pathUrl, options, retries - 1);
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Bling API ${resp.status}: ${err.slice(0, 200)}`);
  }

  return resp.json();
}

async function refreshAccessToken() {
  const cfg = await getConfig();
  if (!cfg.refreshToken) throw new Error('Sem refresh token. Reconecte o Bling.');

  const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const resp = await fetch(BLING_OAUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
    }).toString(),
  });

  if (!resp.ok) throw new Error('Falha ao renovar token. Reconecte o Bling.');

  const data = await resp.json() as any;
  await saveConfig({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return data.access_token;
}

function resolverMotoId(sku: string, prefixos: any[]): number | null {
  if (!sku || !prefixos.length) return null;
  const normalizedSku = sku.toUpperCase();
  const ordered = [...prefixos].sort((a, b) => String(b.prefixo).length - String(a.prefixo).length);

  for (const { prefixo, motoId } of ordered) {
    if (normalizedSku.startsWith(String(prefixo).toUpperCase())) return Number(motoId);
  }

  return null;
}

function getBaseSku(value: any) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-\d+$/, '');
}

function parseDateStart(date: string) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function parseDateEnd(date: string) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
}

function parseSkuList(value: any) {
  const raw = Array.isArray(value) ? value.join('\n') : String(value || '');
  const codes = raw
    .split(/[\n,;\t\r ]+/)
    .map((item) => getBaseSku(item))
    .filter(Boolean);

  return Array.from(new Set(codes));
}

function matchesSku(idPeca: string, codigo: string) {
  return getBaseSku(idPeca) === getBaseSku(codigo);
}

function findLinkedPecasByPedido(
  allPecas: any[],
  pedidoId: number | string,
  pedidoNum: string,
  skuBling: string,
  idBling: string,
  reservedIds: Set<number> = new Set<number>(),
) {
  const codigos = [skuBling, idBling].filter(Boolean);
  const candidates = allPecas.filter((peca) => {
    const samePedido = (pedidoId && String(peca.blingPedidoId || '') === String(pedidoId))
      || (pedidoNum && String(peca.blingPedidoNum || '') === String(pedidoNum));

    if (!samePedido || reservedIds.has(peca.id)) return false;
    if (!codigos.length) return true;

    return codigos.some((codigo) => matchesSku(peca.idPeca, codigo));
  });

  return candidates.sort((a, b) => {
    const soldA = !a.disponivel && !a.emPrejuizo ? 1 : 0;
    const soldB = !b.disponivel && !b.emPrejuizo ? 1 : 0;
    if (soldA !== soldB) return soldB - soldA;

    const diff = new Date(b.dataVenda || 0).getTime() - new Date(a.dataVenda || 0).getTime();
    return diff || b.id - a.id;
  });
}

function findSkuReferencePeca(allPecas: any[], skuBling: string, idBling: string) {
  const codigos = [skuBling, idBling].filter(Boolean);
  if (!codigos.length) return null;

  const candidates = allPecas.filter((peca) =>
    codigos.some((codigo) => matchesSku(peca.idPeca, codigo)),
  );

  return candidates.sort((a, b) => a.id - b.id)[0] || null;
}

function findAvailablePecaForVenda(
  allPecas: any[],
  skuBling: string,
  idBling: string,
  reservedIds: Set<number>,
) {
  const codigos = [skuBling, idBling].filter(Boolean);
  if (!codigos.length) return null;

  const candidates = allPecas
    .filter((peca) =>
      peca.disponivel
      && !peca.emPrejuizo
      && !reservedIds.has(peca.id)
      && codigos.some((codigo) => matchesSku(peca.idPeca, codigo)),
    )
    .sort((a, b) => a.id - b.id);

  return candidates[0] || null;
}

function findAvailablePecasForVenda(
  allPecas: any[],
  skuBling: string,
  idBling: string,
  reservedIds: Set<number>,
  quantidade: number,
) {
  const selected: any[] = [];
  const quantidadeDesejada = Math.max(0, Number(quantidade) || 0);

  for (let i = 0; i < quantidadeDesejada; i += 1) {
    const peca = findAvailablePecaForVenda(allPecas, skuBling, idBling, reservedIds);
    if (!peca) break;
    reservedIds.add(peca.id);
    selected.push(peca);
  }

  return selected;
}

async function listPedidos(dataInicio?: string, dataFim?: string, situacoes?: number[]) {
  const pedidosMap = new Map<number, { id: number; situacao: ReturnType<typeof classifyOrderSituation> }>();
  let pagina = 1;

  while (true) {
    let url = `/pedidos/vendas?pagina=${pagina}&limite=100`;
    if (dataInicio) url += `&dataInicial=${dataInicio}`;
    if (dataFim) url += `&dataFinal=${dataFim}`;
    if (situacoes?.length) {
      for (const situacao of situacoes) {
        url += `&situacoes[]=${situacao}`;
      }
    }

    const data = await blingReq(url) as any;
    const pedidos = data?.data || [];
    if (!pedidos.length) break;

    for (const pedido of pedidos) {
      const id = Number(pedido?.id);
      if (id) {
        pedidosMap.set(id, {
          id,
          situacao: classifyOrderSituation(pedido),
        });
      }
    }

    if (pedidos.length < 100) break;
    pagina += 1;
    await sleep(300);
  }

  return Array.from(pedidosMap.values());
}

async function findBlingProductsByCodes(codes: string[]) {
  const targetCodes = new Set(codes.map((code) => getBaseSku(code)));
  const found = new Map<string, any>();
  let pagina = 1;

  while (targetCodes.size > 0) {
    const data = await blingReq(`/produtos?pagina=${pagina}&limite=100&criterio=2`) as any;
    const produtos = data?.data || [];
    if (!produtos.length) break;

    for (const produto of produtos) {
      const code = getBaseSku(produto?.codigo);
      if (!code || !targetCodes.has(code) || found.has(code)) continue;

      found.set(code, produto);
      targetCodes.delete(code);
    }

    if (produtos.length < 100) break;
    pagina += 1;
    await sleep(250);
  }

  return found;
}

async function findBlingProductDetailsByIds(ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
  const details = new Map<number, any>();

  for (const id of uniqueIds) {
    try {
      const data = await blingReq(`/produtos/${id}`) as any;
      details.set(id, data?.data || null);
    } catch {
      details.set(id, null);
    }

    await sleep(400);
  }

  return details;
}

function normalizeApiArray(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === 'object') return [data];
  return [];
}

function parseAnuncioStatus(value: any) {
  const code = Number(value);
  if (!Number.isFinite(code)) return null;

  if (code === 1) return { code, label: 'Publicado', isActive: true };
  if (code === 2) return { code, label: 'Rascunho', isActive: false };
  if (code === 3) return { code, label: 'Com problema', isActive: false };
  if (code === 4) return { code, label: 'Pausado', isActive: false };

  return { code, label: String(value), isActive: false };
}

async function findProdutoLojaIdsByProductIds(ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
  const links = new Map<number, number[]>();

  for (const productId of uniqueIds) {
    try {
      const data = await blingReq(`/produtos/lojas?pagina=1&limite=100&idProduto=${productId}`) as any;
      const rows = normalizeApiArray(data?.data);
      const lojaIds = Array.from(new Set(
        rows
          .map((row: any) => Number(row?.loja?.id || row?.idLoja || 0))
          .filter(Boolean),
      ));
      links.set(productId, lojaIds);
    } catch {
      links.set(productId, []);
    }

    await sleep(120);
  }

  return links;
}

async function findMercadoLivreStatusByProductIds(ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
  const productStoreIds = await findProdutoLojaIdsByProductIds(uniqueIds);
  const statuses = new Map<number, {
    found: boolean;
    label: string | null;
    isActive: boolean;
    code: number | null;
    anuncioIds: number[];
    lojaIds: number[];
  }>();

  for (const productId of uniqueIds) {
    const lojaIds = productStoreIds.get(productId) || [];
    const collected: Array<{ code: number; label: string; isActive: boolean; anuncioId: number | null; lojaId: number }> = [];

    for (const lojaId of lojaIds) {
      try {
        const data = await blingReq(`/anuncios?pagina=1&limite=100&idProduto=${productId}&tipoIntegracao=MercadoLivre&idLoja=${lojaId}`) as any;
        const anuncios = normalizeApiArray(data?.data);

        for (const anuncio of anuncios) {
          const parsed = parseAnuncioStatus(anuncio?.situacao ?? anuncio?.status);
          if (!parsed) continue;

          collected.push({
            ...parsed,
            anuncioId: Number(anuncio?.id) || null,
            lojaId,
          });
        }
      } catch {
        // Ignora lojas que nao tenham anuncios do Mercado Livre para esse produto.
      }

      await sleep(120);
    }

    const prioritized = collected.find((item) => !item.isActive) || collected.find((item) => item.isActive) || null;

    statuses.set(productId, prioritized
      ? {
          found: true,
          label: prioritized.label,
          isActive: prioritized.isActive,
          code: prioritized.code,
          anuncioIds: Array.from(new Set(collected.map((item) => item.anuncioId).filter(Boolean))) as number[],
          lojaIds: Array.from(new Set(collected.map((item) => item.lojaId))),
        }
      : {
          found: false,
          label: null,
          isActive: false,
          code: null,
          anuncioIds: [],
          lojaIds,
        });
  }

  return statuses;
}

function classifyMarketplaceStatusText(text: string) {
  const label = String(text || '').trim();
  const normalized = normalizeText(label);
  const upper = label.toUpperCase();

  if (!label) {
    return { label: null, normalized: '', kind: 'unknown' as const };
  }

  if (upper === 'A' || upper === 'ATIVO' || upper === 'PUBLICADO') {
    return { label, normalized, kind: 'active' as const };
  }

  if (['P', 'PAUSADO', 'INATIVO', 'FINALIZADO', 'ENCERRADO', 'CANCELADO', 'RASCUNHO', 'BLOQUEADO', 'SUSPENSO'].includes(upper)) {
    return { label, normalized, kind: 'inactive' as const };
  }

  if (/inativ|pausad|finaliz|encerrad|cancel|exclu|rascunh|reprov|bloque|suspens|erro/.test(normalized)) {
    return { label, normalized, kind: 'inactive' as const };
  }

  if (/(^|[^a-z])(ativo|publicado|publicada|anuncio ativo|anuncio publicado)([^a-z]|$)/.test(normalized)) {
    return { label, normalized, kind: 'active' as const };
  }

  return { label, normalized, kind: 'unknown' as const };
}

function inferMarketplaceStatusFromText(text: string) {
  const label = String(text || '').trim();
  const normalized = normalizeText(label);
  const hasMlContext = hasMercadoLivreMarker(label);

  if (!hasMlContext) {
    return {
      label: null,
      normalized,
      isActive: false,
      found: false,
    };
  }

  if (/pausad|inativ|finaliz|encerrad|cancel|exclu|rascunh|reprov|bloque|suspens|desativ/.test(normalized)) {
    return {
      label,
      normalized,
      isActive: false,
      found: true,
    };
  }

  if (/(^|[^a-z])(ativo|publicado|publicada|anuncio ativo|anuncio publicado)([^a-z]|$)/.test(normalized) || /\bA\b/.test(label)) {
    return {
      label,
      normalized,
      isActive: true,
      found: true,
    };
  }

  return {
    label: null,
    normalized,
    isActive: false,
    found: false,
  };
}

function collectMercadoLivreTexts(value: any, acc: string[] = [], inMlContext = false) {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item) => collectMercadoLivreTexts(item, acc, inMlContext));
    return acc;
  }
  if (typeof value !== 'object') return acc;

  const entriesText = extractSearchableText(value);
  const currentMlContext = inMlContext || hasMercadoLivreMarker(entriesText);

  if (currentMlContext) {
    const candidates = [
      extractSituationText((value as any).situacao),
      extractSituationText((value as any).status),
      extractSituationText((value as any).descricaoSituacao),
      extractSituationText((value as any).situacaoMarketplace),
      extractSituationText((value as any).statusMarketplace),
      extractSituationText((value as any).statusIntegracao),
      extractSituationText((value as any).situacaoAnuncio),
      extractSituationText((value as any).statusAnuncio),
      extractSituationText((value as any).anuncio),
      extractSituationText((value as any).anuncios),
      extractSituationText((value as any).vinculo),
      extractSituationText((value as any).vinculos),
      extractSituationText((value as any).marketplace),
      extractSituationText((value as any).canalVenda),
      extractSituationText((value as any).loja),
      extractSituationText((value as any).lojaVirtual),
      extractSituationText((value as any).codigoIntegracao),
      extractSituationText((value as any).idIntegracao),
      extractSituationText(value),
      extractSearchableText(value),
    ]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    acc.push(...candidates);
  }

  Object.values(value).forEach((nested) => collectMercadoLivreTexts(nested, acc, currentMlContext));
  return acc;
}

function collectMercadoLivreDebugSections(value: any, path = 'root', acc: Array<{ path: string; text: string }> = []) {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMercadoLivreDebugSections(item, `${path}[${index}]`, acc));
    return acc;
  }
  if (typeof value !== 'object') return acc;

  const entriesText = extractSearchableText(value).trim();
  if (entriesText && hasMercadoLivreMarker(entriesText)) {
    acc.push({
      path,
      text: entriesText.slice(0, 1200),
    });
  }

  for (const [key, nested] of Object.entries(value)) {
    collectMercadoLivreDebugSections(nested, `${path}.${key}`, acc);
  }

  return acc;
}

function resolveMercadoLivreStatus(produtoDetalhe: any) {
  const candidates = Array.from(new Set(
    collectMercadoLivreTexts(produtoDetalhe)
      .map((text) => String(text || '').trim())
      .filter(Boolean),
  ));

  let fallbackActiveCandidate: { label: string; normalized: string; isActive: boolean; found: boolean } | null = null;

  for (const candidate of candidates) {
    const classified = classifyMarketplaceStatusText(candidate);
    if (classified.kind === 'inactive') {
      return {
        label: classified.label,
        normalized: classified.normalized,
        isActive: false,
        found: true,
      };
    }

    if (classified.kind === 'active' && !fallbackActiveCandidate) {
      fallbackActiveCandidate = {
        label: classified.label,
        normalized: classified.normalized,
        isActive: true,
        found: true,
      };
    }
  }

  if (fallbackActiveCandidate) {
    return fallbackActiveCandidate;
  }

  const flattenedText = extractSearchableText(produtoDetalhe);
  const inferredFromFlat = inferMarketplaceStatusFromText(flattenedText);
  if (inferredFromFlat.found) {
    return inferredFromFlat;
  }

  if (candidates.length) {
    return {
      label: candidates[0],
      normalized: normalizeText(candidates[0]),
      isActive: false,
      found: true,
    };
  }

  return {
    label: null,
    normalized: '',
    isActive: false,
    found: false,
  };
}

blingRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      clientId: cfg.clientId || '',
      clientSecret: cfg.clientSecret ? '********' : '',
      hasTokens: !!cfg.accessToken,
      connectedAt: cfg.connectedAt || null,
      prefixos: cfg.prefixos || [],
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/config', async (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body;
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'clientId e clientSecret sao obrigatorios' });
    }

    await saveConfig({
      clientId,
      clientSecret,
      accessToken: '',
      refreshToken: '',
      connectedAt: null,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/config-produtos', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      prefixos: cfg.prefixos || [],
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/config-produtos', async (req, res, next) => {
  try {
    const prefixos = Array.isArray(req.body?.prefixos) ? req.body.prefixos : [];
    const fretePadrao = roundMoney(Math.max(0, toNumber(req.body?.fretePadrao, DEFAULT_FRETE_PADRAO)));
    const taxaPadraoPct = roundMoney(Math.max(0, toNumber(req.body?.taxaPadraoPct, DEFAULT_TAXA_PADRAO_PCT)));

    await saveConfig({
      prefixos,
      fretePadrao,
      taxaPadraoPct,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/auth-url', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    if (!cfg.clientId) return res.status(400).json({ error: 'Configure o Client ID primeiro' });

    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;

    const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${cfg.clientId}&state=anbparts&redirect_uri=${encodeURIComponent(redirect)}`;
    res.json({ url });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/callback', async (req, res, next) => {
  try {
    const { code } = req.query as any;
    if (!code) return res.status(400).send('Code nao recebido');

    const cfg = await getConfig();
    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;
    const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

    const resp = await fetch(BLING_OAUTH, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
      }).toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(400).send(`Erro: ${err}`);
    }

    const data = await resp.json() as any;
    await saveConfig({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      connectedAt: new Date(),
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/bling?connected=true`);
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/status', async (_req, res) => {
  try {
    await blingReq('/situacoes/modulos');
    res.json({ ok: true, empresa: 'Conectado' });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

blingRouter.delete('/disconnect', async (_req, res, next) => {
  try {
    await saveConfig({ accessToken: '', refreshToken: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/prefixos', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.prefixos || []);
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/prefixos', async (req, res, next) => {
  try {
    const { prefixos } = req.body;
    await saveConfig({ prefixos: Array.isArray(prefixos) ? prefixos : [] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/sync/produtos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const prefixos = cfg.prefixos || [];
    const { motoIdFallback, dataInicio, dataFim } = req.body;

    const existentes = await prisma.peca.findMany({ select: { idPeca: true } });
    const skusExistentes = new Set(existentes.map((peca) => peca.idPeca));

    let pagina = 1;
    const itens: any[] = [];

    while (true) {
      let url = `/produtos?pagina=${pagina}&limite=100&criterio=2`;
      if (dataInicio) url += `&dataInclusaoInicial=${dataInicio} 00:00:00`;
      if (dataFim) url += `&dataInclusaoFinal=${dataFim} 23:59:59`;

      const data = await blingReq(url) as any;
      const produtos = data?.data || [];
      if (!produtos.length) break;

      for (const produto of produtos) {
        const sku = produto.codigo || '';
        const idBling = `BL${String(produto.id).padStart(8, '0')}`;
        const jaExiste = skusExistentes.has(sku) || skusExistentes.has(idBling);

        let motoId = resolverMotoId(sku, prefixos);
        if (!motoId && motoIdFallback) motoId = Number(motoIdFallback);

        const moto = motoId
          ? await prisma.moto.findUnique({
            where: { id: motoId },
            select: { marca: true, modelo: true },
          })
          : null;

        const qtdEstoque = Number(produto.estoque?.saldoVirtualTotal || produto.estoque?.saldo || 0);

        itens.push({
          id: produto.id,
          sku,
          nome: produto.nome || '',
          preco: Number(produto.preco) || 0,
          qtdEstoque,
          motoId: motoId || null,
          moto: moto ? `${moto.marca} ${moto.modelo}` : null,
          jaExiste,
          semPrefixo: !motoId,
        });
      }

      if (produtos.length < 100) break;
      pagina += 1;
      await sleep(300);
    }

    res.json({ ok: true, total: itens.length, itens });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/comparar-produtos', async (req, res, next) => {
  try {
    const codigosManuais = parseSkuList(req.body?.codigos || req.body?.texto || req.body?.skus);
    const motoId = Number(req.body?.motoId) || 0;
    const pecasDaMoto = motoId
      ? await prisma.peca.findMany({
          where: { motoId },
          select: { idPeca: true },
          orderBy: { idPeca: 'asc' },
        })
      : [];
    const codigosDaMoto = pecasDaMoto.map((peca) => getBaseSku(peca.idPeca)).filter(Boolean);
    const codigos = Array.from(new Set([...codigosManuais, ...codigosDaMoto]));

    if (!codigos.length) {
      return res.status(400).json({ error: 'Informe pelo menos um ID de peca / SKU ou selecione uma moto para comparar' });
    }

    const whereOr = codigos.flatMap((codigo) => [
      { idPeca: codigo },
      { idPeca: { startsWith: `${codigo}-` } },
    ]);

    const [pecas, produtosBling] = await Promise.all([
      prisma.peca.findMany({
        where: { OR: whereOr },
        select: {
          idPeca: true,
          descricao: true,
          disponivel: true,
          emPrejuizo: true,
          prejuizo: { select: { motivo: true } },
          moto: { select: { marca: true, modelo: true } },
        },
        orderBy: { idPeca: 'asc' },
      }),
      findBlingProductsByCodes(codigos),
    ]);

    const produtoIdsParaStatus = Array.from(new Set(
      codigos
        .map((codigo) => {
          const produto = produtosBling.get(codigo);
          if (!produto) return 0;

          const qtdBling = toNumber(produto?.estoque?.saldoVirtualTotal ?? produto?.estoque?.saldo ?? 0);
          const local = pecas
            .filter((peca) => getBaseSku(peca.idPeca) === codigo)
            .reduce((acc, peca) => acc + (peca.disponivel && !peca.emPrejuizo ? 1 : 0), 0);

          return (qtdBling > 0 || local > 0) ? Number(produto.id) : 0;
        })
        .filter(Boolean),
    ));

    const statusMercadoLivreByProductId = await findMercadoLivreStatusByProductIds(produtoIdsParaStatus);

    const localMap = new Map<string, any>();

    for (const codigo of codigos) {
      localMap.set(codigo, {
        sku: codigo,
        qtdTotalAnb: 0,
        qtdDisponivelAnb: 0,
        qtdVendidasAnb: 0,
        qtdPrejuizoAnb: 0,
        idsPecaPrejuizo: [] as string[],
        motivosPrejuizo: [] as string[],
        descricaoAnb: null,
        moto: null,
      });
    }

    for (const peca of pecas) {
      const baseSku = getBaseSku(peca.idPeca);
      const current = localMap.get(baseSku) || {
        sku: baseSku,
        qtdTotalAnb: 0,
        qtdDisponivelAnb: 0,
        qtdVendidasAnb: 0,
        qtdPrejuizoAnb: 0,
        idsPecaPrejuizo: [] as string[],
        motivosPrejuizo: [] as string[],
        descricaoAnb: null,
        moto: null,
      };

      current.qtdTotalAnb += 1;
      current.qtdDisponivelAnb += peca.disponivel && !peca.emPrejuizo ? 1 : 0;
      current.qtdVendidasAnb += !peca.disponivel && !peca.emPrejuizo ? 1 : 0;
      if (peca.emPrejuizo) {
        current.qtdPrejuizoAnb += 1;
        current.idsPecaPrejuizo.push(peca.idPeca);
        if (peca.prejuizo?.motivo) current.motivosPrejuizo.push(peca.prejuizo.motivo);
      }
      if (!current.descricaoAnb) current.descricaoAnb = peca.descricao || null;
      if (!current.moto && peca.moto) current.moto = `${peca.moto.marca} ${peca.moto.modelo}`;

      localMap.set(baseSku, current);
    }

    const divergencias = codigos.flatMap((codigo) => {
      const local = localMap.get(codigo) || {
        sku: codigo,
        qtdTotalAnb: 0,
        qtdDisponivelAnb: 0,
        qtdVendidasAnb: 0,
        qtdPrejuizoAnb: 0,
        idsPecaPrejuizo: [],
        motivosPrejuizo: [],
        descricaoAnb: null,
        moto: null,
      };
      const produtoBling = produtosBling.get(codigo);
      const qtdBling = produtoBling ? toNumber(produtoBling?.estoque?.saldoVirtualTotal ?? produtoBling?.estoque?.saldo ?? 0) : 0;
      const descricaoBling = produtoBling?.nome || null;
      const statusMercadoLivre = produtoBling?.id
        ? (statusMercadoLivreByProductId.get(Number(produtoBling.id)) || { found: false, label: null, isActive: false, code: null, anuncioIds: [], lojaIds: [] })
        : { label: null, normalized: '', isActive: false, found: false };
      const temEstoqueEmAlgumSistema = local.qtdDisponivelAnb > 0 || qtdBling > 0;
      const divergenciasSku: any[] = [];
      const deveAlertarPrejuizo = local.qtdPrejuizoAnb > 0 && (
        qtdBling > 0
        || (statusMercadoLivre.found && statusMercadoLivre.isActive)
      );

      if (deveAlertarPrejuizo) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'peca_em_prejuizo',
          titulo: 'Peca em prejuizo no ANB',
          detalhe: `Esse SKU possui ${local.qtdPrejuizoAnb} item(ns) registrado(s) em prejuizo e precisa ser revisado na equalizacao.`,
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueBling: qtdBling,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          qtdPrejuizoAnb: local.qtdPrejuizoAnb,
          idsPecaPrejuizo: Array.from(new Set(local.idsPecaPrejuizo)),
          motivosPrejuizo: Array.from(new Set(local.motivosPrejuizo)),
          descricaoAnb: local.descricaoAnb,
          descricaoBling,
          moto: local.moto,
          statusMercadoLivre: statusMercadoLivre.label,
          statusMercadoLivreAtivo: statusMercadoLivre.found ? statusMercadoLivre.isActive : null,
        });
      }

      if (!produtoBling) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'nao_encontrado_bling',
          titulo: 'Nao encontrado no Bling',
          detalhe: 'Esse SKU existe no ANB, mas nao foi encontrado na busca do catalogo do Bling.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueBling: 0,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          qtdPrejuizoAnb: local.qtdPrejuizoAnb,
          idsPecaPrejuizo: Array.from(new Set(local.idsPecaPrejuizo)),
          motivosPrejuizo: Array.from(new Set(local.motivosPrejuizo)),
          descricaoAnb: local.descricaoAnb,
          descricaoBling,
          moto: local.moto,
          statusMercadoLivre: null,
          statusMercadoLivreAtivo: null,
        });
        return divergenciasSku;
      }

      if (temEstoqueEmAlgumSistema && statusMercadoLivre.found && !statusMercadoLivre.isActive) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'status_ml_nao_ativo',
          titulo: 'Anuncio ML nao ativo',
          detalhe: 'Existe estoque no ANB ou no Bling, mas o status do Mercado Livre esta diferente de ativo.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueBling: qtdBling,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          qtdPrejuizoAnb: local.qtdPrejuizoAnb,
          idsPecaPrejuizo: Array.from(new Set(local.idsPecaPrejuizo)),
          motivosPrejuizo: Array.from(new Set(local.motivosPrejuizo)),
          descricaoAnb: local.descricaoAnb,
          descricaoBling,
          moto: local.moto,
          statusMercadoLivre: statusMercadoLivre.label,
          statusMercadoLivreAtivo: false,
        });
        return divergenciasSku;
      }

      if (!local.qtdTotalAnb) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'nao_encontrado_anb',
          titulo: 'Nao encontrado no ANB',
          detalhe: 'Esse SKU foi encontrado no Bling, mas nao existe na sua base de pecas do ANB.',
          estoqueAnb: 0,
          estoqueBling: qtdBling,
          qtdTotalAnb: 0,
          qtdVendidasAnb: 0,
          qtdPrejuizoAnb: 0,
          idsPecaPrejuizo: [],
          motivosPrejuizo: [],
          descricaoAnb: null,
          descricaoBling,
          moto: null,
          statusMercadoLivre: statusMercadoLivre.label,
          statusMercadoLivreAtivo: statusMercadoLivre.found ? statusMercadoLivre.isActive : null,
        });
        return divergenciasSku;
      }

      if (local.qtdDisponivelAnb > qtdBling) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'estoque_anb_maior',
          titulo: 'Estoque ANB maior que Bling',
          detalhe: 'O ANB mostra mais pecas disponiveis que o saldo atual do Bling.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueBling: qtdBling,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          qtdPrejuizoAnb: local.qtdPrejuizoAnb,
          idsPecaPrejuizo: Array.from(new Set(local.idsPecaPrejuizo)),
          motivosPrejuizo: Array.from(new Set(local.motivosPrejuizo)),
          descricaoAnb: local.descricaoAnb,
          descricaoBling,
          moto: local.moto,
          statusMercadoLivre: statusMercadoLivre.label,
          statusMercadoLivreAtivo: statusMercadoLivre.found ? statusMercadoLivre.isActive : null,
        });
        return divergenciasSku;
      }

      if (local.qtdDisponivelAnb < qtdBling) {
        divergenciasSku.push({
          sku: codigo,
          tipo: 'estoque_bling_maior',
          titulo: 'Estoque Bling maior que ANB',
          detalhe: 'O Bling mostra mais saldo disponivel que a quantidade em estoque no ANB.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueBling: qtdBling,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          qtdPrejuizoAnb: local.qtdPrejuizoAnb,
          idsPecaPrejuizo: Array.from(new Set(local.idsPecaPrejuizo)),
          motivosPrejuizo: Array.from(new Set(local.motivosPrejuizo)),
          descricaoAnb: local.descricaoAnb,
          descricaoBling,
          moto: local.moto,
          statusMercadoLivre: statusMercadoLivre.label,
          statusMercadoLivreAtivo: statusMercadoLivre.found ? statusMercadoLivre.isActive : null,
        });
        return divergenciasSku;
      }

      return divergenciasSku;
    });

    res.json({
      ok: true,
      totalConsultados: codigos.length,
      totalDivergencias: divergencias.length,
      totalSemDivergencia: codigos.length - divergencias.length,
      divergencias,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/debug-status-produto', async (req, res, next) => {
  try {
    const codigo = getBaseSku(req.body?.codigo || req.body?.sku);
    if (!codigo) {
      return res.status(400).json({ error: 'Informe um codigo / SKU' });
    }

    const produtos = await findBlingProductsByCodes([codigo]);
    const produto = produtos.get(codigo);
    if (!produto?.id) {
      return res.status(404).json({ error: 'Produto nao encontrado no Bling', codigo });
    }

    const detalhes = await findBlingProductDetailsByIds([Number(produto.id)]);
    const detalhe = detalhes.get(Number(produto.id)) || null;
    const anuncioStatuses = await findMercadoLivreStatusByProductIds([Number(produto.id)]);
    const candidates = Array.from(new Set(
      collectMercadoLivreTexts(detalhe)
        .map((text) => String(text || '').trim())
        .filter(Boolean),
    ));
    const flattenedText = extractSearchableText(detalhe);
    const sections = collectMercadoLivreDebugSections(detalhe).slice(0, 40);

    res.json({
      ok: true,
      codigo,
      produtoId: Number(produto.id),
      nome: produto.nome || null,
      estoqueBling: toNumber(produto?.estoque?.saldoVirtualTotal ?? produto?.estoque?.saldo ?? 0),
      statusAnunciosApi: anuncioStatuses.get(Number(produto.id)) || null,
      statusResolvido: resolveMercadoLivreStatus(detalhe),
      candidates: candidates.slice(0, 50),
      hasMlMarkerInFlatText: hasMercadoLivreMarker(flattenedText),
      flatTextExcerpt: flattenedText.slice(0, 4000),
      mlSections: sections,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/comparar-produtos-csv', async (req, res, next) => {
  try {
    const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
    const escopoAnb = String(req.body?.escopoAnb || 'full');
    const escopoArquivo = String(req.body?.escopoArquivo || 'full');

    if (!linhas.length) {
      return res.status(400).json({ error: 'Envie um CSV com pelo menos uma linha valida' });
    }

    const pecas = await prisma.peca.findMany({
      select: {
        idPeca: true,
        descricao: true,
        disponivel: true,
        emPrejuizo: true,
        moto: { select: { marca: true, modelo: true } },
      },
      orderBy: { idPeca: 'asc' },
    });

    const localMap = new Map<string, any>();
    for (const peca of pecas) {
      const baseSku = getBaseSku(peca.idPeca);
      if (!baseSku) continue;

      const current = localMap.get(baseSku) || {
        sku: baseSku,
        qtdTotalAnb: 0,
        qtdDisponivelAnb: 0,
        qtdVendidasAnb: 0,
        descricaoAnb: null,
        moto: null,
      };

      current.qtdTotalAnb += 1;
      current.qtdDisponivelAnb += peca.disponivel && !peca.emPrejuizo ? 1 : 0;
      current.qtdVendidasAnb += !peca.disponivel && !peca.emPrejuizo ? 1 : 0;
      if (!current.descricaoAnb) current.descricaoAnb = peca.descricao || null;
      if (!current.moto && peca.moto) current.moto = `${peca.moto.marca} ${peca.moto.modelo}`;

      localMap.set(baseSku, current);
    }

    const arquivoMap = new Map<string, any>();
    for (const linha of linhas) {
      const baseSku = getBaseSku(linha?.codigo);
      if (!baseSku) continue;

      const current = arquivoMap.get(baseSku) || {
        sku: baseSku,
        estoqueArquivo: 0,
        descricaoArquivo: null,
        situacaoArquivo: null,
        precoArquivo: null,
      };

      current.estoqueArquivo = roundMoney(current.estoqueArquivo + toNumber(linha?.estoque, 0));
      if (!current.descricaoArquivo && linha?.descricao) current.descricaoArquivo = String(linha.descricao).trim();
      if (!current.situacaoArquivo && linha?.situacao) current.situacaoArquivo = String(linha.situacao).trim();
      if (current.precoArquivo === null && linha?.preco !== undefined && linha?.preco !== null && String(linha.preco).trim() !== '') {
        current.precoArquivo = roundMoney(toNumber(linha.preco, 0));
      }

      arquivoMap.set(baseSku, current);
    }

    const filtraAnb = (item: any) => {
      if (escopoAnb === 'com_estoque') return item.qtdDisponivelAnb > 0;
      if (escopoAnb === 'sem_estoque') return item.qtdDisponivelAnb === 0;
      return true;
    };

    const filtraArquivo = (item: any) => {
      if (escopoArquivo === 'estoque_maior_zero') return item.estoqueArquivo > 0;
      if (escopoArquivo === 'estoque_igual_zero') return item.estoqueArquivo === 0;
      return true;
    };

    const skusAnb = Array.from(localMap.entries())
      .filter(([, item]) => filtraAnb(item))
      .map(([sku]) => sku);
    const skusArquivo = Array.from(arquivoMap.entries())
      .filter(([, item]) => filtraArquivo(item))
      .map(([sku]) => sku);
    const consultados = Array.from(new Set([...skusAnb, ...skusArquivo])).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );

    const divergencias = consultados.flatMap((sku) => {
      const local = localMap.get(sku) || {
        sku,
        qtdTotalAnb: 0,
        qtdDisponivelAnb: 0,
        qtdVendidasAnb: 0,
        descricaoAnb: null,
        moto: null,
      };
      const arquivo = arquivoMap.get(sku) || {
        sku,
        estoqueArquivo: 0,
        descricaoArquivo: null,
        situacaoArquivo: null,
        precoArquivo: null,
      };
      const existeNoAnbFiltrado = skusAnb.includes(sku);
      const existeNoArquivoFiltrado = skusArquivo.includes(sku);

      if (existeNoAnbFiltrado && !existeNoArquivoFiltrado) {
        return [{
          sku,
          tipo: 'nao_encontrado_csv',
          titulo: 'Nao encontrado no CSV filtrado',
          detalhe: 'Esse SKU aparece no recorte atual do ANB, mas nao apareceu no CSV do Bling dentro do filtro selecionado.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueArquivo: arquivo.estoqueArquivo || 0,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          descricaoAnb: local.descricaoAnb,
          descricaoArquivo: arquivo.descricaoArquivo,
          moto: local.moto,
          situacaoArquivo: arquivo.situacaoArquivo,
          precoArquivo: arquivo.precoArquivo,
        }];
      }

      if (!existeNoAnbFiltrado && existeNoArquivoFiltrado) {
        return [{
          sku,
          tipo: 'nao_encontrado_anb',
          titulo: 'Nao encontrado no ANB filtrado',
          detalhe: 'Esse SKU aparece no CSV do Bling dentro do filtro selecionado, mas nao foi encontrado no recorte atual do ANB.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueArquivo: arquivo.estoqueArquivo,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          descricaoAnb: local.descricaoAnb,
          descricaoArquivo: arquivo.descricaoArquivo,
          moto: local.moto,
          situacaoArquivo: arquivo.situacaoArquivo,
          precoArquivo: arquivo.precoArquivo,
        }];
      }

      if (local.qtdDisponivelAnb > arquivo.estoqueArquivo) {
        return [{
          sku,
          tipo: 'estoque_anb_maior',
          titulo: 'Estoque ANB maior que CSV',
          detalhe: 'O ANB mostra mais pecas disponiveis que o estoque encontrado no CSV do Bling.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueArquivo: arquivo.estoqueArquivo,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          descricaoAnb: local.descricaoAnb,
          descricaoArquivo: arquivo.descricaoArquivo,
          moto: local.moto,
          situacaoArquivo: arquivo.situacaoArquivo,
          precoArquivo: arquivo.precoArquivo,
        }];
      }

      if (local.qtdDisponivelAnb < arquivo.estoqueArquivo) {
        return [{
          sku,
          tipo: 'estoque_csv_maior',
          titulo: 'Estoque CSV maior que ANB',
          detalhe: 'O CSV do Bling mostra mais saldo que a quantidade disponivel no ANB.',
          estoqueAnb: local.qtdDisponivelAnb,
          estoqueArquivo: arquivo.estoqueArquivo,
          qtdTotalAnb: local.qtdTotalAnb,
          qtdVendidasAnb: local.qtdVendidasAnb,
          descricaoAnb: local.descricaoAnb,
          descricaoArquivo: arquivo.descricaoArquivo,
          moto: local.moto,
          situacaoArquivo: arquivo.situacaoArquivo,
          precoArquivo: arquivo.precoArquivo,
        }];
      }

      return [];
    });

    res.json({
      ok: true,
      totalConsultados: consultados.length,
      totalDivergencias: divergencias.length,
      totalSemDivergencia: consultados.length - divergencias.length,
      totalAnbFiltrados: skusAnb.length,
      totalArquivoFiltrados: skusArquivo.length,
      divergencias,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/relatorio-vendas', async (req, res, next) => {
  try {
    const dataDe = String(req.query?.dataDe || '').trim();
    const dataAte = String(req.query?.dataAte || '').trim();
    const pedido = String(req.query?.pedido || '').trim();
    const idPeca = String(req.query?.idPeca || '').trim().toUpperCase();

    const andFilters: any[] = [
      { dataVenda: { not: null } },
      { blingPedidoNum: { not: null } },
      { disponivel: false },
      { emPrejuizo: false },
    ];

    if (dataDe) andFilters.push({ dataVenda: { gte: parseDateStart(dataDe) } });
    if (dataAte) andFilters.push({ dataVenda: { lte: parseDateEnd(dataAte) } });
    if (pedido) {
      andFilters.push({
        blingPedidoNum: {
          contains: pedido,
          mode: 'insensitive',
        },
      });
    }
    if (idPeca) {
      andFilters.push({
        idPeca: {
          contains: idPeca,
          mode: 'insensitive',
        },
      });
    }

    const pecas = await prisma.peca.findMany({
      where: { AND: andFilters },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        precoML: true,
        valorTaxas: true,
        valorFrete: true,
        valorLiq: true,
        dataVenda: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        moto: {
          select: {
            id: true,
            marca: true,
            modelo: true,
          },
        },
      },
      orderBy: [
        { dataVenda: 'desc' },
        { blingPedidoNum: 'desc' },
        { idPeca: 'asc' },
      ],
    });

    const pedidosMap = new Map<string, any>();
    const totaisGerais = {
      totalPedidos: 0,
      totalItens: 0,
      precoML: 0,
      valorTaxas: 0,
      valorFrete: 0,
      valorLiq: 0,
    };

    for (const peca of pecas) {
      const pedidoNum = String(peca.blingPedidoNum || '').trim();
      if (!pedidoNum) continue;

      const item = {
        id: peca.id,
        idPeca: peca.idPeca,
        descricao: peca.descricao,
        dataVenda: formatDateOnly(peca.dataVenda),
        pedidoId: peca.blingPedidoId ? String(peca.blingPedidoId) : null,
        pedidoNum,
        motoId: peca.moto?.id ?? null,
        moto: peca.moto ? `${peca.moto.marca} ${peca.moto.modelo}` : null,
        precoML: roundMoney(toNumber(peca.precoML)),
        valorTaxas: roundMoney(toNumber(peca.valorTaxas)),
        valorFrete: roundMoney(toNumber(peca.valorFrete)),
        valorLiq: roundMoney(toNumber(peca.valorLiq)),
      };

      if (!pedidosMap.has(pedidoNum)) {
        pedidosMap.set(pedidoNum, {
          pedidoNum,
          pedidoId: item.pedidoId,
          dataVenda: item.dataVenda,
          quantidadeItens: 0,
          subtotalPrecoML: 0,
          subtotalTaxas: 0,
          subtotalFrete: 0,
          subtotalValorLiq: 0,
          itens: [],
        });
      }

      const pedidoGroup = pedidosMap.get(pedidoNum);
      pedidoGroup.itens.push(item);
      pedidoGroup.quantidadeItens += 1;
      pedidoGroup.subtotalPrecoML = roundMoney(pedidoGroup.subtotalPrecoML + item.precoML);
      pedidoGroup.subtotalTaxas = roundMoney(pedidoGroup.subtotalTaxas + item.valorTaxas);
      pedidoGroup.subtotalFrete = roundMoney(pedidoGroup.subtotalFrete + item.valorFrete);
      pedidoGroup.subtotalValorLiq = roundMoney(pedidoGroup.subtotalValorLiq + item.valorLiq);

      totaisGerais.totalItens += 1;
      totaisGerais.precoML = roundMoney(totaisGerais.precoML + item.precoML);
      totaisGerais.valorTaxas = roundMoney(totaisGerais.valorTaxas + item.valorTaxas);
      totaisGerais.valorFrete = roundMoney(totaisGerais.valorFrete + item.valorFrete);
      totaisGerais.valorLiq = roundMoney(totaisGerais.valorLiq + item.valorLiq);
    }

    const pedidos = Array.from(pedidosMap.values())
      .map((pedidoGroup) => ({
        ...pedidoGroup,
        itens: pedidoGroup.itens.sort((a: any, b: any) => a.idPeca.localeCompare(b.idPeca)),
      }))
      .sort((a, b) => {
        const dateDiff = new Date(b.dataVenda || 0).getTime() - new Date(a.dataVenda || 0).getTime();
        if (dateDiff) return dateDiff;
        return String(b.pedidoNum).localeCompare(String(a.pedidoNum), 'pt-BR', { numeric: true });
      });

    totaisGerais.totalPedidos = pedidos.length;

    res.json({
      ok: true,
      filtros: {
        dataDe,
        dataAte,
        pedido,
        idPeca,
      },
      totaisGerais,
      pedidos,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/importar-produto', async (req, res, next) => {
  try {
    const { id, sku, nome, preco, motoId, frete, taxaPct, qtd } = req.body;
    if (!motoId) return res.status(400).json({ error: 'motoId obrigatorio' });

    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const precoML = toNumber(preco);
    const freteN = roundMoney(toNumber(frete, defaults.fretePadrao) || defaults.fretePadrao);
    const taxa = roundMoney(toNumber(taxaPct, defaults.taxaPadraoPct) || defaults.taxaPadraoPct);
    const { taxaValor, valorLiq } = calculateFinancials(precoML, freteN, taxa);
    const quantidade = Math.max(1, Number(qtd) || 1);

    const skippedAll: boolean[] = [];
    for (let i = 0; i < quantidade; i += 1) {
      const skuBase = sku || `BL${String(id).padStart(8, '0')}`;
      const idPeca = i === 0 ? skuBase : `${skuBase}-${i + 1}`;
      const exists = await prisma.peca.findUnique({ where: { idPeca } });
      if (exists) {
        skippedAll.push(true);
        continue;
      }

      await prisma.peca.create({
        data: {
          idPeca,
          motoId: Number(motoId),
          descricao: nome || 'Produto Bling',
          precoML,
          valorFrete: freteN,
          valorTaxas: taxaValor,
          valorLiq,
          disponivel: true,
          cadastro: new Date(),
        },
      });

      skippedAll.push(false);
    }

    res.json({
      ok: true,
      skipped: skippedAll.every(Boolean),
      criados: skippedAll.filter((item) => !item).length,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/sync/vendas', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const { dataInicio, dataFim } = req.body;

    const todasPecas = await prisma.peca.findMany({
      select: {
        id: true,
        idPeca: true,
        disponivel: true,
        emPrejuizo: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        valorLiq: true,
        dataVenda: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        moto: { select: { marca: true, modelo: true } },
      },
    });
    const reservedVendaPecaIds = new Set<number>();
    const reservedCancelPecaIds = new Set<number>();

    const pedidosConcluidos = await listPedidos(dataInicio, dataFim, [STATUS_ID_CONCLUIDO]);
    const pedidosGerais = await listPedidos(dataInicio, dataFim);
    const pedidosGeraisMap = new Map(pedidosGerais.map((pedido) => [pedido.id, pedido]));
    const pedidosConcluidosMap = new Map(pedidosConcluidos.map((pedido) => [pedido.id, pedido]));
    const pedidoIds = Array.from(new Set([
      ...pedidosConcluidos.map((pedido) => pedido.id),
      ...pedidosGerais.map((pedido) => pedido.id),
    ]));
    const itens: any[] = [];

    for (const pedidoId of pedidoIds) {
      await sleep(150);

      const detalhe = await blingReq(`/pedidos/vendas/${pedidoId}`) as any;
      const pedido = detalhe?.data || {};
      const listSituacao = pedidosGeraisMap.get(pedidoId)?.situacao || pedidosConcluidosMap.get(pedidoId)?.situacao;
      const detailSituacao = classifyOrderSituation(pedido);
      const isCancelado = !!listSituacao?.isCancelado || detailSituacao.isCancelado;
      const statusLabel = listSituacao?.label && listSituacao.label !== 'Sem situacao'
        ? listSituacao.label
        : (detailSituacao.label || 'Sem situacao');
      const pedidoNum = pedido.numero || String(pedidoId);

      const dataVenda = (pedido.data || '').split('T')[0]
        || new Date().toISOString().split('T')[0];
      const taxaComissao = Number(pedido.taxas?.taxaComissao || 0);
      const valorBase = Number(pedido.taxas?.valorBase || 0);
      const taxaPct = valorBase > 0
        ? roundMoney((taxaComissao / valorBase) * 100)
        : 0;
      const fretePositivo = resolvePedidoFrete(pedido);

      const itensPedido = (pedido.itens || []).map((item: any) => {
        const skuBling = item.produto?.codigo || item.codigo || item.sku || '';
        const idBling = item.produto?.id ? `BL${String(item.produto.id).padStart(8, '0')}` : '';
        const quantidade = Math.max(1, Math.round(toNumber(item.quantidade, 1)));
        const totalItem = roundMoney(
          toNumber(item.valorTotal ?? item.total ?? item.valorTotalItem, 0),
        );
        const precoVenda = roundMoney(toNumber(
          item.valorUnitario ?? item.precoUnitario ?? item.valor ?? item.preco,
          totalItem > 0 ? totalItem / quantidade : 0,
        ));
        const subtotal = totalItem > 0
          ? totalItem
          : roundMoney(precoVenda * quantidade);

        return {
          original: item,
          skuBling,
          idBling,
          quantidade,
          precoVenda,
          subtotal,
        };
      });

      const subtotais = itensPedido.map((item: any) => item.subtotal);
      const fretesPorLinha = distributeProportionally(fretePositivo, subtotais);
      const taxasPorLinha = distributeProportionally(taxaComissao, subtotais);

      for (const [lineIndex, itemInfo] of itensPedido.entries()) {
        const { original: item, skuBling, idBling, quantidade, precoVenda } = itemInfo;
        const linkedPecas = findLinkedPecasByPedido(
          todasPecas,
          pedidoId,
          pedidoNum,
          skuBling,
          idBling,
          isCancelado ? reservedCancelPecaIds : new Set<number>(),
        );
        const linkedVendidas = linkedPecas.filter((peca) => !peca.disponivel && !peca.emPrejuizo);
        const pecaReferencia = findSkuReferencePeca(todasPecas, skuBling, idBling);

        const freteLinha = fretesPorLinha[lineIndex] || 0;
        const taxaLinha = taxasPorLinha[lineIndex] || 0;
        const fretesUnitarios = splitEvenly(freteLinha, quantidade);
        const taxasUnitarias = splitEvenly(taxaLinha, quantidade);
        const valorLiqUnitario = fretesUnitarios.map((freteUnitario, unitIndex) =>
          roundMoney(precoVenda - freteUnitario - (taxasUnitarias[unitIndex] || 0)));
        const baseKey = `${pedidoId}-${skuBling || idBling || 'item'}-${lineIndex}`;

        const getFallbackIdPeca = (unitIndex: number) => {
          const baseSku = skuBling || idBling || pecaReferencia?.idPeca || 'SEM-SKU';
          return quantidade > 1 ? `${baseSku} [${unitIndex + 1}]` : baseSku;
        };

        if (isCancelado) {
          for (let unitIndex = 0; unitIndex < quantidade; unitIndex += 1) {
            const pecaCancelada = linkedVendidas[unitIndex];
            const pecaDisplay = pecaCancelada || pecaReferencia;
            const precoBaseCancelamento = toNumber(pecaDisplay?.precoML, precoVenda);
            const valoresCancelamento = calculateFinancials(
              precoBaseCancelamento,
              defaults.fretePadrao,
              defaults.taxaPadraoPct,
            );

            if (pecaCancelada && !reservedCancelPecaIds.has(pecaCancelada.id)) {
              reservedCancelPecaIds.add(pecaCancelada.id);
            }

            itens.push({
              entryKey: `${baseKey}-cancel-${unitIndex}`,
              tipo: 'CANCELAMENTO',
              statusLabel,
              pedidoId,
              pedidoNum,
              dataVenda,
              idPeca: pecaCancelada?.idPeca || getFallbackIdPeca(unitIndex),
              descricao: item.produto?.nome || item.descricao || '',
              skuBling,
              quantidade: 1,
              quantidadePedido: quantidade,
              precoVenda,
              frete: fretesUnitarios[unitIndex] || 0,
              taxaPct,
              taxaValor: taxasUnitarias[unitIndex] || 0,
              valorLiq: valorLiqUnitario[unitIndex] || roundMoney(precoVenda),
              encontrada: !!pecaCancelada,
              baixaVinculada: !!pecaCancelada,
              jaVendida: false,
              jaEstornada: false,
              pecaId: pecaCancelada?.id || null,
              pecaIds: pecaCancelada ? [pecaCancelada.id] : [],
              moto: (pecaCancelada?.moto || pecaReferencia?.moto) ? `${(pecaCancelada?.moto || pecaReferencia?.moto).marca} ${(pecaCancelada?.moto || pecaReferencia?.moto).modelo}` : null,
              precoMLAtual: pecaCancelada ? Number(pecaCancelada.precoML) : null,
              fretePadrao: defaults.fretePadrao,
              taxaPadraoPct: defaults.taxaPadraoPct,
              taxaPadraoValor: valoresCancelamento.taxaValor,
              valorLiqPadrao: valoresCancelamento.valorLiq,
            });
          }
          continue;
        }

        const quantidadeJaBaixada = linkedVendidas.length;
        const pecasParaVenda = findAvailablePecasForVenda(
          todasPecas,
          skuBling,
          idBling,
          reservedVendaPecaIds,
          Math.max(0, quantidade - quantidadeJaBaixada),
        );

        for (let unitIndex = quantidadeJaBaixada; unitIndex < quantidade; unitIndex += 1) {
          const pendingIndex = unitIndex - quantidadeJaBaixada;
          const pecaVenda = pecasParaVenda[pendingIndex];
          const pecaDisplay = pecaVenda || pecaReferencia;

          itens.push({
            entryKey: `${baseKey}-sale-${unitIndex}`,
            tipo: 'VENDA',
            statusLabel,
            pedidoId,
            pedidoNum,
            dataVenda,
            idPeca: pecaVenda?.idPeca || getFallbackIdPeca(unitIndex),
            descricao: item.produto?.nome || item.descricao || '',
            skuBling,
            quantidade: 1,
            quantidadePedido: quantidade,
            quantidadeJaBaixada,
            precoVenda,
            frete: fretesUnitarios[unitIndex] || 0,
            taxaPct,
            taxaValor: taxasUnitarias[unitIndex] || 0,
            valorLiq: valorLiqUnitario[unitIndex] || roundMoney(precoVenda),
            encontrada: !!pecaVenda,
            baixaVinculada: false,
            jaVendida: false,
            jaEstornada: false,
            pecaId: pecaVenda?.id || null,
            pecaIds: pecaVenda ? [pecaVenda.id] : [],
            moto: (pecaVenda?.moto || pecaDisplay?.moto) ? `${(pecaVenda?.moto || pecaDisplay?.moto).marca} ${(pecaVenda?.moto || pecaDisplay?.moto).modelo}` : null,
            precoMLAtual: pecaDisplay ? Number(pecaDisplay.precoML) : null,
            fretePadrao: defaults.fretePadrao,
            taxaPadraoPct: defaults.taxaPadraoPct,
            taxaPadraoValor: taxasUnitarias[unitIndex] || 0,
            valorLiqPadrao: valorLiqUnitario[unitIndex] || roundMoney(precoVenda),
          });
        }
      }
    }

    res.json({
      ok: true,
      total: itens.length,
      defaults,
      itens,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/baixar', async (req, res, next) => {
  try {
    const { pecaId, pecaIds, pedidoId, pedidoNum, dataVenda, precoVenda, frete, taxaValor, valorLiq } = req.body;
    const ids = Array.isArray(pecaIds) && pecaIds.length
      ? pecaIds.map((id) => Number(id)).filter(Boolean)
      : (pecaId ? [Number(pecaId)] : []);

    if (!ids.length || !dataVenda) {
      return res.status(400).json({ error: 'pecaId/pecaIds e dataVenda sao obrigatorios' });
    }

    const precoML = toNumber(precoVenda);
    const freteN = toNumber(frete);
    const taxas = toNumber(taxaValor);
    const vliq = valorLiq !== undefined
      ? toNumber(valorLiq)
      : roundMoney(precoML - freteN - taxas);

    await prisma.peca.updateMany({
      where: { id: { in: ids } },
      data: {
        disponivel: false,
        emPrejuizo: false,
        dataVenda: new Date(dataVenda),
        blingPedidoId: pedidoId ? String(pedidoId) : null,
        blingPedidoNum: pedidoNum ? String(pedidoNum) : null,
        precoML,
        valorFrete: freteN,
        valorTaxas: taxas,
        valorLiq: vliq,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/aprovar-cancelamento', async (req, res, next) => {
  try {
    const { pecaId, pecaIds } = req.body;
    const ids = Array.isArray(pecaIds) && pecaIds.length
      ? pecaIds.map((id) => Number(id)).filter(Boolean)
      : (pecaId ? [Number(pecaId)] : []);
    if (!ids.length) return res.status(400).json({ error: 'pecaId/pecaIds obrigatorio' });

    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const peca = await prisma.peca.findFirst({
      where: { id: { in: ids } },
      select: { id: true, precoML: true },
    });

    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });

    const precoML = toNumber(peca.precoML);
    const financials = calculateFinancials(precoML, defaults.fretePadrao, defaults.taxaPadraoPct);

    await prisma.peca.updateMany({
      where: { id: { in: ids } },
      data: {
        disponivel: true,
        emPrejuizo: false,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        valorFrete: defaults.fretePadrao,
        valorTaxas: financials.taxaValor,
        valorLiq: financials.valorLiq,
      },
    });

    res.json({
      ok: true,
      ids,
      defaults,
    });
  } catch (e) {
    next(e);
  }
});
