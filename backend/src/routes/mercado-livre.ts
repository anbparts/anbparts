import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
  DEFAULT_RESEND_FROM,
  getConfiguracaoGeral,
  saveConfiguracaoGeral,
} from '../lib/configuracoes-gerais';
import { sendResendEmail } from '../lib/email';

export const mercadoLivreRouter = Router();

const MERCADO_LIVRE_API = 'https://api.mercadolibre.com';
const MERCADO_LIVRE_AUTH = 'https://auth.mercadolivre.com.br/authorization';
const MERCADO_LIVRE_TOKEN = `${MERCADO_LIVRE_API}/oauth/token`;
const MERCADO_LIVRE_SITE_ID = 'MLB';
const MERCADO_LIVRE_SCHEDULER_INTERVAL_MS = 60 * 1000;

const schedulerState = {
  started: false,
  running: false,
};

const configSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
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

async function mercadoLivreReq(path: string, options: RequestInit = {}, allowRefresh = true) {
  const config = await getMercadoLivreConfig();
  const token = normalizeText(config.accessToken);
  if (!token) throw new Error('Mercado Livre nao conectado.');

  const response = await fetch(`${MERCADO_LIVRE_API}${path}`, {
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
    return fetch(`${MERCADO_LIVRE_API}${path}`, {
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

async function getMercadoLivreMe() {
  return mercadoLivreReq('/users/me');
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
  const status = normalizeText(question?.status || (answerText ? 'ANSWERED' : 'UNANSWERED')) || 'UNANSWERED';
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
    select: { id: true, notificadaEm: true },
  });

  const saved = existing
    ? await prisma.mercadoLivrePergunta.update({
        where: { questionId },
        data: payload,
      })
    : await prisma.mercadoLivrePergunta.create({
        data: {
          questionId,
          ...payload,
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

  const payload = await mercadoLivreReq(`/questions/search?seller_id=${encodeURIComponent(activeSellerId)}&api_version=4`);
  const questions = extractArray(payload);
  const savedRows: any[] = [];
  const perguntasParaNotificar: any[] = [];

  for (const question of questions) {
    const result = await upsertMercadoLivrePergunta(question);
    if (!result?.saved) continue;
    savedRows.push(result.saved);
    if (
      normalizeText(result.saved.status).toUpperCase() === 'UNANSWERED'
      && !result.saved.notificadaEm
    ) {
      perguntasParaNotificar.push(result.saved);
    }
  }

  if (options?.sendEmail && perguntasParaNotificar.length) {
    await sendMercadoLivrePerguntasEmail(perguntasParaNotificar);
  }

  return {
    ok: true,
    total: savedRows.length,
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
    subject: config.mercadoLivrePerguntasEmailTitulo || DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
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
    });
  } catch (e) {
    next(e);
  }
});

mercadoLivreRouter.post('/config', async (req, res, next) => {
  try {
    const payload = configSchema.parse(req.body || {});
    await saveMercadoLivreConfig({
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
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

    res.redirect(`${getFrontendBase()}/conf-gerais?mercadoLivre=connected`);
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

mercadoLivreRouter.get('/perguntas', async (_req, res, next) => {
  try {
    const rows = await prisma.mercadoLivrePergunta.findMany();
    rows.sort((a, b) => {
      const aPending = String(a.status || '').toUpperCase() === 'UNANSWERED' ? 0 : 1;
      const bPending = String(b.status || '').toUpperCase() === 'UNANSWERED' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
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

    const updated = await prisma.mercadoLivrePergunta.update({
      where: { questionId },
      data: {
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
