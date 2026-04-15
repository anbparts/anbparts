import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
  DEFAULT_RESEND_FROM,
  getConfiguracaoGeral,
  saveConfiguracaoGeral,
} from '../lib/configuracoes-gerais';
import {
  buildQuestionEmailSubject,
  renderAlertEmailLayout,
  renderEmailBadge,
  renderEmailMetricCard,
  renderEmailPanel,
  sendResendEmail,
} from '../lib/email';

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
const MERCADO_PAGO_REPORT_GENERATION_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const MERCADO_PAGO_SALDO_AUTO_DEFAULT_HORARIO = '06:00';
const MERCADO_LIVRE_TIMEZONE = 'America/Sao_Paulo';
const MERCADO_PAGO_REPORT_WAIT_ATTEMPTS = 45;
const MERCADO_PAGO_REPORT_WAIT_DELAY_MS = 4000;

const schedulerState = {
  started: false,
  perguntasRunning: false,
  mercadoPagoSaldoRunning: false,
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

const mercadoPagoReportGenerationState: Record<'release' | 'settlement', {
  lastAttemptAt: number;
  inFlight: Promise<Array<Record<string, string>>> | null;
}> = {
  release: { lastAttemptAt: 0, inFlight: null },
  settlement: { lastAttemptAt: 0, inFlight: null },
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
  mercadoPagoAccessToken: z.string().trim().optional(),
});

const mercadoPagoRotinaSchema = z.object({
  ativo: z.boolean().optional(),
  horario: z.string().trim().optional(),
});

const mercadoPagoDespesaReportRequestSchema = z.object({
  ate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const mercadoPagoDespesaCsvPreviewSchema = z.object({
  fileName: z.string().trim().optional(),
  dataUrl: z.string().trim().min(1),
});

const mercadoPagoDespesaImportItemSchema = z.object({
  data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataHora: z.string().trim().min(1),
  detalhes: z.string().trim().min(1),
  categoria: z.string().trim().min(1),
  valor: z.number().positive(),
  fileName: z.string().trim().optional().nullable(),
  sourceId: z.string().trim().optional().nullable(),
  descriptionOriginal: z.string().trim().optional().nullable(),
  valorAssinado: z.number().negative(),
});

const mercadoPagoDespesaImportSchema = z.object({
  itens: z.array(mercadoPagoDespesaImportItemSchema).min(1),
});

const answerSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

function normalizeText(value: any) {
  return String(value ?? '').trim();
}

function normalizeHorario(value: any, fallback = MERCADO_PAGO_SALDO_AUTO_DEFAULT_HORARIO) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function getTimezoneDateParts(date = new Date(), timeZone = MERCADO_LIVRE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const find = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const year = find('year');
  const month = find('month');
  const day = find('day');
  const hour = find('hour');
  const minute = find('minute');

  return {
    dateKey: `${year}-${month}-${day}`,
    timeKey: `${hour}:${minute}`,
  };
}

function isScheduledMinute(currentTime: string, scheduledTime: string) {
  return currentTime === scheduledTime;
}

function msUntilNextMinuteTick() {
  const now = new Date();
  return ((60 - now.getSeconds()) * 1000) - now.getMilliseconds() + 250;
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

async function parseApiResponsePayload(response: Response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

function extractMercadoLivreApiErrorMessage(payload: any, status: number) {
  return normalizeText(
    payload?.message
    || payload?.error_description
    || payload?.error
    || payload?.cause?.[0]?.message
    || payload?.cause?.[0]?.code
    || `Mercado Livre API ${status}`,
  ) || `Mercado Livre API ${status}`;
}

function isMercadoLivreTokenError(status: number, payload: any) {
  const message = extractMercadoLivreApiErrorMessage(payload, status).toLowerCase();
  if (status === 401) return true;

  if (![400, 401, 403].includes(status)) return false;

  return [
    'invalid token',
    'invalid_token',
    'expired_token',
    'expired token',
    'token inválido',
    'token invalido',
    'token expired',
    'access token is not valid',
    'access token expired',
    'invalid access token',
  ].some((term) => message.includes(term));
}

async function mercadoLivreReq(path: string, options: RequestInit = {}, allowRefresh = true) {
  const config = await getMercadoLivreConfig();
  const token = normalizeText(config.accessToken);
  if (!token) throw new Error('Mercado Livre nao conectado.');
  const url = /^https?:\/\//i.test(path) ? path : `${MERCADO_LIVRE_API}${path}`;

  const execute = (bearer: string) => fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let response = await execute(token);
  let payload: any = await parseApiResponsePayload(response);

  if (isMercadoLivreTokenError(response.status, payload) && allowRefresh && config.refreshToken) {
    const refreshedToken = await refreshMercadoLivreToken();
    response = await execute(refreshedToken);
    payload = await parseApiResponsePayload(response);
  }

  if (!response.ok) {
    throw new Error(extractMercadoLivreApiErrorMessage(payload, response.status));
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

function readMercadoPagoBalanceValue(source: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), source);
    const parsed = normalizeMoney(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function loadMercadoPagoDirectBalance() {
  const candidates = [
    '/v1/account/balance',
    '/v1/account/balance?currency_id=BRL',
  ];

  let lastError: any = null;
  for (const path of candidates) {
    try {
      const payload = await mercadoPagoReq(path);
      const saldoDisponivel = readMercadoPagoBalanceValue(payload, [
        'available_balance',
        'available_balance.amount',
        'available_balance.balance',
        'balance.available_balance',
        'balance.available_balance.amount',
      ]);
      const saldoALiberar = readMercadoPagoBalanceValue(payload, [
        'total_amount',
        'total_amount.amount',
        'unavailable_balance',
        'unavailable_balance.amount',
        'pending_release_amount',
        'pending_release_amount.amount',
        'balance.total_amount',
        'balance.total_amount.amount',
      ]);
      const saldoAntecipavel = readMercadoPagoBalanceValue(payload, [
        'blocked_amount',
        'blocked_amount.amount',
        'blocked_balance',
        'blocked_balance.amount',
        'advanceable_amount',
        'advanceable_amount.amount',
        'anticipable_amount',
        'anticipable_amount.amount',
        'balance.blocked_amount',
        'balance.blocked_amount.amount',
      ]);

      if (saldoDisponivel === null && saldoALiberar === null && saldoAntecipavel === null) {
        throw new Error('Resposta da API de saldo sem campos reconhecidos.');
      }

      return {
        connected: true,
        source: 'mercado_pago_balance_api',
        currencyId: normalizeText(payload?.currency_id || payload?.currencyId || 'BRL') || 'BRL',
        saldoDisponivel,
        saldoALiberar,
        saldoAntecipavel,
        saldoAntecipavelInferido: false,
        saldoParcial: saldoALiberar === null || saldoAntecipavel === null,
        observacao: saldoALiberar === null || saldoAntecipavel === null
          ? 'Saldo consultado na API direta do Mercado Pago. Alguns campos nao vieram preenchidos.'
          : '',
        consultadoEm: new Date().toISOString(),
      };
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError || new Error('Nao foi possivel consultar o saldo direto do Mercado Pago.');
}

async function loadMercadoPagoDirectBalanceTrace() {
  const candidates = [
    '/v1/account/balance',
    '/v1/account/balance?currency_id=BRL',
  ];

  const traces = [] as any[];
  for (const path of candidates) {
    try {
      const payload = await mercadoPagoReq(path);
      traces.push({
        path,
        ok: true,
        parsed: {
          saldoDisponivel: readMercadoPagoBalanceValue(payload, [
            'available_balance',
            'available_balance.amount',
            'available_balance.balance',
            'balance.available_balance',
            'balance.available_balance.amount',
          ]),
          saldoALiberar: readMercadoPagoBalanceValue(payload, [
            'total_amount',
            'total_amount.amount',
            'unavailable_balance',
            'unavailable_balance.amount',
            'pending_release_amount',
            'pending_release_amount.amount',
            'balance.total_amount',
            'balance.total_amount.amount',
          ]),
          saldoAntecipavel: readMercadoPagoBalanceValue(payload, [
            'blocked_amount',
            'blocked_amount.amount',
            'blocked_balance',
            'blocked_balance.amount',
            'advanceable_amount',
            'advanceable_amount.amount',
            'anticipable_amount',
            'anticipable_amount.amount',
            'balance.blocked_amount',
            'balance.blocked_amount.amount',
          ]),
          currencyId: normalizeText(payload?.currency_id || payload?.currencyId || payload?.balance?.currency_id || ''),
        },
        payload,
      });
    } catch (error: any) {
      traces.push({
        path,
        ok: false,
        error: normalizeText(error?.message || error) || 'Falha sem mensagem',
      });
    }
  }

  return {
    ok: traces.some((trace) => trace.ok),
    traces,
    consultadoEm: new Date().toISOString(),
  };
}

async function getMercadoPagoAccessToken() {
  const config = await getMercadoLivreConfig();
  const token = normalizeText(config.mercadoPagoAccessToken);
  if (/^APP_(USR|TEST)-/i.test(token)) return token;
  if (token && !normalizeText(config.mercadoPagoRefreshToken)) {
    throw new Error('Configure o Access Token de producao do Mercado Pago em Config. ML.');
  }
  if (normalizeText(config.mercadoPagoRefreshToken)) {
    return refreshMercadoPagoToken();
  }
  throw new Error('Configure o Access Token de producao do Mercado Pago em Config. ML.');
}

async function mercadoPagoFetch(path: string, options: RequestInit = {}, allowReconnect = true): Promise<Response> {
  let token = await getMercadoPagoAccessToken();

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

function buildMercadoPagoReportConfig(reportType: 'release' | 'settlement') {
  const base = {
    file_name_prefix: reportType === 'release' ? 'anbparts-release-report' : 'anbparts-settlement-report',
    display_timezone: 'GMT-03',
    report_translation: 'pt',
    separator: ';',
    scheduled: false,
    frequency: {
      hour: 0,
      type: 'monthly',
      value: 1,
    },
  };

  if (reportType === 'release') {
    return {
      ...base,
      include_withdrawal_at_end: false,
      check_available_balance: false,
      compensate_detail: false,
      execute_after_withdrawal: false,
      columns: [
        { key: 'DATE' },
        { key: 'SOURCE_ID' },
        { key: 'DESCRIPTION' },
        { key: 'NET_CREDIT_AMOUNT' },
        { key: 'NET_DEBIT_AMOUNT' },
        { key: 'GROSS_AMOUNT' },
        { key: 'MP_FEE_AMOUNT' },
        { key: 'TAXES_AMOUNT' },
        { key: 'BALANCE_AMOUNT' },
        { key: 'PAYMENT_METHOD_TYPE' },
        { key: 'PURCHASE_ID' },
      ],
    };
  }

  return {
    ...base,
    header_language: 'pt',
    show_fee_prevision: false,
    show_chargeback_cancel: false,
    coupon_detailed: false,
    include_withdraw: false,
    shipping_detail: false,
    refund_detailed: false,
    columns: [
      { key: 'EXTERNAL_REFERENCE' },
      { key: 'SOURCE_ID' },
      { key: 'USER_ID' },
      { key: 'PAYMENT_METHOD_TYPE' },
      { key: 'PAYMENT_METHOD' },
      { key: 'SITE' },
      { key: 'TRANSACTION_TYPE' },
      { key: 'TRANSACTION_AMOUNT' },
      { key: 'TRANSACTION_CURRENCY' },
      { key: 'TRANSACTION_DATE' },
      { key: 'FEE_AMOUNT' },
      { key: 'MONEY_RELEASE_DATE' },
      { key: 'IS_RELEASED' },
      { key: 'SETTLEMENT_DATE' },
      { key: 'SETTLEMENT_NET_AMOUNT' },
      { key: 'SETTLEMENT_CURRENCY' },
      { key: 'REAL_AMOUNT' },
      { key: 'COUPON_AMOUNT' },
      { key: 'METADATA' },
      { key: 'MKP_FEE_AMOUNT' },
      { key: 'FINANCING_FEE_AMOUNT' },
      { key: 'SHIPPING_FEE_AMOUNT' },
      { key: 'TAXES_AMOUNT' },
      { key: 'INSTALLMENTS' },
      { key: 'ORDER_ID' },
      { key: 'SHIPPING_ID' },
      { key: 'SHIPMENT_MODE' },
      { key: 'PACK_ID' },
    ],
  };
}

function isMercadoPagoFreshReportPendingError(error: any) {
  const message = normalizeText(error?.message || error).toLowerCase();
  return message.includes('mercado pago recebeu a solicitacao de') && message.includes('ainda nao ficou disponivel');
}

async function syncMercadoPagoReportsNow() {
  let releaseRows: Array<Record<string, string>> = [];
  let waitingForNewRelease = false;

  try {
    releaseRows = await downloadMercadoPagoReportRowsWithConfig('release', 30, true, true);
  } catch (error: any) {
    if (!isMercadoPagoFreshReportPendingError(error)) throw error;
    waitingForNewRelease = true;
  }

  clearSaldoCache();
  const resumo = await loadMercadoLivreSaldoResumo(true);
  return {
    ok: true,
    releaseRows: releaseRows.length,
    settlementRows: 0,
    waitingForNewRelease,
    saldo: resumo,
  };
}

async function ensureMercadoPagoReportConfig(reportType: 'release' | 'settlement') {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  try {
    await mercadoPagoReq(`/v1/account/${reportSlug}/config`);
    return;
  } catch (error: any) {
    const message = String(error?.message || '');
    if (!/404|not_found/i.test(message) && !isMercadoPagoConfigMissingError(error)) throw error;
  }

  const body = JSON.stringify(buildMercadoPagoReportConfig(reportType));
  let lastError: any = null;

  for (const method of ['POST', 'PUT'] as const) {
    try {
      await mercadoPagoReq(`/v1/account/${reportSlug}/config`, {
        method,
        body,
      });
      return;
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Nao foi possivel configurar ${reportSlug}`);
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

function normalizeBooleanish(value: any): boolean | null {
  const text = normalizeKey(value);
  if (!text) return null;
  if (['true', '1', 'yes', 'sim'].includes(text)) return true;
  if (['false', '0', 'no', 'nao'].includes(text)) return false;
  return null;
}

function normalizeKey(value: any) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function parseDateOnlyInput(value: any) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text);
  return new Date(`${text}T00:00:00.000Z`);
}

function toDateOnlyString(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function decodeDataUrlText(dataUrl: string) {
  const match = /^data:.*?;base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!match?.[1]) throw new Error('Arquivo CSV invalido.');
  return Buffer.from(match[1], 'base64').toString('utf-8');
}

function buildMercadoPagoManualReportRange(ate: string) {
  const endDate = normalizeText(ate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Informe uma data final valida para solicitar o extrato.');
  }

  const [year, month, day] = endDate.split('-').map((item) => Number(item));
  const beginLocal = `${year}-${String(month).padStart(2, '0')}-01T00:00:00${getSaoPauloOffset()}`;
  const endLocal = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59${getSaoPauloOffset()}`;

  return {
    inicio: `${year}-${String(month).padStart(2, '0')}-01`,
    ate: endDate,
    beginDate: new Date(beginLocal).toISOString().replace('.000Z', 'Z'),
    endDate: new Date(endLocal).toISOString().replace('.000Z', 'Z'),
  };
}

function extractMercadoPagoNegativeSignedAmount(row: Record<string, string>) {
  const netDebit = normalizeMoney(row.net_debit_amount);
  if (netDebit !== null && netDebit > 0) return -netDebit;

  const settlementNet = normalizeMoney(row.settlement_net_amount);
  if (settlementNet !== null && settlementNet < 0) return settlementNet;

  const netCredit = normalizeMoney(row.net_credit_amount);
  if (netCredit !== null && netCredit < 0) return netCredit;

  const gross = normalizeMoney(row.gross_amount || row.transaction_amount || row.real_amount);
  if (gross !== null && gross < 0) return gross;

  return 0;
}

function buildMercadoPagoDespesaImportKey(input: {
  dataHora: string;
  sourceId: string;
  descriptionOriginal: string;
  valorAssinado: number;
}) {
  const fingerprint = [
    normalizeText(input.dataHora),
    normalizeText(input.sourceId),
    normalizeText(input.descriptionOriginal),
    Number(input.valorAssinado || 0).toFixed(2),
  ].join('|');

  return createHash('sha1').update(fingerprint).digest('hex');
}

function buildMercadoPagoDespesaDetalhesSugeridos(row: Record<string, string>) {
  const parts = [
    normalizeText(row.description || row.transaction_type || row.record_type || 'Movimentacao Mercado Pago'),
    normalizeText(row.business_unit),
    normalizeText(row.sub_unit),
  ].filter(Boolean);

  return parts.join(' / ');
}

const MERCADO_PAGO_DESPESA_PREVIEW_IGNORE_TYPES = new Set([
  'reserve_for_payment',
  'reserve_for_payout',
  'shipping',
  'reserve_for_dispute',
  'mediation',
]);

function shouldIgnoreMercadoPagoExpensePreviewRow(row: Record<string, string>) {
  const candidateKeys = [
    normalizeKey(row.description),
    normalizeKey(row.transaction_type),
    normalizeKey(row.record_type),
  ].filter(Boolean);

  return candidateKeys.some((key) => MERCADO_PAGO_DESPESA_PREVIEW_IGNORE_TYPES.has(key));
}

function buildMercadoPagoExpensePreviewRows(rows: Array<Record<string, string>>, fileName: string) {
  const unique = new Map<string, any>();

  for (const row of rows) {
    if (isCsvSummaryRow(row)) continue;
    if (shouldIgnoreMercadoPagoExpensePreviewRow(row)) continue;

    const rawDate = normalizeText(
      row.date
      || row.transaction_date
      || row.settlement_date
      || row.money_release_date,
    );
    const parsedDate = rawDate ? new Date(rawDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) continue;

    const valorAssinado = extractMercadoPagoNegativeSignedAmount(row);
    if (!(valorAssinado < 0)) continue;

    const sourceId = normalizeText(
      row.source_id
      || row.external_reference
      || row.order_id
      || row.purchase_id
      || row.shipping_id,
    );
    const descriptionOriginal = normalizeText(
      row.description
      || row.transaction_type
      || row.record_type
      || 'movimentacao',
    );
    const importKey = buildMercadoPagoDespesaImportKey({
      dataHora: rawDate,
      sourceId,
      descriptionOriginal,
      valorAssinado,
    });
    if (unique.has(importKey)) continue;

    unique.set(importKey, {
      importKey,
      fileName: normalizeText(fileName) || 'mercado-pago.csv',
      data: toDateOnlyString(parsedDate),
      dataHora: rawDate,
      sourceId,
      descriptionOriginal,
      detalhesSugeridos: buildMercadoPagoDespesaDetalhesSugeridos(row),
      valorAssinado,
      valor: Math.abs(valorAssinado),
      saldoApos: normalizeMoney(row.balance_amount),
      paymentMethod: normalizeText(row.payment_method),
      paymentMethodType: normalizeText(row.payment_method_type),
      businessUnit: normalizeText(row.business_unit),
      subUnit: normalizeText(row.sub_unit),
    });
  }

  return Array.from(unique.values()).sort((a, b) => b.dataHora.localeCompare(a.dataHora));
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

function getMercadoPagoReportSlug(reportType: 'release' | 'settlement') {
  return reportType === 'release' ? 'release_report' : 'settlement_report';
}

function parseDateMs(value: any) {
  const text = normalizeText(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMercadoPagoReportFileTimestamp(fileName: string) {
  const match = normalizeText(fileName).match(/(\d{4})-(\d{2})-(\d{2})-(\d{6})/);
  if (!match) return 0;
  const [, year, month, day, time] = match;
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour,
    minute,
    second,
    0,
  ).getTime();
}

function extractMercadoPagoReportEntries(payload: any): any[] {
  if (Array.isArray(payload)) return payload;

  const directCollections = [
    payload?.results,
    payload?.data,
    payload?.files,
    payload?.reports,
    payload?.items,
    payload?.elements,
  ];

  for (const collection of directCollections) {
    if (Array.isArray(collection)) return collection;
  }

  if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
  }

  return [];
}

function normalizeMercadoPagoReportEntry(entry: any) {
  const fileName = normalizeText(
    typeof entry === 'string'
      ? entry
      : entry?.file_name
        || entry?.fileName
        || entry?.name
        || entry?.filename,
  );
  const reportId = normalizeText(entry?.report_id || entry?.reportId || entry?.id);
  const taskId = normalizeText(entry?.task_id || entry?.taskId || entry?.id);
  const createdAtMs =
    parseDateMs(entry?.generation_date)
    || parseDateMs(entry?.generated_at)
    || parseDateMs(entry?.created_at)
    || parseDateMs(entry?.date_created)
    || parseDateMs(entry?.request_date)
    || getMercadoPagoReportFileTimestamp(fileName);
  const endAtMs =
    parseDateMs(entry?.end_date)
    || parseDateMs(entry?.date_to)
    || parseDateMs(entry?.to_date)
    || createdAtMs;

  return {
    raw: entry,
    fileName,
    reportId,
    taskId,
    createdAtMs,
    endAtMs,
  };
}

function isMercadoPagoConfigMissingError(error: any) {
  const message = normalizeText(error?.message || error);
  return /configuration not found for user/i.test(message);
}

async function listMercadoPagoReports(reportType: 'release' | 'settlement') {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  try {
    return extractMercadoPagoReportEntries(
      await mercadoPagoReq(`/v1/account/${reportSlug}/list`, { method: 'GET' }),
    );
  } catch (getError: any) {
    if (isMercadoPagoConfigMissingError(getError)) return [];
    try {
      return extractMercadoPagoReportEntries(
        await mercadoPagoReq(`/v1/account/${reportSlug}/list`, { method: 'POST' }),
      );
    } catch (postError: any) {
      if (isMercadoPagoConfigMissingError(postError)) return [];
      throw new Error(`Falha ao listar ${reportSlug}: ${normalizeText(postError?.message || postError)}`);
    }
  }
}

async function searchMercadoPagoReport(
  reportType: 'release' | 'settlement',
  params: Record<string, string>,
) {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (normalizeText(value)) qs.set(key, value);
  }
  try {
    return await mercadoPagoReq(`/v1/account/${reportSlug}/search?${qs.toString()}`, { method: 'GET' });
  } catch (error: any) {
    throw new Error(`Falha ao pesquisar ${reportSlug}: ${normalizeText(error?.message || error)}`);
  }
}

async function getMercadoPagoReportTask(
  reportType: 'release' | 'settlement',
  taskId: string,
) {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  const token = await getMercadoPagoAccessToken();
  const qs = new URLSearchParams({ access_token: token });
  try {
    return await mercadoPagoReq(`/v1/account/${reportSlug}/task/${encodeURIComponent(taskId)}?${qs.toString()}`, { method: 'GET' }, false);
  } catch (error: any) {
    throw new Error(`Falha ao consultar task de ${reportSlug}: ${normalizeText(error?.message || error)}`);
  }
}

async function resolveMercadoPagoReportFileName(
  reportType: 'release' | 'settlement',
  entry: any,
) {
  const normalized = normalizeMercadoPagoReportEntry(entry);
  if (normalized.fileName) return normalized.fileName;

  if (normalized.reportId) {
    try {
      const payload = await searchMercadoPagoReport(reportType, { id: normalized.reportId });
      const match = extractMercadoPagoReportEntries(payload)
        .map(normalizeMercadoPagoReportEntry)
        .find((candidate) => candidate.fileName);
      if (match?.fileName) return match.fileName;
    } catch {
      // fall through
    }
  }

  if (normalized.taskId) {
    try {
      const payload = await getMercadoPagoReportTask(reportType, normalized.taskId);
      const taskFileName = normalizeText(payload?.file_name || payload?.fileName);
      if (taskFileName) return taskFileName;

      const reportId = normalizeText(payload?.report_id || payload?.reportId);
      if (reportId) {
        const searched = await searchMercadoPagoReport(reportType, { id: reportId });
        const match = extractMercadoPagoReportEntries(searched)
          .map(normalizeMercadoPagoReportEntry)
          .find((candidate) => candidate.fileName);
        if (match?.fileName) return match.fileName;
      }
    } catch {
      // fall through
    }
  }

  return '';
}

function pickLatestMercadoPagoReportFileName(reportType: 'release' | 'settlement', entries: any[]) {
  const maxAgeMs = reportType === 'release' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const now = Date.now();

  const latest = entries
    .map(normalizeMercadoPagoReportEntry)
    .filter((entry) => entry.fileName)
    .sort((a, b) => (b.endAtMs || b.createdAtMs) - (a.endAtMs || a.createdAtMs))[0];

  if (!latest?.fileName) return '';
  if (!latest.endAtMs && !latest.createdAtMs) return latest.fileName;

  const age = now - (latest.endAtMs || latest.createdAtMs);
  return age <= maxAgeMs ? latest.fileName : '';
}

async function createMercadoPagoReport(reportType: 'release' | 'settlement', beginDate: string, endDate: string) {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  let payload: any;
  try {
    payload = await mercadoPagoReq(`/v1/account/${reportSlug}`, {
      method: 'POST',
      body: JSON.stringify({
        begin_date: beginDate,
        end_date: endDate,
      }),
    });
  } catch (error: any) {
    throw new Error(`Falha ao gerar ${reportSlug}: ${normalizeText(error?.message || error)}`);
  }

  return {
    taskId: normalizeText(payload?.task_id || payload?.id || payload?.taskId),
    fileName: normalizeText(payload?.file_name || payload?.fileName),
  };
}

async function waitMercadoPagoReportFileName(
  reportType: 'release' | 'settlement',
  knownFileNames: Set<string>,
  taskId = '',
  allowKnownFallback = true,
) {
  for (let attempt = 0; attempt < MERCADO_PAGO_REPORT_WAIT_ATTEMPTS; attempt += 1) {
    if (taskId) {
      const fileNameFromTask = await resolveMercadoPagoReportFileName(reportType, { task_id: taskId });
      if (fileNameFromTask && !knownFileNames.has(fileNameFromTask)) return fileNameFromTask;
      if (allowKnownFallback && attempt >= 2 && fileNameFromTask) return fileNameFromTask;
    }

    const entries = await listMercadoPagoReports(reportType);
    const normalizedEntries = entries
      .map(normalizeMercadoPagoReportEntry)
      .sort((a, b) => (b.createdAtMs || b.endAtMs) - (a.createdAtMs || a.endAtMs));

    for (const entry of normalizedEntries) {
      const fileName = await resolveMercadoPagoReportFileName(reportType, entry.raw);
      if (fileName && !knownFileNames.has(fileName)) return fileName;
      if (allowKnownFallback && attempt >= 2 && fileName) return fileName;
    }

    await delay(MERCADO_PAGO_REPORT_WAIT_DELAY_MS);
  }

  return '';
}

async function downloadMercadoPagoReportRows(
  reportType: 'release' | 'settlement',
  daysBack: number,
  forceGenerate = false,
  forceFreshReport = false,
) {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  const existingEntries = await listMercadoPagoReports(reportType);
  let latestExistingFileName = '';
  if (!forceFreshReport) {
    latestExistingFileName = pickLatestMercadoPagoReportFileName(reportType, existingEntries);
    if (!latestExistingFileName) {
      const normalizedEntries = existingEntries
        .map(normalizeMercadoPagoReportEntry)
        .sort((a, b) => (b.endAtMs || b.createdAtMs) - (a.endAtMs || a.createdAtMs));
      for (const entry of normalizedEntries) {
        latestExistingFileName = await resolveMercadoPagoReportFileName(reportType, entry.raw);
        if (latestExistingFileName) break;
      }
    }
  }

  let fileName = latestExistingFileName;
  if ((forceFreshReport || !fileName) && forceGenerate) {
    const knownFileNames = new Set(
      existingEntries
        .map(normalizeMercadoPagoReportEntry)
        .map((entry) => entry.fileName)
        .filter(Boolean),
    );

      const { beginDate } = getMercadoPagoReportRange(daysBack);
      const { endDate } = getMercadoPagoReportRange(0);
      const created = await createMercadoPagoReport(reportType, beginDate, endDate);
      fileName = created.fileName;
      if (!fileName && created.taskId) {
        fileName = await waitMercadoPagoReportFileName(reportType, knownFileNames, created.taskId, !forceFreshReport);
      }
      if (!fileName && forceFreshReport) {
        throw new Error(`Mercado Pago recebeu a solicitacao de ${reportSlug}, mas o arquivo novo ainda nao ficou disponivel.`);
      }
    }

  if (!fileName) {
    throw new Error(`Sem relatorio disponivel para ${reportSlug}`);
  }

  let text = '';
  try {
    text = await mercadoPagoDownloadText(`/v1/account/${reportSlug}/${encodeURIComponent(fileName)}`);
  } catch (error: any) {
    throw new Error(`Falha ao baixar ${reportSlug}/${fileName}: ${normalizeText(error?.message || error)}`);
  }
  return parseCsvReport(text);
}

function summarizeMercadoPagoReportEntries(entries: any[]) {
  return entries
    .map(normalizeMercadoPagoReportEntry)
    .sort((a, b) => (b.endAtMs || b.createdAtMs) - (a.endAtMs || a.createdAtMs))
    .slice(0, 5)
    .map((entry) => ({
      fileName: entry.fileName,
      reportId: entry.reportId,
      taskId: entry.taskId,
      createdAtMs: entry.createdAtMs,
      endAtMs: entry.endAtMs,
    }));
}

async function traceMercadoPagoManualRequest(reportType: 'release' | 'settlement', daysBack: number) {
  const reportSlug = getMercadoPagoReportSlug(reportType);
  const existingEntries = await listMercadoPagoReports(reportType);
  const knownFileNames = new Set(
    existingEntries
      .map(normalizeMercadoPagoReportEntry)
      .map((entry) => entry.fileName)
      .filter(Boolean),
  );

  const { beginDate } = getMercadoPagoReportRange(daysBack);
  const { endDate } = getMercadoPagoReportRange(0);

  const trace: any = {
    reportType,
    reportSlug,
    beginDate,
    endDate,
    existingCount: existingEntries.length,
    latestExistingFileName: pickLatestMercadoPagoReportFileName(reportType, existingEntries),
    recentEntries: summarizeMercadoPagoReportEntries(existingEntries),
  };

  try {
    const created = await createMercadoPagoReport(reportType, beginDate, endDate);
    trace.create = {
      ok: true,
      taskId: created.taskId,
      fileName: created.fileName,
    };

    if (created.taskId) {
      try {
        trace.task = await getMercadoPagoReportTask(reportType, created.taskId);
      } catch (taskError: any) {
        trace.taskError = normalizeText(taskError?.message || taskError);
      }
    }

    const waitedNewFileName = created.fileName
      || await waitMercadoPagoReportFileName(reportType, knownFileNames, created.taskId, false);

    trace.waitedNewFileName = waitedNewFileName;
    trace.newFileFound = !!waitedNewFileName;
    trace.reusedKnownFile = !!waitedNewFileName && knownFileNames.has(waitedNewFileName);
  } catch (error: any) {
    trace.create = {
      ok: false,
      error: normalizeText(error?.message || error),
    };
  }

  return trace;
}

function isCsvSummaryRow(row: Record<string, string>) {
  return !normalizeText(row.date) && !normalizeText(row.description) && !normalizeText(row.record_type);
}

function extractReportEndingBalance(rows: Array<Record<string, string>>) {
  const candidates = rows.filter((row) => !isCsvSummaryRow(row));
  const totalRows = candidates.filter((row) => normalizeKey(row.record_type).includes('total'));
  const orderedRows = totalRows.length ? totalRows : candidates;

  for (let i = orderedRows.length - 1; i >= 0; i -= 1) {
    const row = orderedRows[i];
    const direct =
      normalizeMoney(row.balance_amount)
      ?? normalizeMoney(row.settlement_net_amount)
      ?? normalizeMoney(row.net_credit_amount);
    if (direct !== null) return direct;
  }

  return 0;
}

async function downloadMercadoPagoReportRowsWithConfig(
  reportType: 'release' | 'settlement',
  daysBack: number,
  forceGenerate = false,
  forceFreshReport = false,
) {
  try {
    return await downloadMercadoPagoReportRows(reportType, daysBack, forceGenerate, forceFreshReport);
  } catch (error: any) {
    if (!forceGenerate || !isMercadoPagoReportUnavailableError(error)) throw error;
    await ensureMercadoPagoReportConfig(reportType);
    return downloadMercadoPagoReportRows(reportType, daysBack, forceGenerate, forceFreshReport);
  }
}

function isMercadoPagoReportUnavailableError(error: any) {
  const message = normalizeText(error?.message || error).toLowerCase();
  return (
    message.includes('sem relatorio disponivel')
    || message.includes('configuration not found for user')
    || message.includes('report not found')
    || message === 'bad request'
    || message.includes('404')
  );
}

async function loadMercadoPagoReportRowsAuto(
  reportType: 'release' | 'settlement',
  daysBack: number,
): Promise<{
  rows: Array<Record<string, string>>;
  requestedNow: boolean;
  waitingForReport: boolean;
}> {
  try {
    const rows = await downloadMercadoPagoReportRowsWithConfig(reportType, daysBack, false);
    return { rows, requestedNow: false, waitingForReport: false };
  } catch (error: any) {
    if (!isMercadoPagoReportUnavailableError(error)) throw error;
  }

  const state = mercadoPagoReportGenerationState[reportType];

  if (state.inFlight) {
    const rows = await state.inFlight;
    return { rows, requestedNow: false, waitingForReport: rows.length === 0 };
  }

  if ((Date.now() - state.lastAttemptAt) < MERCADO_PAGO_REPORT_GENERATION_COOLDOWN_MS) {
    return { rows: [], requestedNow: false, waitingForReport: true };
  }

  state.lastAttemptAt = Date.now();
  state.inFlight = (async () => {
    try {
      return await downloadMercadoPagoReportRowsWithConfig(reportType, daysBack, true);
    } catch (error: any) {
      if (isMercadoPagoReportUnavailableError(error)) return [];
      throw error;
    } finally {
      state.inFlight = null;
    }
  })();

  const rows = await state.inFlight;
  return { rows, requestedNow: true, waitingForReport: rows.length === 0 };
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

  if (!/^APP_(USR|TEST)-/i.test(normalizeText(config.mercadoPagoAccessToken))) {
    return {
      connected: false,
      error: 'Configure o Access Token de producao do Mercado Pago em Config. ML.',
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
      const [releaseResult, settlementResult] = await Promise.allSettled([
        loadMercadoPagoReportRowsAuto('release', 30),
        loadMercadoPagoReportRowsAuto('settlement', 180),
      ]);

      const releaseRows = releaseResult.status === 'fulfilled' ? releaseResult.value.rows : [];
      const settlementRows = settlementResult.status === 'fulfilled' ? settlementResult.value.rows : [];
      const settlementRequestedNow = settlementResult.status === 'fulfilled'
        ? settlementResult.value.requestedNow
        : false;
      const settlementWaitingForReport = settlementResult.status === 'fulfilled'
        ? settlementResult.value.waitingForReport
        : false;

      if (!releaseRows.length) {
        if (releaseResult.status === 'rejected') {
          throw releaseResult.reason;
        }
        throw new Error(
          releaseResult.value.requestedNow
            ? 'O relatorio de valores liberados foi solicitado ao Mercado Pago e ainda esta sendo processado.'
            : 'Ainda nao existe relatorio de valores liberados disponivel no Mercado Pago.',
        );
      }

      const now = new Date();
      const saldoDisponivel = extractReportEndingBalance(releaseRows);

      const settlementEntries = settlementRows
        .map((row) => {
          const releaseDateText = normalizeText(
            row.money_release_date
            || row.settlement_date
            || row.release_date
            || row.date,
          );
          const releaseDate = releaseDateText ? new Date(releaseDateText) : null;
          const amount =
            normalizeMoney(row.settlement_net_amount)
            ?? normalizeMoney(row.net_credit_amount)
            ?? normalizeMoney(row.gross_amount)
            ?? 0;
          return {
            releaseDate,
            amount,
            transactionType: normalizeKey(row.transaction_type),
            paymentMethodType: normalizeKey(row.payment_method_type),
            isReleased: normalizeBooleanish(row.is_released),
          };
        })
        .filter((row) => row.amount > 0);

      const hasSettlementData = settlementRows.length > 0;
      const hasExplicitReleaseStatus = settlementRows.some(
        (row) => normalizeText(row.is_released) || normalizeText(row.money_release_date),
      );
      const pendingSettlements = settlementEntries.filter((row) => {
        if (row.transactionType.includes('refund') || row.transactionType.includes('chargeback') || row.transactionType.includes('dispute')) {
          return false;
        }
        if (row.isReleased === false) return true;
        if (row.isReleased === true) return false;
        return !!(row.releaseDate && !Number.isNaN(row.releaseDate.getTime()) && row.releaseDate > now);
      });
      const saldoALiberar = hasSettlementData
        ? pendingSettlements.reduce((sum, row) => sum + row.amount, 0)
        : null;
      const saldoAntecipavel = hasSettlementData
        ? pendingSettlements
          .filter((row) => ['credit_card', 'debit_card', 'prepaid_card'].includes(row.paymentMethodType))
          .reduce((sum, row) => sum + row.amount, 0)
        : null;

      const resumo = {
        connected: true,
        source: 'mercado_pago_reports',
        currencyId: 'BRL',
        saldoDisponivel,
        saldoALiberar,
        saldoAntecipavel,
        saldoAntecipavelInferido: hasSettlementData && !hasExplicitReleaseStatus,
        saldoParcial: !hasSettlementData,
        observacao: hasSettlementData
          ? hasExplicitReleaseStatus
            ? ''
            : 'Saldo antecipavel estimado a partir do dinheiro ainda no prazo de liberacao.'
          : settlementRequestedNow
            ? 'Saldo disponivel carregado. O relatorio de liquidacao foi solicitado ao Mercado Pago e pode levar alguns minutos para aparecer.'
            : settlementWaitingForReport
              ? 'Saldo disponivel carregado. A liberar e antecipavel ainda aguardam o relatorio de liquidacao do Mercado Pago.'
              : 'Saldo disponivel carregado. A liberar e antecipavel ainda aguardam o primeiro relatorio de liquidacao do Mercado Pago.',
        consultadoEm: new Date().toISOString(),
      };
        saldoCacheState.value = resumo;
        saldoCacheState.expiresAt = Date.now() + MERCADO_LIVRE_SALDO_CACHE_TTL_MS;
        return resumo;
      } catch (error: any) {
        lastError = error || lastError;
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
  const detailRow = (label: string, value: string, mono = false) => `
    <tr>
      <td valign="top" style="width:130px;padding:0 12px 8px 0;font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${label}</td>
      <td valign="top" style="padding:0 0 8px 0;font-size:13px;line-height:1.65;color:#0f172a;${mono ? `font-family:'JetBrains Mono',Consolas,monospace;` : ''}">${value}</td>
    </tr>
  `;

  const cards = perguntas.map((pergunta) => renderEmailPanel(`
    <div style="margin-bottom:10px;">
      ${renderEmailBadge(`Pergunta #${escapeHtml(pergunta.questionId)}`, { tone: 'warning', mono: true })}
      ${renderEmailBadge(escapeHtml(formatDateTimePtBr(pergunta.dataPergunta)), { tone: 'neutral' })}
    </div>
    <div style="font-size:18px;line-height:1.4;font-weight:700;color:#0f172a;margin-bottom:12px;">${escapeHtml(pergunta.idPeca || pergunta.sku || pergunta.tituloAnuncio || 'Sem identificacao')}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;">
      ${detailRow('Cliente', escapeHtml(pergunta.nomeCliente || 'Nao identificado'))}
      ${detailRow('Produto', escapeHtml(pergunta.descricao || pergunta.tituloAnuncio || 'Sem descricao'))}
      ${detailRow('SKU / ID Peca', escapeHtml(pergunta.idPeca || pergunta.sku || '-'), true)}
      ${detailRow('Item ML', escapeHtml(pergunta.itemId || '-'), true)}
    </table>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Mensagem completa</div>
      <div style="font-size:14px;line-height:1.75;color:#0f172a;">${escapeHtml(pergunta.texto || '')}</div>
    </div>
  `, { marginBottom: 14 })).join('');

  return renderAlertEmailLayout({
    title: 'Perguntas recebidas no Mercado Livre aguardando resposta',
    subtitle: 'Revise as mensagens abaixo e responda o quanto antes para manter a conversao e o tempo de resposta sob controle.',
    summaryHtml: renderEmailMetricCard('Novas perguntas', perguntas.length, { tone: 'warning' }),
    contentHtml: cards,
    maxWidth: 980,
  });
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
  if (schedulerState.perguntasRunning) return;

  const [config, geral] = await Promise.all([getMercadoLivreConfig(), getConfiguracaoGeral()]);
  if (!geral.mercadoLivrePerguntasAtivo) return;
  if (!config.accessToken) return;

  const lastReadAt = geral.mercadoLivrePerguntasUltimaLeituraEm ? new Date(geral.mercadoLivrePerguntasUltimaLeituraEm) : null;
  const intervalMs = Math.max(1, Number(geral.mercadoLivrePerguntasIntervaloMin || 5)) * 60 * 1000;
  if (lastReadAt && Date.now() - lastReadAt.getTime() < intervalMs) return;

  schedulerState.perguntasRunning = true;
  try {
    const result = await syncMercadoLivrePerguntas({ sendEmail: true });
    await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: new Date() });

    if (result.novas > 0) {
      console.log(`[mercado-livre-perguntas] ${result.novas} nova(s) pergunta(s) processada(s)`);
      return;
    }

    console.log('[mercado-livre-perguntas] rotina executada sem novas perguntas');
  } finally {
    schedulerState.perguntasRunning = false;
  }
}

async function tickMercadoPagoSaldoScheduler() {
  if (schedulerState.mercadoPagoSaldoRunning) return;

  const config = await getMercadoLivreConfig();
  if (!config.mercadoPagoSaldoAutoAtivo) return;
  if (!normalizeText(config.mercadoPagoClientId) || !normalizeText(config.mercadoPagoClientSecret)) return;
  if (!/^APP_(USR|TEST)-/i.test(normalizeText(config.mercadoPagoAccessToken))) return;

  const horario = normalizeHorario(config.mercadoPagoSaldoAutoHorario);
  const now = getTimezoneDateParts(new Date(), MERCADO_LIVRE_TIMEZONE);
  if (!isScheduledMinute(now.timeKey, horario)) return;

  const executionKey = `${now.dateKey} ${horario}`;
  if (normalizeText(config.mercadoPagoSaldoAutoUltimaExecucaoChave) === executionKey) return;

  schedulerState.mercadoPagoSaldoRunning = true;
  try {
    const result = await syncMercadoPagoReportsNow();
    await saveMercadoLivreConfig({
      mercadoPagoSaldoAutoUltimaExecucaoChave: executionKey,
      mercadoPagoSaldoAutoUltimaExecucaoEm: new Date(),
    });

    if (result.waitingForNewRelease) {
      console.log(`[mercado-pago-saldo] solicitacao automatica enviada em ${executionKey}; arquivo novo ainda em processamento`);
      return;
    }

    console.log(`[mercado-pago-saldo] saldo atualizado automaticamente em ${executionKey} (${result.releaseRows || 0} linha(s))`);
  } finally {
    schedulerState.mercadoPagoSaldoRunning = false;
  }
}

export function startMercadoLivreScheduler() {
  if (schedulerState.started) return;
  schedulerState.started = true;

  const runTick = () => {
    tickMercadoLivrePerguntasScheduler().catch((error) => {
      console.error('Falha na rotina de perguntas do Mercado Livre:', error);
      schedulerState.perguntasRunning = false;
    });
    tickMercadoPagoSaldoScheduler().catch((error) => {
      console.error('Falha na rotina automatica de saldo do Mercado Pago:', error);
      schedulerState.mercadoPagoSaldoRunning = false;
    });
  };

  setTimeout(runTick, msUntilNextMinuteTick());
  setInterval(runTick, MERCADO_LIVRE_SCHEDULER_INTERVAL_MS);
}

// GET /mercado-livre/categoria-predictor?titulo=TITULO
// Usa mercadoLivreReq autenticado para evitar CORS e restrições de domínio
mercadoLivreRouter.get('/categoria-predictor', async (req, res, next) => {
  try {
    const titulo = String(req.query.titulo || '').trim();
    if (!titulo || titulo.length < 3) return res.json([]);

    // Tenta domain_discovery (requer auth, mais preciso para BR)
    try {
      const data = await mercadoLivreReq(
        `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(titulo)}&limit=5`,
      );
      const sugestoes = Array.isArray(data) ? data : [];
      console.log('[categoria-predictor] domain_discovery:', sugestoes.length, 'resultados');
      if (sugestoes.length > 0) return res.json(sugestoes);
    } catch (e1: any) {
      console.log('[categoria-predictor] domain_discovery falhou:', e1?.message);
    }

    // Fallback: category_predictor sem auth
    const resp = await fetch(
      `${MERCADO_LIVRE_API}/sites/MLB/category_predictor/predict?title=${encodeURIComponent(titulo)}`,
    );
    const rawText = await resp.text();
    console.log('[categoria-predictor] predictor status:', resp.status, rawText.slice(0, 300));
    if (!resp.ok) return res.json([]);
    let data: any;
    try { data = JSON.parse(rawText); } catch { return res.json([]); }
    let sugestoes: any[] = [];
    if (Array.isArray(data)) sugestoes = data;
    else if (data?.predictions && Array.isArray(data.predictions)) sugestoes = data.predictions;
    else if (data?.category_id) sugestoes = [data];
    res.json(sugestoes.slice(0, 5));
  } catch (e) {
    next(e);
  }
});

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
      mercadoPagoAccessTokenConfigured: /^APP_(USR|TEST)-/i.test(normalizeText(config.mercadoPagoAccessToken)),
      mercadoPagoHasTokens: /^APP_(USR|TEST)-/i.test(normalizeText(config.mercadoPagoAccessToken)),
      mercadoPagoHasRefreshToken: !!normalizeText(config.mercadoPagoRefreshToken),
      mercadoPagoConnectedAt: config.mercadoPagoConnectedAt,
      mercadoPagoUserId: config.mercadoPagoUserId || '',
      mercadoPagoSaldoAutoAtivo: !!config.mercadoPagoSaldoAutoAtivo,
      mercadoPagoSaldoAutoHorario: normalizeHorario(config.mercadoPagoSaldoAutoHorario),
      mercadoPagoSaldoAutoUltimaExecucaoEm: config.mercadoPagoSaldoAutoUltimaExecucaoEm,
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

    const savingMercadoPago =
      payload.mercadoPagoClientId !== undefined
      || payload.mercadoPagoClientSecret !== undefined
      || payload.mercadoPagoAccessToken !== undefined;
    if (savingMercadoPago) {
      if (
        !normalizeText(payload.mercadoPagoClientId)
        || !normalizeText(payload.mercadoPagoClientSecret)
        || !normalizeText(payload.mercadoPagoAccessToken)
      ) {
        return res.status(400).json({ error: 'Preencha o Client ID, o Client Secret e o Access Token do Mercado Pago.' });
      }

      dataToSave.mercadoPagoClientId = normalizeText(payload.mercadoPagoClientId);
      dataToSave.mercadoPagoClientSecret = normalizeText(payload.mercadoPagoClientSecret);
      dataToSave.mercadoPagoAccessToken = normalizeText(payload.mercadoPagoAccessToken);
      dataToSave.mercadoPagoRefreshToken = '';
      dataToSave.mercadoPagoConnectedAt = new Date();
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

mercadoLivreRouter.post('/mercado-pago/rotina', async (req, res, next) => {
  try {
    const payload = mercadoPagoRotinaSchema.parse(req.body || {});
    const current = await getMercadoLivreConfig();
    const horarioAtual = normalizeHorario(current.mercadoPagoSaldoAutoHorario);
    const proximoHorario = payload.horario !== undefined
      ? normalizeHorario(payload.horario)
      : horarioAtual;
    const proximoAtivo = payload.ativo !== undefined
      ? !!payload.ativo
      : !!current.mercadoPagoSaldoAutoAtivo;
    const resetExecucao =
      proximoHorario !== horarioAtual
      || proximoAtivo !== !!current.mercadoPagoSaldoAutoAtivo;

    await saveMercadoLivreConfig({
      mercadoPagoSaldoAutoAtivo: proximoAtivo,
      mercadoPagoSaldoAutoHorario: proximoHorario,
      mercadoPagoSaldoAutoUltimaExecucaoChave: resetExecucao ? null : current.mercadoPagoSaldoAutoUltimaExecucaoChave,
      mercadoPagoSaldoAutoUltimaExecucaoEm: resetExecucao ? null : current.mercadoPagoSaldoAutoUltimaExecucaoEm,
    });

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

mercadoLivreRouter.post('/mercado-pago/reports/sync', async (_req, res) => {
  try {
    const result = await syncMercadoPagoReportsNow();
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Falha ao atualizar relatorios do Mercado Pago' });
  }
});

mercadoLivreRouter.post('/mercado-pago/reports/request-trace', async (_req, res) => {
  try {
    const [release, settlement] = await Promise.all([
      traceMercadoPagoManualRequest('release', 30),
      traceMercadoPagoManualRequest('settlement', 180),
    ]);
    res.json({
      ok: true,
      release,
      settlement,
      consultadoEm: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Falha ao gerar trace da solicitacao manual do Mercado Pago' });
  }
});

mercadoLivreRouter.post('/mercado-pago/despesas/request-release-report', async (req, res, next) => {
  try {
    const payload = mercadoPagoDespesaReportRequestSchema.parse(req.body || {});
    const periodo = buildMercadoPagoManualReportRange(payload.ate);

    try {
      await ensureMercadoPagoReportConfig('release');
    } catch (error: any) {
      if (!isMercadoPagoReportUnavailableError(error)) throw error;
    }

    const created = await createMercadoPagoReport('release', periodo.beginDate, periodo.endDate);
    res.json({
      ok: true,
      reportType: 'release',
      period: {
        de: periodo.inicio,
        ate: periodo.ate,
      },
      taskId: normalizeText(created.taskId),
      detail: `Solicitacao enviada ao Mercado Pago para o periodo de ${periodo.inicio} ate ${periodo.ate}. O CSV pode chegar por email em alguns minutos.`,
    });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/mercado-pago/despesas/preview-csv', async (req, res, next) => {
  try {
    const payload = mercadoPagoDespesaCsvPreviewSchema.parse(req.body || {});
    const text = decodeDataUrlText(payload.dataUrl);
    const rows = parseCsvReport(text);
    const candidatos = buildMercadoPagoExpensePreviewRows(rows, normalizeText(payload.fileName) || 'mercado-pago.csv');
    const existing = candidatos.length
      ? await prisma.despesa.findMany({
          where: { importChave: { in: candidatos.map((item) => item.importKey) } },
          select: { id: true, importChave: true, detalhes: true, categoria: true, data: true, valor: true },
        })
      : [];
    const existingMap = new Map(existing.map((item) => [String(item.importChave), item]));
    const preview = candidatos.map((item) => {
      const imported = existingMap.get(item.importKey);
      return {
        ...item,
        jaImportada: !!imported,
        importacaoExistente: imported ? {
          id: imported.id,
          detalhes: imported.detalhes,
          categoria: imported.categoria,
          data: toDateOnlyString(new Date(imported.data)),
          valor: normalizeMoney(imported.valor) ?? Number(imported.valor || 0),
        } : null,
      };
    });

    res.json({
      ok: true,
      fileName: normalizeText(payload.fileName) || 'mercado-pago.csv',
      totalLinhas: rows.length,
      totalSaidas: preview.length,
      totalJaImportadas: preview.filter((item) => item.jaImportada).length,
      rows: preview,
    });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/mercado-pago/despesas/import-csv', async (req, res, next) => {
  try {
    const payload = mercadoPagoDespesaImportSchema.parse(req.body || {});
    const uniqueItemsMap = new Map<string, {
      importKey: string;
      data: string;
      detalhes: string;
      categoria: string;
      valor: number;
      fileName: string;
      sourceId: string;
      descriptionOriginal: string;
    }>();

    for (const item of payload.itens) {
      const importKey = buildMercadoPagoDespesaImportKey({
        dataHora: item.dataHora,
        sourceId: normalizeText(item.sourceId),
        descriptionOriginal: normalizeText(item.descriptionOriginal),
        valorAssinado: item.valorAssinado,
      });

      uniqueItemsMap.set(importKey, {
        importKey,
        data: item.data,
        detalhes: normalizeText(item.detalhes),
        categoria: normalizeText(item.categoria),
        valor: Number(item.valor || 0),
        fileName: normalizeText(item.fileName) || 'mercado-pago.csv',
        sourceId: normalizeText(item.sourceId),
        descriptionOriginal: normalizeText(item.descriptionOriginal),
      });
    }

    const uniqueItems = Array.from(uniqueItemsMap.values());
    const existing = uniqueItems.length
      ? await prisma.despesa.findMany({
          where: { importChave: { in: uniqueItems.map((item) => item.importKey) } },
          select: { importChave: true },
        })
      : [];
    const existingKeys = new Set(existing.map((item) => String(item.importChave)));

    const createData = uniqueItems
      .filter((item) => !existingKeys.has(item.importKey))
      .map((item) => ({
        data: parseDateOnlyInput(item.data),
        detalhes: item.detalhes,
        categoria: item.categoria,
        valor: item.valor,
        statusPagamento: 'pago',
        dataPagamento: parseDateOnlyInput(item.data),
        observacao: [
          `Importado do CSV Mercado Pago (${item.fileName})`,
          item.sourceId ? `source_id ${item.sourceId}` : '',
          item.descriptionOriginal ? `descricao original: ${item.descriptionOriginal}` : '',
        ].filter(Boolean).join(' | '),
        importOrigem: 'mercado_pago_csv',
        importChave: item.importKey,
        importArquivo: item.fileName,
      }));

    const created = createData.length
      ? await prisma.despesa.createMany({
          data: createData,
          skipDuplicates: true,
        })
      : { count: 0 };

    res.json({
      ok: true,
      imported: created.count,
      skipped: uniqueItems.length - created.count,
      totalRecebidas: payload.itens.length,
      totalUnicas: uniqueItems.length,
    });
  } catch (e) {
    next(e);
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

mercadoLivreRouter.get('/mercado-pago/balance-trace', async (_req, res, next) => {
  try {
    const trace = await loadMercadoPagoDirectBalanceTrace();
    res.json(trace);
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
