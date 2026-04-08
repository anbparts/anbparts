import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
  DEFAULT_RESEND_FROM,
  getConfiguracaoGeral,
  saveConfiguracaoGeral,
} from '../lib/configuracoes-gerais';
import { buildQuestionEmailSubject, sendResendEmail } from '../lib/email';

export const mercadoLivreRouter = Router();

const MERCADO_LIVRE_API = 'https://api.mercadolibre.com';
const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const MERCADO_LIVRE_AUTH = 'https://auth.mercadolivre.com.br/authorization';
const MERCADO_PAGO_AUTH = 'https://auth.mercadopago.com.br/authorization';
const MERCADO_LIVRE_TOKEN = `${MERCADO_LIVRE_API}/oauth/token`;
const MERCADO_PAGO_TOKEN = `${MERCADO_PAGO_API}/oauth/token`;
const MERCADO_LIVRE_SITE_ID = 'MLB';
const MERCADO_LIVRE_SCHEDULER_INTERVAL_MS = 60 * 1000;
const MERCADO_LIVRE_QUESTIONS_PAGE_LIMIT = 50;
const MERCADO_LIVRE_SALDO_CACHE_TTL_MS = 2 * 60 * 1000;

const schedulerState = {
  started: false,
  running: false,
};

const saldoCacheState: {
  expiresAt: number;
  value: any | null;
  inFlight: Promise<any> | null;
} = {
  expiresAt: 0,
  value: null,
  inFlight: null,
};

const mercadoPagoOAuthState = {
  value: '',
  createdAt: 0,
};

function clearSaldoCache() {
  saldoCacheState.expiresAt = 0;
  saldoCacheState.value = null;
  saldoCacheState.inFlight = null;
}

const configSchema = z.object({
  clientId: z.string().trim().optional(),
  clientSecret: z.string().trim().optional(),
  mercadoPagoClientId: z.string().trim().optional(),
  mercadoPagoClientSecret: z.string().trim().optional(),
});

const answerSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

function normalizeText(value: any) {
  return String(value ?? '').trim();
}

function getPublicBackendBase(req?: any) {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, '');
  if (process.env.BACKEND_PUBLIC_URL) return process.env.BACKEND_PUBLIC_URL.replace(/\/$/, '');
  if (!req) return 'http://localhost:3333';
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.get?.('host') || 'localhost:3333';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getCallbackUrl(req?: any) {
  if (process.env.MERCADO_LIVRE_REDIRECT_URI) return process.env.MERCADO_LIVRE_REDIRECT_URI;
  return `${getPublicBackendBase(req)}/mercado-livre/callback`;
}

function getMercadoPagoCallbackUrl(req?: any) {
  if (process.env.MERCADO_PAGO_REDIRECT_URI) return process.env.MERCADO_PAGO_REDIRECT_URI;
  return `${getPublicBackendBase(req)}/mercado-livre/mercado-pago/callback`;
}

async function getMercadoLivreConfig() {
  let config = await prisma.mercadoLivreConfig.findFirst();
  if (!config) {
    config = await prisma.mercadoLivreConfig.create({ data: { siteId: MERCADO_LIVRE_SITE_ID } });
  }
  return config;
}

async function saveMercadoLivreConfig(data: Record<string, any>) {
  const current = await getMercadoLivreConfig();
  return prisma.mercadoLivreConfig.update({
    where: { id: current.id },
    data,
  });
}

function extractArray(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.questions)) return payload.questions;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function extractQuestionDate(value: any) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractQuestionStatus(question: any) {
  return (
    normalizeText(question?.status || (question?.answer?.text || question?.answer?.message ? 'ANSWERED' : 'UNANSWERED'))
      || 'UNANSWERED'
  ).toUpperCase();
}

function formatDateTimePtBr(value: Date | string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function mercadoLivreTokenRequest(body: Record<string, any>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined && String(value) !== '') {
      params.set(key, String(value));
    }
  }

  const response = await fetch(MERCADO_LIVRE_TOKEN, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || payload?.error || `Mercado Livre token ${response.status}`);
  }

  return payload;
}

async function mercadoPagoTokenRequest(body: Record<string, any>) {
  const response = await fetch(MERCADO_PAGO_TOKEN, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || payload?.error || `Mercado Pago token ${response.status}`);
  }

  return payload;
}

async function refreshMercadoLivreToken() {
  const config = await getMercadoLivreConfig();
  if (!config.refreshToken) throw new Error('Sem refresh token do Mercado Livre. Reconecte a conta.');
  if (!config.clientId || !config.clientSecret) throw new Error('Credenciais do Mercado Livre nao configuradas.');

  const payload = await mercadoLivreTokenRequest({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  await saveMercadoLivreConfig({
    accessToken: normalizeText(payload.access_token),
    refreshToken: normalizeText(payload.refresh_token) || config.refreshToken,
    connectedAt: new Date(),
  });

  return normalizeText(payload.access_token);
}

async function refreshMercadoPagoToken() {
  const config = await getMercadoLivreConfig();
  if (!normalizeText(config.mercadoPagoRefreshToken)) {
    throw new Error('Sem refresh token do Mercado Pago. Reconecte a conta.');
  }
  if (!normalizeText(config.mercadoPagoClientId) || !normalizeText(config.mercadoPagoClientSecret)) {
    throw new Error('Credenciais do Mercado Pago nao configuradas.');
  }

  const payload = await mercadoPagoTokenRequest({
    grant_type: 'refresh_token',
    client_id: config.mercadoPagoClientId,
    client_secret: config.mercadoPagoClientSecret,
    refresh_token: config.mercadoPagoRefreshToken,
  });

  await saveMercadoLivreConfig({
    mercadoPagoAccessToken: normalizeText(payload.access_token),
    mercadoPagoRefreshToken: normalizeText(payload.refresh_token) || config.mercadoPagoRefreshToken,
    mercadoPagoConnectedAt: new Date(),
    mercadoPagoUserId: normalizeText(payload.user_id) || config.mercadoPagoUserId,
  });
  clearSaldoCache();

  return normalizeText(payload.access_token);
}

async function mercadoLivreReq(path: string, options: RequestInit = {}, allowRefresh = true) {
  const config = await getMercadoLivreConfig();
  const token = normalizeText(config.accessToken);
  if (!token) throw new Error('Mercado Livre nao conectado.');
  const url = /^https?:\/\//i.test(path) ? path : `${MERCADO_LIVRE_API}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && allowRefresh && config.refreshToken) {
    const refreshedToken = await refreshMercadoLivreToken();
    return fetch(url, {
      ...options,
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${refreshedToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }).then(async (retryResponse) => {
      const retryPayload: any = await retryResponse.json().catch(() => ({}));
      if (!retryResponse.ok) {
        throw new Error(retryPayload?.message || retryPayload?.error || `Mercado Livre API ${retryResponse.status}`);
      }
      return retryPayload;
    });
  }

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Mercado Livre API ${response.status}`);
  }
  return payload;
}

async function getMercadoPagoMeWithToken(accessToken: string) {
  const response = await fetch(`${MERCADO_LIVRE_API}/users/me`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Mercado Pago user ${response.status}`);
  }

  return payload;
}

async function mercadoPagoReq(path: string, options: RequestInit = {}, allowReconnect = true) {
  const response = await mercadoPagoFetch(path, options, allowReconnect);
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Mercado Pago API ${response.status}`);
  }
  return payload;
}

async function mercadoPagoFetch(path: string, options: RequestInit = {}, allowReconnect = true): Promise<Response> {
  const config = await getMercadoLivreConfig();
  let token = normalizeText(config.mercadoPagoAccessToken);

  if (!token) {
    if (normalizeText(config.mercadoPagoRefreshToken)) {
      token = await refreshMercadoPagoToken();
    } else {
      throw new Error('Conecte o Mercado Pago com a autorizacao da conta em Config. ML.');
    }
  }

  const url = /^https?:\/\//i.test(path) ? path : `${MERCADO_PAGO_API}${path}`;
  const execute = (bearer: string) => fetch(url, {
    ...options,
    headers: {
      accept: options.headers && 'accept' in (options.headers as any) ? (options.headers as any).accept : 'application/json',
      Authorization: `Bearer ${bearer}`,
      'Content-Type': options.headers && 'Content-Type' in (options.headers as any)
        ? (options.headers as any)['Content-Type']
        : 'application/json',
      ...(options.headers || {}),
    },
  });

  let response = await execute(token);
  if (response.status !== 401 || !allowReconnect) return response;

  const refreshedToken = await refreshMercadoPagoToken();
  response = await execute(refreshedToken);
  return response;
}

function normalizeMoney(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    const normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
      : cleaned.replace(/,/g, '').replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const direct: number | null = normalizeMoney((value as any).amount ?? (value as any).value ?? (value as any).total);
    if (direct !== null) return direct;
  }
  return null;
}

function normalizeKey(value: any) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSaoPauloOffset() {
  return '-03:00';
}

function getSaoPauloNowParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function getMercadoPagoReportRange(daysBack = 0) {
  const reference = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const now = getSaoPauloNowParts(reference);
  const formatUtc = (dateText: string) => new Date(`${dateText}${getSaoPauloOffset()}`).toISOString().replace('.000Z', 'Z');
  return {
    beginDate: formatUtc(`${now.year}-${now.month}-${now.day}T00:00:00`),
    endDate: formatUtc(`${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}:${now.second}`),
  };
}

function detectCsvDelimiter(headerLine: string) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.replace(/^\uFEFF/, '').trim());
}

function normalizeReportHeader(value: string) {
  const key = normalizeKey(value).replace(/^_+|_+$/g, '');
  if (!key) return '';
  if (key.includes('record_type') || key.includes('tipo_de_registro')) return 'record_type';
  if (key.includes('balance_amount') || key === 'saldo' || key === 'balance') return 'balance_amount';
  if (key.includes('settlement_net_amount')) return 'settlement_net_amount';
  if (key.includes('net_credit_amount')) return 'net_credit_amount';
  if (key.includes('net_debit_amount')) return 'net_debit_amount';
  if (key.includes('money_release_date') || key.includes('data_de_liberacao_do_dinheiro')) return 'money_release_date';
  if (key.includes('settlement_date') || key.includes('data_de_liquidacao')) return 'settlement_date';
  if (key.includes('transaction_type') || key.includes('tipo_de_transacao')) return 'transaction_type';
  if (key.includes('description') || key.includes('descricao') || key.includes('descripcion')) return 'description';
  return key;
}

function parseCsvReport(text: string) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  if (!lines.length) return [] as Array<Record<string, string>>;

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeReportHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = values[index] || '';
    });
    return row;
  });
}

function extractReportEndingBalance(rows: Array<Record<string, string>>) {
  const totalRows = rows.filter((row) => normalizeKey(row.record_type).includes('total'));
  const candidates = totalRows.length ? totalRows : rows;

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const row = candidates[i];
    const direct =
      normalizeMoney(row.balance_amount)
      ?? normalizeMoney(row.settlement_net_amount)
      ?? normalizeMoney(row.net_credit_amount);
    if (direct !== null) return direct;
  }

  return 0;
}

async function mercadoPagoDownloadText(path: string) {
  const response = await mercadoPagoFetch(path, {
    headers: {
      accept: 'text/plain',
      'Content-Type': 'text/plain',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Mercado Pago API ${response.status}`);
  }
  return text;
}

async function createMercadoPagoReport(reportType: 'release' | 'settlement', beginDate: string, endDate: string) {
  const reportSlug = reportType === 'release' ? 'release_report' : 'settlement_report';
  const payload = await mercadoPagoReq(`/v1/account/${reportSlug}`, {
    method: 'POST',
    body: JSON.stringify({
      begin_date: beginDate,
      end_date: endDate,
    }),
  });

  return normalizeText(payload?.task_id || payload?.id || payload?.taskId);
}

async function waitMercadoPagoReportFileName(reportType: 'release' | 'settlement', taskId: string) {
  const reportSlug = reportType === 'release' ? 'release_report' : 'settlement_report';
  if (!taskId) throw new Error(`Nao foi possivel iniciar o relatorio ${reportSlug}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await mercadoPagoReq(`/v1/account/${reportSlug}/task/${encodeURIComponent(taskId)}`);
    const fileName = normalizeText(payload?.file_name || payload?.fileName);
    const status = normalizeKey(payload?.status);
    if (fileName) return fileName;
    if (status.includes('failed') || status.includes('error')) {
      throw new Error(`Falha ao gerar relatorio ${reportSlug}`);
    }
    await delay(2000);
  }

  throw new Error(`Tempo excedido ao gerar relatorio ${reportSlug}`);
}

async function downloadMercadoPagoReportRows(reportType: 'release' | 'settlement', daysBack: number) {
  const reportSlug = reportType === 'release' ? 'release_report' : 'settlement_report';
  const { beginDate } = getMercadoPagoReportRange(daysBack);
  const { endDate } = getMercadoPagoReportRange(0);
  const taskId = await createMercadoPagoReport(reportType, beginDate, endDate);
  const fileName = await waitMercadoPagoReportFileName(reportType, taskId);

  if (!fileName) {
    throw new Error(`Nao foi possivel obter o arquivo do relatorio ${reportSlug}`);
  }

  const text = await mercadoPagoDownloadText(`/v1/account/${reportSlug}/${encodeURIComponent(fileName)}`);
  return parseCsvReport(text);
}

export async function loadMercadoLivreSaldoResumo(forceRefresh = false) {
  const config = await getMercadoLivreConfig();

  if (!normalizeText(config.mercadoPagoClientId) || !normalizeText(config.mercadoPagoClientSecret)) {
    return {
      connected: false,
      error: 'Mercado Pago nao configurado.',
      consultadoEm: new Date().toISOString(),
    };
  }

  if (!normalizeText(config.mercadoPagoRefreshToken)) {
    return {
      connected: false,
      error: 'Conecte o Mercado Pago com a autorizacao da conta em Config. ML.',
      consultadoEm: new Date().toISOString(),
    };
  }

  if (!forceRefresh && saldoCacheState.value && saldoCacheState.expiresAt > Date.now()) {
    return saldoCacheState.value;
  }

  if (!forceRefresh && saldoCacheState.inFlight) {
    return saldoCacheState.inFlight;
  }

  saldoCacheState.inFlight = (async () => {
    let lastError: any = null;

    try {
      const [releaseRows, settlementRows] = await Promise.all([
        downloadMercadoPagoReportRows('release', 15),
        downloadMercadoPagoReportRows('settlement', 60),
      ]);

      const now = new Date();
      const saldoDisponivel = extractReportEndingBalance(releaseRows);

      const futureSettlements = settlementRows
        .map((row) => {
          const releaseDateText = normalizeText(row.money_release_date || row.settlement_date);
          const releaseDate = releaseDateText ? new Date(releaseDateText) : null;
          const amount =
            normalizeMoney(row.settlement_net_amount)
            ?? normalizeMoney(row.net_credit_amount)
            ?? 0;
          return {
            releaseDate,
            amount,
            transactionType: normalizeKey(row.transaction_type),
            description: normalizeKey(row.description),
          };
        })
        .filter((row) => row.releaseDate && !Number.isNaN(row.releaseDate.getTime()) && row.releaseDate > now && row.amount > 0);

      const saldoALiberar = futureSettlements.reduce((sum, row) => sum + row.amount, 0);
      const saldoAntecipavel = futureSettlements
        .filter((row) => !row.description.includes('chargeback') && !row.description.includes('refund'))
        .reduce((sum, row) => sum + row.amount, 0);

      const resumo = {
        connected: true,
        source: 'mercado_pago_reports',
        currencyId: 'BRL',
        saldoDisponivel,
        saldoALiberar,
        saldoAntecipavel,
        saldoAntecipavelInferido: true,
        consultadoEm: new Date().toISOString(),
      };
      saldoCacheState.value = resumo;
      saldoCacheState.expiresAt = Date.now() + MERCADO_LIVRE_SALDO_CACHE_TTL_MS;
      return resumo;
    } catch (error: any) {
      lastError = error;
    }

    const fallback = {
      connected: true,
      error: normalizeText(lastError?.message) || 'Nao foi possivel consultar o saldo do Mercado Pago.',
      consultadoEm: new Date().toISOString(),
    };
    saldoCacheState.value = fallback;
    saldoCacheState.expiresAt = Date.now() + 30 * 1000;
    return fallback;
  })();

  try {
    return await saldoCacheState.inFlight;
  } finally {
    saldoCacheState.inFlight = null;
  }
}

async function getMercadoLivreMe() {
  return mercadoLivreReq('/users/me');
}

async function getMercadoPagoMe() {
  return mercadoPagoReq(`${MERCADO_LIVRE_API}/users/me`);
}

async function getMercadoLivreUser(userId: string) {
  if (!userId) return null;
  try {
    return await mercadoLivreReq(`/users/${encodeURIComponent(userId)}`);
  } catch {
    return null;
  }
}

async function getMercadoLivreItem(itemId: string) {
  if (!itemId) return null;
  try {
    return await mercadoLivreReq(`/items/${encodeURIComponent(itemId)}`);
  } catch {
    return null;
  }
}

function getItemSku(item: any) {
  const directCandidates = [
    item?.seller_custom_field,
    item?.seller_sku,
    item?.sku,
    item?.custom_sku,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (directCandidates.length) return directCandidates[0];

  const attributes = Array.isArray(item?.attributes) ? item.attributes : [];
  const attributeMatch = attributes.find((attribute: any) => {
    const id = normalizeText(attribute?.id).toUpperCase();
    return ['SELLER_SKU', 'SKU', 'PART_NUMBER'].includes(id);
  });

  return normalizeText(attributeMatch?.value_name || attributeMatch?.value_struct?.number || attributeMatch?.value_id || '');
}

async function fetchMercadoLivreQuestionsPage(sellerId: string, offset = 0) {
  const params = new URLSearchParams({
    seller_id: sellerId,
    api_version: '4',
    limit: String(MERCADO_LIVRE_QUESTIONS_PAGE_LIMIT),
    offset: String(Math.max(0, offset)),
  });

  return mercadoLivreReq(`/questions/search?${params.toString()}`);
}

async function resolveQuestionContext(question: any) {
  const itemId = normalizeText(question?.item_id || question?.itemId);
  const fromId = normalizeText(question?.from?.id);
  const [item, user] = await Promise.all([
    getMercadoLivreItem(itemId),
    fromId ? getMercadoLivreUser(fromId) : Promise.resolve(null),
  ]);

  const sku = getItemSku(item);
  const peca = sku
    ? await prisma.peca.findFirst({
        where: { idPeca: { equals: sku, mode: 'insensitive' } },
        select: { id: true, idPeca: true, descricao: true, motoId: true },
      })
    : null;

  const nomeCliente = normalizeText(
    question?.from?.nickname
    || question?.from?.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.nickname
    || '',
  );

  return {
    item,
    user,
    sku: sku || peca?.idPeca || '',
    peca,
    nomeCliente,
  };
}

async function upsertMercadoLivrePergunta(question: any) {
  const questionId = normalizeText(question?.id);
  if (!questionId) return null;

  const context = await resolveQuestionContext(question);
  const answerText = normalizeText(question?.answer?.text || question?.answer?.message);
  const respondidaEm = extractQuestionDate(question?.answer?.date_created || question?.answer?.created_at);
  const status = extractQuestionStatus(question);
  const dataPergunta = extractQuestionDate(question?.date_created || question?.created_at);
  const itemId = normalizeText(question?.item_id || question?.itemId);
  const itemTitle = normalizeText(context.item?.title);
  const itemLink = normalizeText(context.item?.permalink);
  const descricao = context.peca?.descricao || itemTitle || normalizeText(question?.item?.title);

  const payload = {
    itemId: itemId || null,
    status,
    texto: normalizeText(question?.text),
    respostaTexto: answerText || null,
    dataPergunta,
    respondidaEm,
    clienteId: normalizeText(question?.from?.id) || null,
    nomeCliente: context.nomeCliente || null,
    sku: context.sku || null,
    idPeca: context.peca?.idPeca || context.sku || null,
    pecaId: context.peca?.id || null,
    descricao: descricao || null,
    tituloAnuncio: itemTitle || null,
    linkAnuncio: itemLink || null,
    raw: {
      question,
      item: context.item,
      user: context.user,
    },
  };

  const existing = await prisma.mercadoLivrePergunta.findUnique({
    where: { questionId },
    select: { id: true, notificadaEm: true, status: true },
  });

  const effectiveStatus = String(existing?.status || '').toUpperCase() === 'DISMISSED'
    ? 'DISMISSED'
    : status;

  const saved = existing
    ? await prisma.mercadoLivrePergunta.update({
        where: { questionId },
        data: {
          ...payload,
          status: effectiveStatus,
        },
      })
    : await prisma.mercadoLivrePergunta.create({
        data: {
          questionId,
          ...payload,
          status: effectiveStatus,
        },
      });

  return {
    saved,
    isNew: !existing,
  };
}

async function syncMercadoLivrePerguntas(options?: { sendEmail?: boolean }) {
  const config = await getMercadoLivreConfig();
  const sellerId = normalizeText(config.sellerId);
  const activeSellerId = sellerId || normalizeText((await getMercadoLivreMe())?.id);
  if (!activeSellerId) {
    return { ok: false, reason: 'sem_seller_id', total: 0, novas: 0, perguntas: [] as any[] };
  }

  if (activeSellerId !== sellerId) {
    const me = await getMercadoLivreMe();
    await saveMercadoLivreConfig({
      sellerId: normalizeText(me?.id),
      nickname: normalizeText(me?.nickname),
      siteId: normalizeText(me?.site_id) || MERCADO_LIVRE_SITE_ID,
      connectedAt: new Date(),
    });
  }

  const existingRows = await prisma.mercadoLivrePergunta.findMany({
    select: { id: true, questionId: true, status: true, notificadaEm: true },
  });
  const existingMap = new Map(existingRows.map((row) => [row.questionId, row]));
  const seenQuestionIds = new Set<string>();
  const savedRows: any[] = [];
  const perguntasParaNotificar: any[] = [];

  let offset = 0;
  let total = 0;

  while (true) {
    const payload = await fetchMercadoLivreQuestionsPage(activeSellerId, offset);
    const questions = extractArray(payload);
    total = Math.max(Number(payload?.total) || 0, total);
    if (!questions.length) break;

    for (const question of questions) {
      const questionId = normalizeText(question?.id);
      if (!questionId) continue;

      seenQuestionIds.add(questionId);

      const incomingStatus = extractQuestionStatus(question);
      const existing = existingMap.get(questionId);
      const existingStatus = normalizeText(existing?.status).toUpperCase();
      const mustTrackQuestion =
        incomingStatus === 'UNANSWERED'
        || incomingStatus === 'DISMISSED'
        || existingStatus === 'UNANSWERED'
        || existingStatus === 'DISMISSED';

      if (!mustTrackQuestion) continue;

      const result = await upsertMercadoLivrePergunta(question);
      if (!result?.saved) continue;

      savedRows.push(result.saved);
      existingMap.set(questionId, {
        id: result.saved.id,
        questionId,
        status: result.saved.status,
        notificadaEm: result.saved.notificadaEm,
      });

      if (
        normalizeText(result.saved.status).toUpperCase() === 'UNANSWERED'
        && !result.saved.notificadaEm
      ) {
        perguntasParaNotificar.push(result.saved);
      }
    }

    offset += questions.length;
    if (offset >= total || questions.length < MERCADO_LIVRE_QUESTIONS_PAGE_LIMIT) {
      break;
    }
  }

  const pendentesNaoEncontradas = existingRows
    .filter((row) => normalizeText(row.status).toUpperCase() === 'UNANSWERED' && !seenQuestionIds.has(row.questionId))
    .map((row) => row.questionId);

  if (pendentesNaoEncontradas.length) {
    await prisma.mercadoLivrePergunta.updateMany({
      where: { questionId: { in: pendentesNaoEncontradas } },
      data: { status: 'SYNC_RESOLVED' },
    });
  }

  if (options?.sendEmail && perguntasParaNotificar.length) {
    await sendMercadoLivrePerguntasEmail(perguntasParaNotificar);
  }

  return {
    ok: true,
    total: seenQuestionIds.size,
    novas: perguntasParaNotificar.length,
    perguntas: savedRows,
  };
}

function buildPerguntasEmailHtml(perguntas: any[]) {
  const cards = perguntas.map((pergunta) => `
    <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:16px;padding:18px;margin-bottom:14px;">
      <div style="font-size:11px;color:#64748b;font-family:monospace;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;">Pergunta #${escapeHtml(pergunta.questionId)}</div>
      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">${escapeHtml(pergunta.idPeca || pergunta.sku || pergunta.tituloAnuncio || 'Sem identificacao')}</div>
      <div style="font-size:13px;color:#475569;line-height:1.65;margin-bottom:14px;">
        <strong>Cliente:</strong> ${escapeHtml(pergunta.nomeCliente || 'Nao identificado')}<br/>
        <strong>Produto:</strong> ${escapeHtml(pergunta.descricao || pergunta.tituloAnuncio || 'Sem descricao')}<br/>
        <strong>SKU / ID Peca:</strong> ${escapeHtml(pergunta.idPeca || pergunta.sku || '-')}<br/>
        <strong>Item ML:</strong> ${escapeHtml(pergunta.itemId || '-')}<br/>
        <strong>Recebida em:</strong> ${escapeHtml(formatDateTimePtBr(pergunta.dataPergunta))}
      </div>
      <div style="background:#f8fafc;border:1px solid #dbe3ef;border-radius:12px;padding:14px;">
        <div style="font-size:11px;color:#64748b;font-family:monospace;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;">Mensagem completa</div>
        <div style="font-size:14px;color:#0f172a;line-height:1.7;">${escapeHtml(pergunta.texto || '')}</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:980px;margin:0 auto;">
        <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:24px;margin-bottom:18px;">
          <div style="font-size:28px;font-weight:800;color:#dc2626;margin-bottom:8px;">ALERTA ANB Parts</div>
          <div style="font-size:16px;color:#334155;margin-bottom:8px;">Perguntas recebidas no Mercado Livre aguardando resposta</div>
          <div style="font-size:13px;color:#64748b;">Total de novas perguntas: ${perguntas.length}</div>
        </div>
        ${cards}
      </div>
    </div>
  `;
}

function buildPerguntasEmailText(perguntas: any[]) {
  return [
    'ALERTA ANB Parts',
    'Perguntas recebidas no Mercado Livre aguardando resposta',
    '',
    ...perguntas.flatMap((pergunta) => ([
      `Pergunta #${pergunta.questionId}`,
      `Cliente: ${pergunta.nomeCliente || 'Nao identificado'}`,
      `Produto: ${pergunta.descricao || pergunta.tituloAnuncio || 'Sem descricao'}`,
      `SKU / ID Peca: ${pergunta.idPeca || pergunta.sku || '-'}`,
      `Item ML: ${pergunta.itemId || '-'}`,
      `Recebida em: ${formatDateTimePtBr(pergunta.dataPergunta)}`,
      `Mensagem: ${pergunta.texto || ''}`,
      '',
    ])),
  ].join('\n');
}

async function sendMercadoLivrePerguntasEmail(perguntas: any[]) {
  const config = await getConfiguracaoGeral();
  if (!perguntas.length) return { sent: false, reason: 'sem_perguntas' as const };
  if (!config.resendApiKey || !config.emailRemetente || !config.mercadoLivrePerguntasEmailDestinatario) {
    return { sent: false, reason: 'configuracao_incompleta' as const };
  }

  await sendResendEmail({
    apiKey: config.resendApiKey,
    from: config.emailRemetente || DEFAULT_RESEND_FROM,
    to: config.mercadoLivrePerguntasEmailDestinatario,
    subject: buildQuestionEmailSubject(
      config.mercadoLivrePerguntasEmailTitulo,
      DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
      perguntas.map((item) => item.questionId),
    ),
    html: buildPerguntasEmailHtml(perguntas),
    text: buildPerguntasEmailText(perguntas),
  });

  const ids = perguntas.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length) {
    await prisma.mercadoLivrePergunta.updateMany({
      where: { id: { in: ids } },
      data: { notificadaEm: new Date() },
    });
  }

  return { sent: true, total: perguntas.length };
}

async function tickMercadoLivrePerguntasScheduler() {
  if (schedulerState.running) return;

  const [config, geral] = await Promise.all([getMercadoLivreConfig(), getConfiguracaoGeral()]);
  if (!geral.mercadoLivrePerguntasAtivo) return;
  if (!config.accessToken) return;

  const lastReadAt = geral.mercadoLivrePerguntasUltimaLeituraEm ? new Date(geral.mercadoLivrePerguntasUltimaLeituraEm) : null;
  const intervalMs = Math.max(1, Number(geral.mercadoLivrePerguntasIntervaloMin || 5)) * 60 * 1000;
  if (lastReadAt && Date.now() - lastReadAt.getTime() < intervalMs) return;

  schedulerState.running = true;
  try {
    const result = await syncMercadoLivrePerguntas({ sendEmail: true });
    await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: new Date() });

    if (result.novas > 0) {
      console.log(`[mercado-livre-perguntas] ${result.novas} nova(s) pergunta(s) processada(s)`);
      return;
    }

    console.log('[mercado-livre-perguntas] rotina executada sem novas perguntas');
  } finally {
    schedulerState.running = false;
  }
}

export function startMercadoLivreScheduler() {
  if (schedulerState.started) return;
  schedulerState.started = true;

  const runTick = () => {
    tickMercadoLivrePerguntasScheduler().catch((error) => {
      console.error('Falha na rotina de perguntas do Mercado Livre:', error);
      schedulerState.running = false;
    });
  };

  setTimeout(runTick, 20000);
  setInterval(runTick, MERCADO_LIVRE_SCHEDULER_INTERVAL_MS);
}

mercadoLivreRouter.get('/config', async (_req, res, next) => {
  try {
    const config = await getMercadoLivreConfig();
    res.json({
      clientId: config.clientId || '',
      clientSecretConfigured: !!config.clientSecret,
      hasTokens: !!config.accessToken,
      connectedAt: config.connectedAt,
      sellerId: config.sellerId || '',
      nickname: config.nickname || '',
      siteId: config.siteId || MERCADO_LIVRE_SITE_ID,
      mercadoPagoClientId: config.mercadoPagoClientId || '',
      mercadoPagoClientSecretConfigured: !!normalizeText(config.mercadoPagoClientSecret),
      mercadoPagoHasTokens: !!normalizeText(config.mercadoPagoAccessToken),
      mercadoPagoHasRefreshToken: !!normalizeText(config.mercadoPagoRefreshToken),
      mercadoPagoConnectedAt: config.mercadoPagoConnectedAt,
      mercadoPagoUserId: config.mercadoPagoUserId || '',
    });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/config', async (req, res, next) => {
  try {
    const payload = configSchema.parse(req.body || {});
    const dataToSave: Record<string, any> = {};

    const savingMercadoLivre = payload.clientId !== undefined || payload.clientSecret !== undefined;
    if (savingMercadoLivre) {
      if (!normalizeText(payload.clientId) || !normalizeText(payload.clientSecret)) {
        return res.status(400).json({ error: 'Preencha o Client ID e o Client Secret do Mercado Livre.' });
      }

      dataToSave.clientId = normalizeText(payload.clientId);
      dataToSave.clientSecret = normalizeText(payload.clientSecret);
      dataToSave.accessToken = '';
      dataToSave.refreshToken = '';
      dataToSave.connectedAt = null;
      dataToSave.sellerId = '';
      dataToSave.nickname = '';
    }

    const savingMercadoPago = payload.mercadoPagoClientId !== undefined || payload.mercadoPagoClientSecret !== undefined;
    if (savingMercadoPago) {
      if (!normalizeText(payload.mercadoPagoClientId) || !normalizeText(payload.mercadoPagoClientSecret)) {
        return res.status(400).json({ error: 'Preencha o Client ID e o Client Secret do Mercado Pago.' });
      }

      dataToSave.mercadoPagoClientId = normalizeText(payload.mercadoPagoClientId);
      dataToSave.mercadoPagoClientSecret = normalizeText(payload.mercadoPagoClientSecret);
      dataToSave.mercadoPagoAccessToken = '';
      dataToSave.mercadoPagoRefreshToken = '';
      dataToSave.mercadoPagoConnectedAt = null;
      dataToSave.mercadoPagoUserId = '';
    }

    if (!Object.keys(dataToSave).length) {
      return res.status(400).json({ error: 'Nenhuma credencial foi enviada para salvar.' });
    }

    await saveMercadoLivreConfig(dataToSave);
    clearSaldoCache();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/auth-url', async (req, res, next) => {
  try {
    const config = await getMercadoLivreConfig();
    if (!config.clientId) return res.status(400).json({ error: 'Configure o Client ID do Mercado Livre primeiro.' });

    const redirectUri = getCallbackUrl(req);
    const url = `${MERCADO_LIVRE_AUTH}?response_type=code&client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.json({ url });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/callback', async (req, res, next) => {
  try {
    const code = normalizeText(req.query?.code);
    if (!code) return res.status(400).send('Code nao recebido do Mercado Livre');

    const config = await getMercadoLivreConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(400).send('Credenciais do Mercado Livre nao configuradas');
    }

    const redirectUri = getCallbackUrl(req);
    const payload = await mercadoLivreTokenRequest({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const meResponse = await fetch(`${MERCADO_LIVRE_API}/users/me`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${normalizeText(payload.access_token)}`,
      },
    });
    const me: any = await meResponse.json().catch(() => ({}));

    await saveMercadoLivreConfig({
      accessToken: normalizeText(payload.access_token),
      refreshToken: normalizeText(payload.refresh_token),
      connectedAt: new Date(),
      sellerId: normalizeText(me?.id),
      nickname: normalizeText(me?.nickname),
      siteId: normalizeText(me?.site_id) || MERCADO_LIVRE_SITE_ID,
    });

    res.redirect(`${getFrontendBase()}/config-ml?mercadoLivre=connected`);
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/status', async (_req, res) => {
  try {
    const me = await getMercadoLivreMe();
    res.json({
      ok: true,
      sellerId: normalizeText(me?.id),
      nickname: normalizeText(me?.nickname),
      siteId: normalizeText(me?.site_id) || MERCADO_LIVRE_SITE_ID,
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Sem resposta do Mercado Livre' });
  }
});

mercadoLivreRouter.get('/mercado-pago/auth-url', async (req, res, next) => {
  try {
    const config = await getMercadoLivreConfig();
    if (!normalizeText(config.mercadoPagoClientId)) {
      return res.status(400).json({ error: 'Configure o Client ID do Mercado Pago primeiro.' });
    }

    const redirectUri = getMercadoPagoCallbackUrl(req);
    mercadoPagoOAuthState.value = randomUUID();
    mercadoPagoOAuthState.createdAt = Date.now();

    const url = `${MERCADO_PAGO_AUTH}?response_type=code&client_id=${encodeURIComponent(config.mercadoPagoClientId)}&platform_id=mp&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(mercadoPagoOAuthState.value)}`;
    res.json({ url });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/mercado-pago/callback', async (req, res, next) => {
  try {
    const error = normalizeText(req.query?.error);
    if (error) {
      return res.redirect(`${getFrontendBase()}/config-ml?mercadoPago=error&message=${encodeURIComponent(error)}`);
    }

    const code = normalizeText(req.query?.code);
    const state = normalizeText(req.query?.state);
    if (!code) return res.status(400).send('Code nao recebido do Mercado Pago');

    if (
      mercadoPagoOAuthState.value
      && (Date.now() - mercadoPagoOAuthState.createdAt) < 15 * 60 * 1000
      && state !== mercadoPagoOAuthState.value
    ) {
      return res.status(400).send('State invalido do Mercado Pago');
    }

    const config = await getMercadoLivreConfig();
    if (!normalizeText(config.mercadoPagoClientId) || !normalizeText(config.mercadoPagoClientSecret)) {
      return res.status(400).send('Credenciais do Mercado Pago nao configuradas');
    }

    const redirectUri = getMercadoPagoCallbackUrl(req);
    const payload = await mercadoPagoTokenRequest({
      grant_type: 'authorization_code',
      client_id: config.mercadoPagoClientId,
      client_secret: config.mercadoPagoClientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const accessToken = normalizeText(payload.access_token);
    if (!accessToken) {
      return res.status(400).send('Mercado Pago nao retornou access token');
    }

    const me = await getMercadoPagoMeWithToken(accessToken).catch(() => null);
    await saveMercadoLivreConfig({
      mercadoPagoAccessToken: accessToken,
      mercadoPagoRefreshToken: normalizeText(payload.refresh_token),
      mercadoPagoConnectedAt: new Date(),
      mercadoPagoUserId: normalizeText(payload.user_id) || normalizeText(me?.id),
    });
    clearSaldoCache();
    mercadoPagoOAuthState.value = '';
    mercadoPagoOAuthState.createdAt = 0;

    res.redirect(`${getFrontendBase()}/config-ml?mercadoPago=connected`);
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/mercado-pago/status', async (_req, res) => {
  try {
    const me = await getMercadoPagoMe();
    res.json({
      ok: true,
      userId: normalizeText(me?.id),
      nickname: normalizeText(me?.nickname),
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Sem resposta do Mercado Pago' });
  }
});

mercadoLivreRouter.get('/saldo', async (req, res, next) => {
  try {
    const forceRefresh = String(req.query?.refresh || '').trim() === '1';
    const saldo = await loadMercadoLivreSaldoResumo(forceRefresh);
    res.json(saldo);
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.delete('/disconnect', async (_req, res, next) => {
  try {
    await saveMercadoLivreConfig({
      accessToken: '',
      refreshToken: '',
      connectedAt: null,
      sellerId: '',
      nickname: '',
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.delete('/mercado-pago/disconnect', async (_req, res, next) => {
  try {
    await saveMercadoLivreConfig({
      mercadoPagoAccessToken: '',
      mercadoPagoRefreshToken: '',
      mercadoPagoConnectedAt: null,
      mercadoPagoUserId: '',
    });
    clearSaldoCache();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.get('/perguntas', async (_req, res, next) => {
  try {
    await syncMercadoLivrePerguntas({ sendEmail: false });
    const rows = await prisma.mercadoLivrePergunta.findMany({
      where: { status: 'UNANSWERED' },
    });
    rows.sort((a, b) => {
      const aDate = a.dataPergunta ? new Date(a.dataPergunta).getTime() : 0;
      const bDate = b.dataPergunta ? new Date(b.dataPergunta).getTime() : 0;
      if (aDate !== bDate) return bDate - aDate;
      return b.id - a.id;
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/perguntas/sync', async (_req, res, next) => {
  try {
    const result = await syncMercadoLivrePerguntas({ sendEmail: true });
    await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: new Date() });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/perguntas/:questionId/responder', async (req, res, next) => {
  try {
    const questionId = normalizeText(req.params.questionId);
    if (!questionId) return res.status(400).json({ error: 'Pergunta invalida' });

    const payload = answerSchema.parse(req.body || {});
    await mercadoLivreReq('/answers', {
      method: 'POST',
      body: JSON.stringify({
        question_id: Number(questionId),
        text: payload.text,
      }),
    });

    const updated = await prisma.mercadoLivrePergunta.upsert({
      where: { questionId },
      update: {
        status: 'ANSWERED',
        respostaTexto: payload.text,
        respondidaEm: new Date(),
      },
      create: {
        questionId,
        texto: '',
        status: 'ANSWERED',
        respostaTexto: payload.text,
        respondidaEm: new Date(),
      },
    });

    res.json({ ok: true, pergunta: updated });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.delete('/perguntas/:questionId', async (req, res, next) => {
  try {
    const questionId = normalizeText(req.params.questionId);
    if (!questionId) return res.status(400).json({ error: 'Pergunta invalida' });

    await mercadoLivreReq(`/questions/${encodeURIComponent(questionId)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const updated = await prisma.mercadoLivrePergunta.upsert({
      where: { questionId },
      update: {
        status: 'DISMISSED',
      },
      create: {
        questionId,
        texto: '',
        status: 'DISMISSED',
      },
    });

    res.json({ ok: true, pergunta: updated });
  } catch (e) {
    next(e);
  }
});
