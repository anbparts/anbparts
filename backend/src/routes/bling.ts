import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const blingRouter = Router();

const BLING_API = 'https://www.bling.com.br/Api/v3';
const BLING_OAUTH = 'https://www.bling.com.br/Api/v3/oauth/token';
const DEFAULT_FRETE_PADRAO = 29.9;
const DEFAULT_TAXA_PADRAO_PCT = 17;
const AUDITORIA_DEFAULT_HORARIO = '03:00';
const AUDITORIA_DEFAULT_EMAIL_FROM = 'alertas@mail.anbparts.com.br';
const AUDITORIA_DEFAULT_TAMANHO_LOTE = 100;
const AUDITORIA_DEFAULT_PAUSA_MS = 400;
const AUDITORIA_EMAIL_SUBJECT = 'ALERTA ANB Parts - Divergência de Produtos / Anúncios - Verifique';
const AUDITORIA_TIMEZONE = 'America/Sao_Paulo';
const AUDITORIA_SCHEDULER_INTERVAL_MS = 60 * 1000;
const STATUS_ID_CONCLUIDO = 9;
const STATUS_IDS_CANCELADO = new Set([12]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PRODUCT_STORE_LINK_CACHE_TTL_MS = 10 * 60 * 1000;
const BLING_PRODUCT_CACHE_TTL_MS = 2 * 60 * 1000;
const BLING_PRODUCT_DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;
const MERCADO_LIVRE_STATUS_CONCURRENCY = 4;
const produtoLojaLinksCache = new Map<number, { expiresAt: number; rows: any[] }>();
const blingProductByCodeCache = new Map<string, { expiresAt: number; value: any | null }>();
const blingProductDetailCache = new Map<number, { expiresAt: number; value: any | null }>();
const auditoriaSchedulerState = {
  started: false,
  running: false,
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  if (!items.length) return [] as R[];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const run = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) break;
      results[current] = await worker(items[current], current);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => run()));
  return results;
}

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  pauseMs: number,
  worker: (batch: T[], batchIndex: number) => Promise<void>,
) {
  if (!items.length) return;

  const safeBatchSize = Math.max(1, batchSize || items.length);
  for (let offset = 0, batchIndex = 0; offset < items.length; offset += safeBatchSize, batchIndex += 1) {
    const batch = items.slice(offset, offset + safeBatchSize);
    await worker(batch, batchIndex);
    if (pauseMs > 0 && offset + safeBatchSize < items.length) {
      await sleep(pauseMs);
    }
  }
}

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

function normalizeTitle(value: string) {
  return normalizeText(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
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

function normalizeHorarioAuditoria(value: any) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : AUDITORIA_DEFAULT_HORARIO;
}

function getAuditoriaDefaults(cfg: any) {
  return {
    auditoriaAtiva: !!cfg?.auditoriaAtiva,
    auditoriaHorario: normalizeHorarioAuditoria(cfg?.auditoriaHorario),
    auditoriaEmailDestinatario: String(cfg?.auditoriaEmailDestinatario || '').trim(),
    auditoriaResendApiKey: String(cfg?.auditoriaResendApiKey || '').trim(),
    auditoriaResendFrom: String(cfg?.auditoriaResendFrom || AUDITORIA_DEFAULT_EMAIL_FROM).trim() || AUDITORIA_DEFAULT_EMAIL_FROM,
    auditoriaTamanhoLote: Math.max(10, Math.min(500, Math.round(toNumber(cfg?.auditoriaTamanhoLote, AUDITORIA_DEFAULT_TAMANHO_LOTE)))),
    auditoriaPausaMs: Math.max(0, Math.min(15000, Math.round(toNumber(cfg?.auditoriaPausaMs, AUDITORIA_DEFAULT_PAUSA_MS)))),
    auditoriaUltimaExecucaoChave: cfg?.auditoriaUltimaExecucaoChave || null,
    auditoriaUltimaExecucaoEm: cfg?.auditoriaUltimaExecucaoEm || null,
  };
}

async function getConfig(): Promise<any> {
  let cfg = await prisma.blingConfig.findFirst();
  if (!cfg) cfg = await prisma.blingConfig.create({ data: {} });

  return {
    ...cfg,
    prefixos: Array.isArray(cfg.prefixos) ? (cfg.prefixos as any[]) : [],
    ...getProdutoDefaults(cfg),
    ...getAuditoriaDefaults(cfg),
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

function normalizeLocation(value: any) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function getNestedValue(source: any, path: string[]) {
  return path.reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), source);
}

function hasNestedProperty(source: any, path: string[]) {
  let current = source;
  for (const key of path) {
    if (current === null || current === undefined || !(key in current)) {
      return false;
    }
    current = current[key];
  }
  return true;
}

function resolveBlingLocation(produto: any, detail?: any) {
  const candidates = [
    { source: produto, path: ['localizacao'] },
    { source: produto, path: ['estoque', 'localizacao'] },
    { source: produto, path: ['deposito', 'localizacao'] },
    { source: produto, path: ['armazenagem', 'localizacao'] },
    { source: detail, path: ['localizacao'] },
    { source: detail, path: ['estoque', 'localizacao'] },
    { source: detail, path: ['deposito', 'localizacao'] },
    { source: detail, path: ['armazenagem', 'localizacao'] },
  ];

  let resolved = false;

  for (const candidate of candidates) {
    if (!candidate.source) continue;
    if (!hasNestedProperty(candidate.source, candidate.path)) continue;

    resolved = true;
    const normalized = normalizeLocation(getNestedValue(candidate.source, candidate.path));
    if (normalized) {
      return { location: normalized, resolved: true };
    }
  }

  return { location: null, resolved };
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
  const uniqueCodes = Array.from(new Set(codes.map((code) => getBaseSku(code)).filter(Boolean)));
  const found = new Map<string, any>();
  const targetCodes = new Set<string>();
  let pagina = 1;

  for (const code of uniqueCodes) {
    const cached = blingProductByCodeCache.get(code);
    if (cached && cached.expiresAt > Date.now() && cached.value) {
      found.set(code, cached.value);
      continue;
    }

    targetCodes.add(code);
  }

  while (targetCodes.size > 0) {
    const data = await blingReq(`/produtos?pagina=${pagina}&limite=100&criterio=2`) as any;
    const produtos = data?.data || [];
    if (!produtos.length) break;

    for (const produto of produtos) {
      const code = getBaseSku(produto?.codigo);
      if (!code || !targetCodes.has(code) || found.has(code)) continue;

      found.set(code, produto);
      blingProductByCodeCache.set(code, {
        expiresAt: Date.now() + BLING_PRODUCT_CACHE_TTL_MS,
        value: produto,
      });
      targetCodes.delete(code);
    }

    if (produtos.length < 100) break;
    pagina += 1;
    await sleep(250);
  }

  return found;
}

async function fetchBlingProductDetailById(id: number) {
  const cached = blingProductDetailCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await blingReq(`/produtos/${id}`) as any;
  const detail = data?.data || null;
  blingProductDetailCache.set(id, {
    expiresAt: Date.now() + BLING_PRODUCT_DETAIL_CACHE_TTL_MS,
    value: detail,
  });
  return detail;
}

function getRuntimeBatchOptions(options?: { batchSize?: number; pauseMs?: number }) {
  return {
    batchSize: Math.max(1, Number(options?.batchSize || 0) || 0),
    pauseMs: Math.max(0, Number(options?.pauseMs || 0) || 0),
  };
}

async function findBlingProductDetailsByIds(
  ids: number[],
  options?: { batchSize?: number; pauseMs?: number },
) {
  const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
  const details = new Map<number, any>();

  const runtime = getRuntimeBatchOptions(options);
  await processInBatches(
    uniqueIds,
    runtime.batchSize || uniqueIds.length || 1,
    runtime.pauseMs,
    async (batch) => {
      await mapWithConcurrency(batch, MERCADO_LIVRE_STATUS_CONCURRENCY, async (id) => {
        try {
          details.set(id, await fetchBlingProductDetailById(id));
        } catch {
          details.set(id, null);
        }

        return null;
      });
    },
  );

  return details;
}

function getBlingStockMaximum(detail: any) {
  const candidates = [
    detail?.estoque?.maximo,
    detail?.estoque?.saldoMaximo,
    detail?.estoqueMaximo,
    detail?.maximo,
  ];

  for (const candidate of candidates) {
    const value = toNumber(candidate, NaN);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  return null;
}

function normalizeApiArray(data: any): any[] {
  if (Array.isArray(data)) return data as any[];
  if (Array.isArray(data?.data)) return data.data as any[];
  if (data && typeof data === 'object') return [data];
  return [];
}

function parseAnuncioStatus(value: any) {
  const rawCode = typeof value === 'object'
    ? Number(value?.id ?? value?.codigo ?? value?.value ?? value?.valor)
    : Number(value);
  const code = Number.isFinite(rawCode) ? rawCode : NaN;

  if (Number.isFinite(code)) {
    if (code === 1) return { code, label: 'Publicado', isActive: true };
    if (code === 2) return { code, label: 'Rascunho', isActive: false };
    if (code === 3) return { code, label: 'Com problema', isActive: false };
    if (code === 4) return { code, label: 'Pausado', isActive: false };
    return { code, label: String(value), isActive: false };
  }

  const text = String(extractSituationText(value) || '').trim();
  const normalized = normalizeText(text);
  if (!text) return null;

  if (/(^|[^a-z])(publicado|ativo)([^a-z]|$)/.test(normalized)) {
    return { code: 1, label: text, isActive: true };
  }
  if (/(^|[^a-z])(pausado|pausada)([^a-z]|$)/.test(normalized)) {
    return { code: 4, label: text, isActive: false };
  }
  if (/rascunh/.test(normalized)) {
    return { code: 2, label: text, isActive: false };
  }
  if (/problema|erro|reprov/.test(normalized)) {
    return { code: 3, label: text, isActive: false };
  }

  return null;
}

function getProdutoLojaId(row: any) {
  const lojaId = Number(row?.loja?.id || row?.idLoja || 0);
  return Number.isFinite(lojaId) && lojaId > 0 ? lojaId : 0;
}

function getProdutoLojaIds(rows: any[]) {
  return Array.from(new Set(
    rows
      .map((row) => getProdutoLojaId(row))
      .filter((id): id is number => Number.isFinite(id) && id > 0),
  ));
}

function isLikelyMercadoLivreLink(row: any) {
  const codigo = String(row?.codigo || row?.codigoLoja || '').trim().toUpperCase();
  const lojaNome = normalizeText(String(row?.loja?.nome || row?.nomeLoja || ''));
  return /^ML[A-Z0-9]/.test(codigo) || /mercado ?livre/.test(lojaNome);
}

async function fetchProdutoLojaLinksByProductId(productId: number) {
  const cached = produtoLojaLinksCache.get(productId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  const data = await blingReq(`/produtos/lojas?pagina=1&limite=100&idProduto=${productId}`) as any;
  const rows: any[] = normalizeApiArray(data?.data);
  produtoLojaLinksCache.set(productId, {
    expiresAt: Date.now() + PRODUCT_STORE_LINK_CACHE_TTL_MS,
    rows,
  });
  return rows;
}

async function findProdutoLojaLinksByProductIds(ids: number[]) {
  const uniqueIds: number[] = Array.from(new Set(
    ids
      .map((id) => Number(id))
      .filter((id): id is number => Number.isFinite(id) && id > 0),
  ));
  const links = new Map<number, any[]>();

  await mapWithConcurrency(uniqueIds, MERCADO_LIVRE_STATUS_CONCURRENCY, async (productId) => {
    try {
      const rows = await fetchProdutoLojaLinksByProductId(productId);
      links.set(productId, rows);
    } catch {
      links.set(productId, []);
    }

    return null;
  });

  return links;
}

const MERCADO_LIVRE_SITUACOES = [1, 2, 3, 4];

async function listMercadoLivreAnunciosByProductStoreSituation(productId: number, lojaId: number, situacao: number) {
  const anuncios: any[] = [];
  let pagina = 1;

  while (true) {
    const data = await blingReq(
      `/anuncios?pagina=${pagina}&limite=100&idProduto=${productId}&tipoIntegracao=MercadoLivre&idLoja=${lojaId}&situacao=${situacao}`,
    ) as any;
    const rows = normalizeApiArray(data?.data);
    if (!rows.length) break;

    anuncios.push(...rows);

    if (rows.length < 100) break;
    pagina += 1;
    await sleep(120);
  }

  return anuncios;
}

async function listMercadoLivreAnunciosByStoreSituation(lojaId: number, situacao: number) {
  const anuncios: any[] = [];
  let pagina = 1;

  while (true) {
    const data = await blingReq(
      `/anuncios?pagina=${pagina}&limite=100&tipoIntegracao=MercadoLivre&idLoja=${lojaId}&situacao=${situacao}`,
    ) as any;
    const rows = normalizeApiArray(data?.data);
    if (!rows.length) break;

    anuncios.push(...rows);

    if (rows.length < 100) break;
    pagina += 1;
    await sleep(120);
  }

  return anuncios;
}

async function getMercadoLivreAnuncioDetail(idAnuncio: number, lojaId: number) {
  const data = await blingReq(`/anuncios/${idAnuncio}?tipoIntegracao=MercadoLivre&idLoja=${lojaId}`) as any;
  return data?.data || null;
}

function isLikelySameAnuncioTitle(produtoNome: string, anuncioTitulo: string) {
  const produto = normalizeTitle(produtoNome);
  const anuncio = normalizeTitle(anuncioTitulo);
  if (!produto || !anuncio) return false;
  if (produto === anuncio || produto.includes(anuncio) || anuncio.includes(produto)) return true;

  const tokens = produto.split(' ').filter((token) => token.length >= 4);
  if (!tokens.length) return false;

  const matched = tokens.filter((token) => anuncio.includes(token)).length;
  const minimum = Math.min(3, tokens.length);
  return matched >= minimum && matched >= Math.ceil(tokens.length * 0.6);
}

async function collectMercadoLivreStatusByProductIds(
  ids: number[],
  withDebug = false,
  options?: { batchSize?: number; pauseMs?: number },
) {
  const uniqueIds: number[] = Array.from(new Set(
    ids
      .map((id) => Number(id))
      .filter((id): id is number => Number.isFinite(id) && id > 0),
  ));
  const runtime = getRuntimeBatchOptions(options);
  const productStoreLinks = await findProdutoLojaLinksByProductIds(uniqueIds);
  const statuses = new Map<number, {
    found: boolean;
    label: string | null;
    isActive: boolean;
    code: number | null;
    anuncioIds: number[];
    lojaIds: number[];
  }>();
  const debugByProductId = new Map<number, {
    lojaIds: number[];
    consultas: Array<{
      lojaId: number;
      situacao: number;
      total: number;
      anuncioIds: number[];
      labels: string[];
      rows: Array<{ id: number | null; situacao: any; status: any }>;
      error?: string | null;
    }>;
  }>();

  if (!withDebug) {
    await processInBatches(
      uniqueIds,
      runtime.batchSize || uniqueIds.length || 1,
      runtime.pauseMs,
      async (batch) => {
        await mapWithConcurrency(batch, MERCADO_LIVRE_STATUS_CONCURRENCY, async (productId) => {
          const lojaRows = productStoreLinks.get(productId) || [];
          const lojaIds = getProdutoLojaIds(lojaRows);
          const mercadoLivreRows = lojaRows.filter((row) => isLikelyMercadoLivreLink(row));
          const candidateRows = (mercadoLivreRows.length ? mercadoLivreRows : lojaRows)
            .filter((row) => {
              const anuncioId = Number(row?.id || row?.idAnuncio || 0);
              const lojaId = getProdutoLojaId(row);
              return Number.isFinite(anuncioId) && anuncioId > 0 && lojaId > 0;
            });
          const uniqueLinkRows = Array.from(new Map(
            candidateRows.map((row) => {
              const anuncioId = Number(row?.id || row?.idAnuncio || 0);
              const lojaId = getProdutoLojaId(row);
              return [`${lojaId}:${anuncioId}`, row];
            }),
          ).values());
          const collected: Array<{ code: number; label: string; isActive: boolean; anuncioId: number | null; lojaId: number }> = [];

          await mapWithConcurrency(uniqueLinkRows, Math.min(3, MERCADO_LIVRE_STATUS_CONCURRENCY), async (row) => {
            const anuncioId = Number(row?.id || row?.idAnuncio || 0);
            const lojaId = getProdutoLojaId(row);

            try {
              const detalhe = await getMercadoLivreAnuncioDetail(anuncioId, lojaId);
              const parsed = parseAnuncioStatus(detalhe?.status ?? detalhe?.situacao ?? row?.status ?? row?.situacao);
              if (parsed) {
                collected.push({
                  ...parsed,
                  anuncioId,
                  lojaId,
                });
              }
            } catch {
              // Ignora falhas individuais e segue com os demais vinculos.
            }

            return null;
          });

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

          return null;
        });
      },
    );

    return {
      statuses,
      debugByProductId,
    };
  }

  for (const productId of uniqueIds) {
    const lojaRows = productStoreLinks.get(productId) || [];
    const lojaIds = getProdutoLojaIds(lojaRows);
    const collected: Array<{ code: number; label: string; isActive: boolean; anuncioId: number | null; lojaId: number }> = [];
    const consultas: Array<{
      lojaId: number;
      situacao: number;
      total: number;
      anuncioIds: number[];
      labels: string[];
      rows: Array<{ id: number | null; situacao: any; status: any }>;
      error?: string | null;
    }> = [];

    for (const lojaId of lojaIds) {
      for (const situacao of MERCADO_LIVRE_SITUACOES) {
        try {
          const anuncios = await listMercadoLivreAnunciosByProductStoreSituation(productId, lojaId, situacao);

          consultas.push({
            lojaId,
            situacao,
            total: anuncios.length,
            anuncioIds: anuncios
              .map((anuncio) => Number(anuncio?.id || 0))
              .filter((id: number): id is number => Number.isFinite(id) && id > 0),
            labels: anuncios
              .map((anuncio) => String(extractSituationText(anuncio?.situacao ?? anuncio?.status ?? situacao) || '').trim())
              .filter((label: string): label is string => Boolean(label)),
            rows: anuncios.map((anuncio) => ({
              id: Number(anuncio?.id) || null,
              situacao: anuncio?.situacao ?? null,
              status: anuncio?.status ?? null,
            })),
            error: null,
          });

          for (const anuncio of anuncios) {
            const parsed = parseAnuncioStatus(anuncio?.situacao ?? anuncio?.status ?? situacao);
            if (!parsed) continue;

            collected.push({
              ...parsed,
              anuncioId: Number(anuncio?.id) || null,
              lojaId,
            });
          }
        } catch (e: any) {
          if (withDebug) {
            consultas.push({
              lojaId,
              situacao,
              total: -1,
              anuncioIds: [],
              labels: ['erro'],
              rows: [],
              error: e?.message || String(e),
            });
          }
        }

        await sleep(120);
      }
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

    if (withDebug) {
      debugByProductId.set(productId, {
        lojaIds,
        consultas,
      });
    }
  }

  return {
    statuses,
    debugByProductId,
  };
}

async function findMercadoLivreStatusByProductIds(
  ids: number[],
  options?: { batchSize?: number; pauseMs?: number },
) {
  const { statuses } = await collectMercadoLivreStatusByProductIds(ids, false, options);
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

function createLocalSkuResumo(sku: string) {
  return {
    sku,
    qtdTotalAnb: 0,
    qtdDisponivelAnb: 0,
    qtdVendidasAnb: 0,
    qtdPrejuizoAnb: 0,
    idsPecaPrejuizo: [] as string[],
    motivosPrejuizo: [] as string[],
    descricaoAnb: null as string | null,
    moto: null as string | null,
  };
}

function buildLocalSkuResumoMap(codigos: string[], pecas: any[]) {
  const localMap = new Map<string, any>();

  for (const peca of pecas) {
    const baseSku = getBaseSku(peca.idPeca);
    if (!baseSku) continue;

    const current = localMap.get(baseSku) || createLocalSkuResumo(baseSku);
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

  for (const codigo of codigos) {
    if (!localMap.has(codigo)) {
      localMap.set(codigo, createLocalSkuResumo(codigo));
    }
  }

  return localMap;
}

async function listPecasForComparacaoByCodes(codigos: string[]) {
  const whereOr = codigos.flatMap((codigo) => [
    { idPeca: codigo },
    { idPeca: { startsWith: `${codigo}-` } },
  ]);

  return prisma.peca.findMany({
    where: { OR: whereOr },
    select: {
      id: true,
      idPeca: true,
      descricao: true,
      localizacao: true,
      disponivel: true,
      emPrejuizo: true,
      prejuizo: { select: { motivo: true } },
      moto: { select: { marca: true, modelo: true } },
    },
    orderBy: { idPeca: 'asc' },
  });
}

async function loadLocalSkuResumoByCodes(codigos: string[]) {
  const uniqueCodes = Array.from(new Set(codigos.map((codigo) => getBaseSku(codigo)).filter(Boolean)));
  const pecas = uniqueCodes.length ? await listPecasForComparacaoByCodes(uniqueCodes) : [];
  return {
    codigos: uniqueCodes,
    pecas,
    localMap: buildLocalSkuResumoMap(uniqueCodes, pecas),
  };
}

async function loadAllLocalSkuResumo() {
  const pecas = await prisma.peca.findMany({
    select: {
      id: true,
      idPeca: true,
      descricao: true,
      localizacao: true,
      disponivel: true,
      emPrejuizo: true,
      prejuizo: { select: { motivo: true } },
      moto: { select: { marca: true, modelo: true } },
    },
    orderBy: { idPeca: 'asc' },
  });

  const codigos = Array.from(new Set(
    pecas
      .map((peca) => getBaseSku(peca.idPeca))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

  return {
    codigos,
    pecas,
    localMap: buildLocalSkuResumoMap(codigos, pecas),
  };
}

function buildDivergenciaPayload(
  codigo: string,
  local: any,
  qtdBling: number,
  descricaoBling: string | null,
  statusMercadoLivre: any,
  overrides: any,
) {
  return {
    sku: codigo,
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
    ...overrides,
  };
}

async function syncPecaLocalizacoesFromBling(
  localPecas: any[],
  produtosBling: Map<string, any>,
  detalhesBlingByProductId: Map<number, any>,
) {
  if (!localPecas.length) return 0;

  const targetBySku = new Map<string, { location: string | null; resolved: boolean }>();
  for (const peca of localPecas) {
    const skuBase = getBaseSku(peca.idPeca);
    if (!skuBase || targetBySku.has(skuBase)) continue;

    const produto = produtosBling.get(skuBase);
    if (!produto) continue;

    const detail = produto?.id ? (detalhesBlingByProductId.get(Number(produto.id)) || null) : null;
    const locationMeta = resolveBlingLocation(produto, detail);
    if (locationMeta.resolved) {
      targetBySku.set(skuBase, locationMeta);
    }
  }

  if (!targetBySku.size) return 0;

  const idsParaLimpar: number[] = [];
  const idsPorLocalizacao = new Map<string, number[]>();

  for (const peca of localPecas) {
    const skuBase = getBaseSku(peca.idPeca);
    if (!skuBase) continue;

    const target = targetBySku.get(skuBase);
    if (!target) continue;

    const current = normalizeLocation(peca.localizacao);
    if (current === target.location) continue;

    if (target.location) {
      const ids = idsPorLocalizacao.get(target.location) || [];
      ids.push(Number(peca.id));
      idsPorLocalizacao.set(target.location, ids);
    } else {
      idsParaLimpar.push(Number(peca.id));
    }
  }

  const operations: any[] = [];
  if (idsParaLimpar.length) {
    operations.push(prisma.peca.updateMany({
      where: { id: { in: idsParaLimpar } },
      data: { localizacao: null },
    }));
  }

  for (const [localizacao, ids] of idsPorLocalizacao.entries()) {
    operations.push(prisma.peca.updateMany({
      where: { id: { in: ids } },
      data: { localizacao },
    }));
  }

  if (!operations.length) return 0;
  await prisma.$transaction(operations);
  return idsParaLimpar.length + Array.from(idsPorLocalizacao.values()).reduce((sum, ids) => sum + ids.length, 0);
}

async function compareProdutosBlingCodes(
  codigosInput: string[],
  options?: { batchSize?: number; pauseMs?: number; localMap?: Map<string, any>; localPecas?: any[]; syncLocalizacao?: boolean },
) {
  const codigos = Array.from(new Set(codigosInput.map((codigo) => getBaseSku(codigo)).filter(Boolean)));
  if (!codigos.length) {
    return {
      ok: true,
      totalConsultados: 0,
      totalDivergencias: 0,
      totalSemDivergencia: 0,
      divergencias: [],
    };
  }

  const localLoaded = !options?.localMap || !options?.localPecas
    ? await loadLocalSkuResumoByCodes(codigos)
    : null;
  const localMap = options?.localMap || localLoaded?.localMap || new Map<string, any>();
  const localPecas = options?.localPecas || localLoaded?.pecas || [];
  const produtosBling = await findBlingProductsByCodes(codigos);
  const produtoIdsParaStatus = Array.from(new Set(
    codigos
      .map((codigo) => Number(produtosBling.get(codigo)?.id || 0))
      .filter((id): id is number => Number.isFinite(id) && id > 0),
  ));
  const produtoIdsParaDetalhe = Array.from(new Set(
    codigos
      .map((codigo) => {
        const produto = produtosBling.get(codigo);
        if (!produto?.id) return 0;

        const qtdBling = toNumber(produto?.estoque?.saldoVirtualTotal ?? produto?.estoque?.saldo ?? 0);
        const locationMeta = resolveBlingLocation(produto);
        const needsLocationDetail = !!options?.syncLocalizacao && !locationMeta.resolved;
        return qtdBling > 0 || needsLocationDetail ? Number(produto.id) : 0;
      })
      .filter((id): id is number => Number.isFinite(id) && id > 0),
  ));

  const [statusMercadoLivreByProductId, detalhesBlingByProductId] = await Promise.all([
    findMercadoLivreStatusByProductIds(produtoIdsParaStatus, options),
    findBlingProductDetailsByIds(produtoIdsParaDetalhe, options),
  ]);

  if (options?.syncLocalizacao && localPecas.length) {
    await syncPecaLocalizacoesFromBling(localPecas, produtosBling, detalhesBlingByProductId);
  }

  const divergencias = codigos.flatMap((codigo) => {
    const local = localMap.get(codigo) || createLocalSkuResumo(codigo);
    const produtoBling = produtosBling.get(codigo);
    const qtdBling = produtoBling ? toNumber(produtoBling?.estoque?.saldoVirtualTotal ?? produtoBling?.estoque?.saldo ?? 0) : 0;
    const descricaoBling = produtoBling?.nome || null;
    const statusMercadoLivre = produtoBling?.id
      ? (statusMercadoLivreByProductId.get(Number(produtoBling.id)) || { found: false, label: null, isActive: false, code: null, anuncioIds: [], lojaIds: [] })
      : { found: false, label: null, isActive: false, code: null, anuncioIds: [], lojaIds: [] };
    const estoqueMaximoBling = produtoBling?.id
      ? getBlingStockMaximum(detalhesBlingByProductId.get(Number(produtoBling.id)) || null)
      : null;
    const temEstoqueEmAlgumSistema = local.qtdDisponivelAnb > 0 || qtdBling > 0;
    const divergenciasSku: any[] = [];
    const deveAlertarPrejuizo = local.qtdPrejuizoAnb > 0 && (
      qtdBling > 0
      || (statusMercadoLivre.found && statusMercadoLivre.isActive)
    );

    if (deveAlertarPrejuizo) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'peca_em_prejuizo',
        titulo: 'Peca em prejuizo no ANB',
        detalhe: `Esse SKU possui ${local.qtdPrejuizoAnb} item(ns) registrado(s) em prejuizo e precisa ser revisado na equalizacao.`,
      }));
    }

    if (!produtoBling) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, 0, descricaoBling, statusMercadoLivre, {
        tipo: 'nao_encontrado_bling',
        titulo: 'Nao encontrado no Bling',
        detalhe: 'Esse SKU existe no ANB, mas nao foi encontrado na busca do catalogo do Bling.',
        statusMercadoLivre: null,
        statusMercadoLivreAtivo: null,
      }));
      return divergenciasSku;
    }

    if (temEstoqueEmAlgumSistema && statusMercadoLivre.found && !statusMercadoLivre.isActive) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'status_ml_nao_ativo',
        titulo: 'Anuncio ML nao ativo',
        detalhe: 'Existe estoque no ANB ou no Bling, mas o status do Mercado Livre esta diferente de ativo.',
        statusMercadoLivreAtivo: false,
      }));
      return divergenciasSku;
    }

    if (!temEstoqueEmAlgumSistema && statusMercadoLivre.found && statusMercadoLivre.isActive) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'status_ml_publicado_sem_estoque',
        titulo: 'Anuncio ML publicado sem estoque',
        detalhe: 'Nao ha estoque disponivel no ANB nem no Bling, mas o anuncio do Mercado Livre segue publicado.',
        statusMercadoLivreAtivo: true,
      }));
      return divergenciasSku;
    }

    if (!local.qtdTotalAnb) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'nao_encontrado_anb',
        titulo: 'Nao encontrado no ANB',
        detalhe: 'Esse SKU foi encontrado no Bling, mas nao existe na sua base de pecas do ANB.',
        estoqueAnb: 0,
        qtdTotalAnb: 0,
        qtdVendidasAnb: 0,
        qtdPrejuizoAnb: 0,
        idsPecaPrejuizo: [],
        motivosPrejuizo: [],
        descricaoAnb: null,
        moto: null,
      }));
      return divergenciasSku;
    }

    if (local.qtdDisponivelAnb > qtdBling) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'estoque_anb_maior',
        titulo: 'Estoque ANB maior que Bling',
        detalhe: 'O ANB mostra mais pecas disponiveis que o saldo atual do Bling.',
      }));
      return divergenciasSku;
    }

    if (estoqueMaximoBling !== null && qtdBling > estoqueMaximoBling) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'estoque_bling_acima_maximo',
        titulo: 'Estoque Bling acima do maximo',
        detalhe: `O Bling esta com saldo ${qtdBling}, mas o estoque maximo configurado para esse produto e ${estoqueMaximoBling}.`,
      }));
      return divergenciasSku;
    }

    if (local.qtdDisponivelAnb < qtdBling) {
      divergenciasSku.push(buildDivergenciaPayload(codigo, local, qtdBling, descricaoBling, statusMercadoLivre, {
        tipo: 'estoque_bling_maior',
        titulo: 'Estoque Bling maior que o permitido',
        detalhe: 'O Bling mostra mais saldo disponivel que a quantidade permitida pelo estoque atual do ANB.',
      }));
      return divergenciasSku;
    }

    return divergenciasSku;
  });

  return {
    ok: true,
    totalConsultados: codigos.length,
    totalDivergencias: divergencias.length,
    totalSemDivergencia: codigos.length - divergencias.length,
    divergencias,
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

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimePtBr(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: AUDITORIA_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getTimezoneDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AUDITORIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  const timeKey = `${map.hour}:${map.minute}`;
  return {
    dateKey,
    timeKey,
    runKey: `${dateKey}|${timeKey}`,
  };
}

function buildAuditoriaResumo(resultado: any) {
  const porTipo = (resultado?.divergencias || []).reduce((acc: Record<string, number>, item: any) => {
    const key = String(item?.tipo || 'outros');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const porMoto = (resultado?.divergencias || []).reduce((acc: Record<string, number>, item: any) => {
    const key = String(item?.moto || 'Sem moto');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totalConsultados: Number(resultado?.totalConsultados || 0),
    totalDivergencias: Number(resultado?.totalDivergencias || 0),
    totalSemDivergencia: Number(resultado?.totalSemDivergencia || 0),
    porTipo,
    porMoto,
  };
}

function renderAuditoriaMetricCard(label: string, value: any, color = '#1f2937') {
  return `
    <div style="background:#f8fafc;border:1px solid #dbe3ef;border-radius:10px;padding:12px 14px;min-width:140px;">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">${escapeHtml(label)}</div>
      <div style="font-size:24px;font-weight:700;color:${escapeHtml(color)};">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderAuditoriaEmailHtml(resultado: any, executedAt: Date | string) {
  const divergencias = Array.isArray(resultado?.divergencias) ? resultado.divergencias : [];
  const cards = divergencias.map((item: any) => {
    const statusColor = item?.statusMercadoLivreAtivo === false ? '#dc2626' : '#16a34a';
    const borderColor = item?.tipo === 'peca_em_prejuizo'
      ? '#b91c1c'
      : item?.tipo === 'nao_encontrado_anb'
        ? '#2563eb'
        : item?.tipo === 'nao_encontrado_bling'
          ? '#d97706'
          : '#dc2626';

    return `
      <div style="background:#ffffff;border:1px solid #dbe3ef;border-left:4px solid ${borderColor};border-radius:14px;padding:20px 20px 18px;margin-bottom:18px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <span style="font-family:monospace;font-size:12px;background:#f1f5f9;color:#64748b;padding:4px 8px;border-radius:6px;">${escapeHtml(item?.sku)}</span>
          <span style="font-size:12px;background:#fef2f2;color:${borderColor};padding:4px 8px;border-radius:6px;">${escapeHtml(item?.titulo)}</span>
          ${item?.statusMercadoLivre ? `<span style="font-size:12px;background:${item?.statusMercadoLivreAtivo === false ? '#fef2f2' : '#ecfdf3'};color:${statusColor};padding:4px 8px;border-radius:6px;">ML: ${escapeHtml(item.statusMercadoLivre)}</span>` : ''}
          ${item?.moto ? `<span style="font-size:12px;color:#94a3b8;">${escapeHtml(item.moto)}</span>` : ''}
        </div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:6px;">${escapeHtml(item?.descricaoAnb || item?.descricaoBling || 'Sem descricao')}</div>
        <div style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:14px;">${escapeHtml(item?.detalhe || '')}</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:10px;">
          ${renderAuditoriaMetricCard('Estoque ANB', item?.estoqueAnb ?? 0)}
          ${renderAuditoriaMetricCard('Estoque Bling', item?.estoqueBling ?? 0)}
          ${renderAuditoriaMetricCard('Total no ANB', item?.qtdTotalAnb ?? 0)}
          ${renderAuditoriaMetricCard('Vendidas no ANB', item?.qtdVendidasAnb ?? 0)}
          ${renderAuditoriaMetricCard('Em prejuizo', item?.qtdPrejuizoAnb ?? 0, item?.qtdPrejuizoAnb ? '#b91c1c' : '#1f2937')}
          ${renderAuditoriaMetricCard('Status ML', item?.statusMercadoLivre || 'Nao identificado', statusColor)}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:1040px;margin:0 auto;">
        <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:24px;margin-bottom:18px;">
          <div style="font-size:28px;font-weight:800;color:#dc2626;margin-bottom:8px;">ALERTA ANB Parts</div>
          <div style="font-size:16px;color:#334155;margin-bottom:8px;">Divergência de Produtos / Anúncios - Verifique</div>
          <div style="font-size:13px;color:#64748b;">Execução: ${escapeHtml(formatDateTimePtBr(executedAt))}</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
          ${renderAuditoriaMetricCard('Consultados', resultado?.totalConsultados || 0)}
          ${renderAuditoriaMetricCard('Divergentes', resultado?.totalDivergencias || 0, '#dc2626')}
          ${renderAuditoriaMetricCard('Sem divergencia', resultado?.totalSemDivergencia || 0, '#16a34a')}
        </div>
        ${cards || '<div style="background:#ecfdf3;border:1px solid #86efac;border-radius:14px;padding:18px 20px;color:#16a34a;font-weight:700;">Nenhuma divergência encontrada nesta execução.</div>'}
      </div>
    </div>
  `;
}

function renderAuditoriaEmailText(resultado: any, executedAt: Date | string) {
  const divergencias = Array.isArray(resultado?.divergencias) ? resultado.divergencias : [];
  const header = [
    'ALERTA ANB Parts - Divergência de Produtos / Anúncios - Verifique',
    `Execução: ${formatDateTimePtBr(executedAt)}`,
    `Consultados: ${resultado?.totalConsultados || 0}`,
    `Divergentes: ${resultado?.totalDivergencias || 0}`,
    `Sem divergência: ${resultado?.totalSemDivergencia || 0}`,
    '',
  ];

  const body = divergencias.map((item: any) => [
    `${item?.sku || 'SEM-SKU'} - ${item?.titulo || 'Divergência'}`,
    `${item?.descricaoAnb || item?.descricaoBling || 'Sem descricao'}`,
    `${item?.detalhe || ''}`,
    `Estoque ANB: ${item?.estoqueAnb ?? 0} | Estoque Bling: ${item?.estoqueBling ?? 0} | Total ANB: ${item?.qtdTotalAnb ?? 0} | Vendidas ANB: ${item?.qtdVendidasAnb ?? 0} | Prejuízo ANB: ${item?.qtdPrejuizoAnb ?? 0}`,
    `Status ML: ${item?.statusMercadoLivre || 'Nao identificado'}`,
    item?.moto ? `Moto: ${item.moto}` : '',
    '',
  ].filter(Boolean).join('\n')).join('\n');

  return [...header, body || 'Nenhuma divergência encontrada.'].join('\n');
}

async function sendAuditoriaEmail(cfg: any, resultado: any, executedAt: Date | string) {
  const apiKey = String(cfg?.auditoriaResendApiKey || '').trim();
  const to = String(cfg?.auditoriaEmailDestinatario || '').trim();
  const from = String(cfg?.auditoriaResendFrom || AUDITORIA_DEFAULT_EMAIL_FROM).trim() || AUDITORIA_DEFAULT_EMAIL_FROM;

  if (!apiKey) throw new Error('API Key do Resend nao configurada');
  if (!to) throw new Error('Email destinatario da auditoria nao configurado');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: AUDITORIA_EMAIL_SUBJECT,
      html: renderAuditoriaEmailHtml(resultado, executedAt),
      text: renderAuditoriaEmailText(resultado, executedAt),
    }),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Resend ${response.status}`);
  }

  return payload;
}

async function executeAuditoriaAutomatica(origem: 'manual' | 'auto' = 'manual') {
  const cfg = await getConfig();
  const local = await loadAllLocalSkuResumo();
  const execution = await prisma.auditoriaAutomaticaExecucao.create({
    data: {
      origem,
      status: 'executando',
      emailDestinatario: cfg.auditoriaEmailDestinatario || null,
      emailAssunto: AUDITORIA_EMAIL_SUBJECT,
      totalSkus: local.codigos.length,
    },
  });

  try {
    const resultado = await compareProdutosBlingCodes(local.codigos, {
      localMap: local.localMap,
      localPecas: local.pecas,
      syncLocalizacao: true,
      batchSize: cfg.auditoriaTamanhoLote,
      pauseMs: cfg.auditoriaPausaMs,
    });
    const resumo = buildAuditoriaResumo(resultado);
    let emailEnviado = false;
    let emailErro: string | null = null;

    if (resultado.totalDivergencias > 0 && cfg.auditoriaEmailDestinatario && cfg.auditoriaResendApiKey) {
      try {
        await sendAuditoriaEmail(cfg, resultado, new Date());
        emailEnviado = true;
      } catch (error: any) {
        emailErro = error?.message || String(error);
      }
    }

    const updated = await prisma.auditoriaAutomaticaExecucao.update({
      where: { id: execution.id },
      data: {
        status: emailErro ? 'sucesso_parcial' : 'sucesso',
        finishedAt: new Date(),
        totalSkus: resultado.totalConsultados,
        totalDivergencias: resultado.totalDivergencias,
        totalSemDivergencia: resultado.totalSemDivergencia,
        emailEnviado,
        emailErro,
        resumo,
        divergencias: resultado.divergencias,
      },
    });

    return {
      ...updated,
      resumo,
      divergencias: resultado.divergencias,
    };
  } catch (error: any) {
    const updated = await prisma.auditoriaAutomaticaExecucao.update({
      where: { id: execution.id },
      data: {
        status: 'erro',
        finishedAt: new Date(),
        erro: error?.message || String(error),
      },
    });

    return updated;
  }
}

async function tickAuditoriaAutomatica() {
  if (auditoriaSchedulerState.running) return;

  const cfg = await getConfig();
  if (!cfg.auditoriaAtiva) return;

  const now = getTimezoneDateParts(new Date());
  if (now.timeKey !== cfg.auditoriaHorario) return;
  if (cfg.auditoriaUltimaExecucaoChave === now.runKey) return;

  auditoriaSchedulerState.running = true;
  try {
    await saveConfig({
      auditoriaUltimaExecucaoChave: now.runKey,
      auditoriaUltimaExecucaoEm: new Date(),
    });
    await executeAuditoriaAutomatica('auto');
  } finally {
    auditoriaSchedulerState.running = false;
  }
}

export function startBlingAuditoriaScheduler() {
  if (auditoriaSchedulerState.started) return;
  auditoriaSchedulerState.started = true;

  const runTick = () => {
    tickAuditoriaAutomatica().catch((error) => {
      console.error('Falha na auditoria automatica do Bling:', error);
      auditoriaSchedulerState.running = false;
    });
  };

  setTimeout(runTick, 10000);
  setInterval(runTick, AUDITORIA_SCHEDULER_INTERVAL_MS);
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

blingRouter.get('/auditoria-automatica/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    const ultimaExecucao = await prisma.auditoriaAutomaticaExecucao.findFirst({
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        origem: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        totalSkus: true,
        totalDivergencias: true,
        totalSemDivergencia: true,
        emailDestinatario: true,
        emailEnviado: true,
        emailErro: true,
        erro: true,
        resumo: true,
      },
    });

    res.json({
      auditoriaAtiva: cfg.auditoriaAtiva,
      auditoriaHorario: cfg.auditoriaHorario,
      auditoriaEmailDestinatario: cfg.auditoriaEmailDestinatario,
      auditoriaResendFrom: cfg.auditoriaResendFrom,
      auditoriaTamanhoLote: cfg.auditoriaTamanhoLote,
      auditoriaPausaMs: cfg.auditoriaPausaMs,
      resendApiKeyConfigured: !!cfg.auditoriaResendApiKey,
      auditoriaUltimaExecucaoChave: cfg.auditoriaUltimaExecucaoChave,
      auditoriaUltimaExecucaoEm: cfg.auditoriaUltimaExecucaoEm,
      executandoAgora: auditoriaSchedulerState.running,
      ultimaExecucao,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/auditoria-automatica/config', async (req, res, next) => {
  try {
    const auditoriaAtiva = !!req.body?.auditoriaAtiva;
    const auditoriaHorario = normalizeHorarioAuditoria(req.body?.auditoriaHorario);
    const auditoriaEmailDestinatario = String(req.body?.auditoriaEmailDestinatario || '').trim();
    const auditoriaResendFrom = String(req.body?.auditoriaResendFrom || AUDITORIA_DEFAULT_EMAIL_FROM).trim() || AUDITORIA_DEFAULT_EMAIL_FROM;
    const auditoriaTamanhoLote = Math.max(10, Math.min(500, Math.round(toNumber(req.body?.auditoriaTamanhoLote, AUDITORIA_DEFAULT_TAMANHO_LOTE))));
    const auditoriaPausaMs = Math.max(0, Math.min(15000, Math.round(toNumber(req.body?.auditoriaPausaMs, AUDITORIA_DEFAULT_PAUSA_MS))));
    const auditoriaResendApiKey = String(req.body?.auditoriaResendApiKey || '').trim();

    const data: any = {
      auditoriaAtiva,
      auditoriaHorario,
      auditoriaEmailDestinatario,
      auditoriaResendFrom,
      auditoriaTamanhoLote,
      auditoriaPausaMs,
    };

    if (auditoriaResendApiKey) {
      data.auditoriaResendApiKey = auditoriaResendApiKey;
    }

    await saveConfig(data);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/auditoria-automatica/execucoes', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(50, Math.round(toNumber(req.query?.limit, 20))));
    const execucoes = await prisma.auditoriaAutomaticaExecucao.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        origem: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        totalSkus: true,
        totalDivergencias: true,
        totalSemDivergencia: true,
        emailDestinatario: true,
        emailEnviado: true,
        emailErro: true,
        erro: true,
        resumo: true,
      },
    });

    res.json({ ok: true, execucoes });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/auditoria-automatica/execucoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido' });

    const execucao = await prisma.auditoriaAutomaticaExecucao.findUnique({
      where: { id },
    });

    if (!execucao) return res.status(404).json({ error: 'Execucao nao encontrada' });
    res.json({ ok: true, execucao });
  } catch (e) {
    next(e);
  }
});

blingRouter.delete('/auditoria-automatica/execucoes', async (_req, res, next) => {
  try {
    if (auditoriaSchedulerState.running) {
      return res.status(409).json({ error: 'Nao e possivel limpar o historico durante uma execucao em andamento' });
    }

    const deleted = await prisma.auditoriaAutomaticaExecucao.deleteMany({});
    res.json({ ok: true, deleted: deleted.count });
  } catch (e) {
    next(e);
  }
});

blingRouter.delete('/auditoria-automatica/execucoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido' });

    const execucao = await prisma.auditoriaAutomaticaExecucao.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!execucao) {
      return res.status(404).json({ error: 'Execucao nao encontrada' });
    }

    if (execucao.status === 'executando' && auditoriaSchedulerState.running) {
      return res.status(409).json({ error: 'Nao e possivel excluir uma execucao em andamento' });
    }

    await prisma.auditoriaAutomaticaExecucao.delete({
      where: { id },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/auditoria-automatica/executar', async (_req, res, next) => {
  try {
    if (auditoriaSchedulerState.running) {
      return res.status(409).json({ error: 'Ja existe uma auditoria em andamento' });
    }

    auditoriaSchedulerState.running = true;
    try {
      const execucao = await executeAuditoriaAutomatica('manual');
      res.json({ ok: true, execucao });
    } finally {
      auditoriaSchedulerState.running = false;
    }
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

    const [existentes, motos] = await Promise.all([
      prisma.peca.findMany({ select: { idPeca: true } }),
      prisma.moto.findMany({
        select: { id: true, marca: true, modelo: true },
      }),
    ]);
    const skusExistentes = new Set(existentes.map((peca) => peca.idPeca));
    const motosMap = new Map(motos.map((moto) => [moto.id, moto]));

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

        const moto = motoId ? motosMap.get(Number(motoId)) : null;

        const qtdEstoque = Number(produto.estoque?.saldoVirtualTotal || produto.estoque?.saldo || 0);
        const localizacao = resolveBlingLocation(produto).location;

        itens.push({
          id: produto.id,
          sku,
          nome: produto.nome || '',
          localizacao,
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
      const resultado = await compareProdutosBlingCodes(codigos, {
        syncLocalizacao: true,
      });
      res.json(resultado);
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
    const anuncioStatusData = await collectMercadoLivreStatusByProductIds([Number(produto.id)], true);
    const anuncioStatuses = anuncioStatusData.statuses;
    const produtoLojaLinks = await blingReq(`/produtos/lojas?pagina=1&limite=100&idProduto=${Number(produto.id)}`) as any;
    const lojaRows = normalizeApiArray(produtoLojaLinks?.data);
    const targetLojaIds = Array.from(new Set(
      lojaRows
        .map((row: any) => Number(row?.loja?.id || row?.idLoja || 0))
        .filter((id: number): id is number => Number.isFinite(id) && id > 0),
    ));
    const anunciosStoreWideDebug: Array<{
      lojaId: number;
      situacao: number;
      total: number;
      sample: Array<{ id: number | null; titulo: string | null; situacao: any }>;
      matchesByTitle: Array<{
        id: number | null;
        titulo: string | null;
        situacao: any;
        detalhe?: any;
      }>;
      error?: string | null;
    }> = [];

    for (const lojaId of targetLojaIds) {
      for (const situacao of MERCADO_LIVRE_SITUACOES) {
        try {
          const anuncios = await listMercadoLivreAnunciosByStoreSituation(lojaId, situacao);
          const matches = anuncios.filter((anuncio) => isLikelySameAnuncioTitle(produto.nome || '', String(anuncio?.titulo || '')));
          const detailedMatches = [];

          for (const anuncio of matches.slice(0, 5)) {
            let detalheAnuncio = null;
            const anuncioId = Number(anuncio?.id || 0);
            if (anuncioId) {
              try {
                detalheAnuncio = await getMercadoLivreAnuncioDetail(anuncioId, lojaId);
              } catch (detailError: any) {
                detalheAnuncio = { error: detailError?.message || String(detailError) };
              }
            }

            detailedMatches.push({
              id: anuncioId || null,
              titulo: String(anuncio?.titulo || '') || null,
              situacao: anuncio?.situacao ?? null,
              detalhe: detalheAnuncio,
            });
          }

          anunciosStoreWideDebug.push({
            lojaId,
            situacao,
            total: anuncios.length,
            sample: anuncios.slice(0, 5).map((anuncio) => ({
              id: Number(anuncio?.id) || null,
              titulo: String(anuncio?.titulo || '') || null,
              situacao: anuncio?.situacao ?? null,
            })),
            matchesByTitle: detailedMatches,
            error: null,
          });
        } catch (e: any) {
          anunciosStoreWideDebug.push({
            lojaId,
            situacao,
            total: -1,
            sample: [],
            matchesByTitle: [],
            error: e?.message || String(e),
          });
        }

        await sleep(120);
      }
    }
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
      produtoLojaLinks: lojaRows,
      statusAnunciosApi: anuncioStatuses.get(Number(produto.id)) || null,
      anunciosApiDebug: anuncioStatusData.debugByProductId.get(Number(produto.id)) || null,
      anunciosStoreWideDebug,
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
    const { id, sku, nome, preco, motoId, frete, taxaPct, qtd, localizacao } = req.body;
    if (!motoId) return res.status(400).json({ error: 'motoId obrigatorio' });

    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const precoML = toNumber(preco);
    const freteN = roundMoney(toNumber(frete, defaults.fretePadrao) || defaults.fretePadrao);
    const taxa = roundMoney(toNumber(taxaPct, defaults.taxaPadraoPct) || defaults.taxaPadraoPct);
    const { taxaValor, valorLiq } = calculateFinancials(precoML, freteN, taxa);
    const quantidade = Math.max(1, Number(qtd) || 1);
    let localizacaoNormalizada = normalizeLocation(localizacao);

    if (!localizacaoNormalizada && Number(id) > 0) {
      try {
        const detail = await fetchBlingProductDetailById(Number(id));
        localizacaoNormalizada = resolveBlingLocation(null, detail).location;
      } catch {
        localizacaoNormalizada = null;
      }
    }

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
          localizacao: localizacaoNormalizada,
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
