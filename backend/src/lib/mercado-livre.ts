import { prisma } from './prisma';
import { getConfiguracaoGeral, saveConfiguracaoGeral } from './configuracoes-gerais';
import { sendResendEmail } from './email';

const MELI_API = 'https://api.mercadolibre.com';
const MELI_OAUTH = `${MELI_API}/oauth/token`;
export const DEFAULT_MERCADO_LIVRE_PERGUNTAS_TITULO = 'ALERTA ANB Parts - Perguntas Mercado Livre - Verifique';
export const DEFAULT_MERCADO_LIVRE_INTERVALO_MIN = 5;
const ITEM_PERMALINK_CACHE_TTL_MS = 10 * 60 * 1000;

let mercadoLivreSchedulerStarted = false;
let mercadoLivreSchedulerRunning = false;
const itemPermalinkCache = new Map<string, { expiresAt: number; value: string | null }>();

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeInterval(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MERCADO_LIVRE_INTERVALO_MIN;
  return Math.max(1, Math.round(num));
}

function parseDate(value: any) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSkuCandidate(value: any) {
  const text = normalizeText(value)
    .replace(/\s+/g, '')
    .toUpperCase();
  return text || null;
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMercadoLivreItemId(value: any) {
  const normalized = normalizeSkuCandidate(value);
  if (!normalized) return null;
  const match = normalized.match(/\bML[A-Z]{1,3}\d+\b/);
  return match ? match[0] : null;
}

export async function getMercadoLivreConfig() {
  let config = await prisma.mercadoLivreConfig.findFirst();
  if (!config) {
    config = await prisma.mercadoLivreConfig.create({
      data: {},
    });
  }

  return {
    ...config,
    clientIdConfigured: !!normalizeText(config.clientId),
    clientSecretConfigured: !!normalizeText(config.clientSecret),
    connected: !!normalizeText(config.accessToken),
  };
}

export async function saveMercadoLivreConfig(data: Record<string, any>) {
  const current = await getMercadoLivreConfig();
  return prisma.mercadoLivreConfig.update({
    where: { id: current.id },
    data: {
      clientId: data.clientId !== undefined ? normalizeText(data.clientId) : current.clientId,
      clientSecret: data.clientSecret !== undefined ? normalizeText(data.clientSecret) : current.clientSecret,
      accessToken: data.accessToken !== undefined ? normalizeText(data.accessToken) : current.accessToken,
      refreshToken: data.refreshToken !== undefined ? normalizeText(data.refreshToken) : current.refreshToken,
      connectedAt: data.connectedAt !== undefined ? data.connectedAt : current.connectedAt,
      sellerId: data.sellerId !== undefined ? normalizeText(data.sellerId) : current.sellerId,
      nickname: data.nickname !== undefined ? normalizeText(data.nickname) : current.nickname,
      siteId: data.siteId !== undefined ? (normalizeText(data.siteId) || 'MLB') : current.siteId,
    },
  });
}

async function refreshMercadoLivreAccessToken() {
  const config = await getMercadoLivreConfig();
  if (!config.refreshToken) throw new Error('Sem refresh token do Mercado Livre. Reconecte a conta.');
  if (!config.clientId || !config.clientSecret) throw new Error('Client ID/Secret do Mercado Livre nao configurados.');

  const response = await fetch(MELI_OAUTH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || payload?.error || `Mercado Livre ${response.status}`);
  }

  await saveMercadoLivreConfig({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || config.refreshToken,
    connectedAt: new Date(),
  });

  return String(payload.access_token || '');
}

export async function mercadoLivreReq(path: string, init?: RequestInit, retry = true) {
  const config = await getMercadoLivreConfig();
  if (!config.accessToken) throw new Error('Mercado Livre nao conectado');

  async function doRequest(token: string) {
    return fetch(`${MELI_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  }

  let response = await doRequest(config.accessToken);
  if (response.status === 401 && retry && config.refreshToken) {
    const nextToken = await refreshMercadoLivreAccessToken();
    response = await doRequest(nextToken);
  }

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || payload?.error_description || `Mercado Livre ${response.status}`);
  }

  return payload;
}

export async function loadMercadoLivreUserProfile() {
  const data = await mercadoLivreReq('/users/me');
  return {
    sellerId: normalizeText((data as any)?.id),
    nickname: normalizeText((data as any)?.nickname || (data as any)?.first_name),
    siteId: normalizeText((data as any)?.site_id) || 'MLB',
  };
}

export async function getMercadoLivreItemPermalink(itemId: any) {
  const normalizedItemId = normalizeMercadoLivreItemId(itemId);
  if (!normalizedItemId) return null;

  const cached = itemPermalinkCache.get(normalizedItemId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const item: any = await mercadoLivreReq(`/items/${encodeURIComponent(normalizedItemId)}`);
    const permalink = normalizeText(item?.permalink) || null;
    itemPermalinkCache.set(normalizedItemId, {
      expiresAt: Date.now() + ITEM_PERMALINK_CACHE_TTL_MS,
      value: permalink,
    });
    return permalink;
  } catch {
    itemPermalinkCache.set(normalizedItemId, {
      expiresAt: Date.now() + 60 * 1000,
      value: null,
    });
    return null;
  }
}

function getAttributeValue(item: any, ids: string[]) {
  const attributes = Array.isArray(item?.attributes) ? item.attributes : [];
  for (const id of ids) {
    const found = attributes.find((attr: any) => String(attr?.id || '').toUpperCase() === id.toUpperCase());
    const value = found?.value_name ?? found?.value_id ?? found?.value_struct?.number;
    const normalized = normalizeSkuCandidate(value);
    if (normalized) return normalized;
  }
  return null;
}

async function resolveQuestionContext(question: any, itemCache: Map<string, any>, userCache: Map<string, string>) {
  const itemId = normalizeText(question?.item_id);
  let item: any = null;
  if (itemId) {
    if (itemCache.has(itemId)) {
      item = itemCache.get(itemId);
    } else {
      try {
        item = await mercadoLivreReq(`/items/${itemId}`);
      } catch {
        item = null;
      }
      itemCache.set(itemId, item);
    }
  }

  const clienteId = normalizeText(question?.from?.id);
  let nomeCliente = normalizeText(question?.from?.nickname || question?.from?.first_name);
  if (!nomeCliente && clienteId) {
    if (userCache.has(clienteId)) {
      nomeCliente = userCache.get(clienteId) || '';
    } else {
      try {
        const user = await mercadoLivreReq(`/users/${clienteId}`);
        nomeCliente = normalizeText((user as any)?.nickname || [(user as any)?.first_name, (user as any)?.last_name].filter(Boolean).join(' '));
      } catch {
        nomeCliente = '';
      }
      userCache.set(clienteId, nomeCliente);
    }
  }

  const sku = normalizeSkuCandidate(
    item?.seller_custom_field
    || item?.seller_sku
    || getAttributeValue(item, ['SELLER_SKU', 'SKU', 'PART_NUMBER'])
  );

  const peca = sku
    ? await prisma.peca.findFirst({
        where: { idPeca: sku },
        select: { id: true, idPeca: true, descricao: true },
      })
    : null;

  return {
    itemId,
    nomeCliente: nomeCliente || null,
    clienteId: clienteId || null,
    sku: sku || null,
    idPeca: peca?.idPeca || sku || null,
    pecaId: peca?.id || null,
    descricao: peca?.descricao || normalizeText(item?.title) || null,
    tituloAnuncio: normalizeText(item?.title) || null,
    linkAnuncio: normalizeText(item?.permalink) || null,
  };
}

export async function syncMercadoLivrePerguntas() {
  const config = await getMercadoLivreConfig();
  if (!config.connected || !config.sellerId) {
    throw new Error('Mercado Livre nao conectado');
  }

  const response: any = await mercadoLivreReq(`/questions/search?seller_id=${encodeURIComponent(config.sellerId)}&api_version=4&status=UNANSWERED`);
  const questions = Array.isArray(response?.questions)
    ? response.questions
    : Array.isArray(response?.results)
      ? response.results
      : [];

  const itemCache = new Map<string, any>();
  const userCache = new Map<string, string>();
  const novosIds: string[] = [];

  for (const question of questions) {
    const questionId = normalizeText(question?.id);
    if (!questionId) continue;

    const context = await resolveQuestionContext(question, itemCache, userCache);
    const existing = await prisma.mercadoLivrePergunta.findUnique({
      where: { questionId },
      select: { id: true },
    });

    await prisma.mercadoLivrePergunta.upsert({
      where: { questionId },
      create: {
        questionId,
        itemId: context.itemId,
        status: normalizeText(question?.status) || 'UNANSWERED',
        texto: normalizeText(question?.text),
        respostaTexto: normalizeText(question?.answer?.text) || null,
        dataPergunta: parseDate(question?.date_created),
        respondidaEm: parseDate(question?.answer?.date_created),
        clienteId: context.clienteId,
        nomeCliente: context.nomeCliente,
        sku: context.sku,
        idPeca: context.idPeca,
        pecaId: context.pecaId,
        descricao: context.descricao,
        tituloAnuncio: context.tituloAnuncio,
        linkAnuncio: context.linkAnuncio,
        raw: question,
      },
      update: {
        itemId: context.itemId,
        status: normalizeText(question?.status) || 'UNANSWERED',
        texto: normalizeText(question?.text),
        respostaTexto: normalizeText(question?.answer?.text) || null,
        dataPergunta: parseDate(question?.date_created),
        respondidaEm: parseDate(question?.answer?.date_created),
        clienteId: context.clienteId,
        nomeCliente: context.nomeCliente,
        sku: context.sku,
        idPeca: context.idPeca,
        pecaId: context.pecaId,
        descricao: context.descricao,
        tituloAnuncio: context.tituloAnuncio,
        linkAnuncio: context.linkAnuncio,
        raw: question,
      },
    });

    if (!existing) novosIds.push(questionId);
  }

  const novasPerguntas = novosIds.length
    ? await prisma.mercadoLivrePergunta.findMany({
        where: { questionId: { in: novosIds } },
        orderBy: { dataPergunta: 'desc' },
      })
    : [];

  return {
    total: questions.length,
    novasPerguntas,
  };
}

export async function answerMercadoLivreQuestion(questionId: string, text: string) {
  const normalizedQuestionId = normalizeText(questionId);
  const normalizedText = normalizeText(text);
  if (!normalizedQuestionId) throw new Error('Pergunta invalida');
  if (!normalizedText) throw new Error('Informe uma resposta');

  await mercadoLivreReq('/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_id: Number(normalizedQuestionId) || normalizedQuestionId,
      text: normalizedText,
    }),
  });

  const updated = await prisma.mercadoLivrePergunta.update({
    where: { questionId: normalizedQuestionId },
    data: {
      status: 'ANSWERED',
      respostaTexto: normalizedText,
      respondidaEm: new Date(),
    },
  });

  return updated;
}

function buildPerguntasEmailHtml(perguntas: any[]) {
  const cards = perguntas
    .map((item) => `
      <div style="border:1px solid #dbe5f0;border-radius:14px;padding:18px 20px;margin:0 0 14px;background:#ffffff;">
        <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#8da2c0;margin-bottom:10px;">Pergunta #${item.questionId}</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">${item.descricao || item.tituloAnuncio || 'Pergunta Mercado Livre'}</div>
        <div style="font-size:13px;color:#475569;line-height:1.7;">
          <div><strong>Cliente:</strong> ${item.nomeCliente || '-'}</div>
          <div><strong>SKU / ID Peca:</strong> ${item.idPeca || item.sku || '-'}</div>
          <div><strong>Item ML:</strong> ${item.itemId || '-'}</div>
          <div><strong>Data:</strong> ${item.dataPergunta ? new Date(item.dataPergunta).toLocaleString('pt-BR') : '-'}</div>
          <div style="margin-top:10px;"><strong>Pergunta:</strong></div>
          <div style="margin-top:6px;padding:12px 14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">${escapeHtml(item.texto || '')}</div>
        </div>
      </div>
    `)
    .join('');

  return `
    <div style="background:#f4f7fb;padding:24px;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:1040px;margin:0 auto;">
        <div style="background:#ffffff;border:1px solid #dbe5f0;border-radius:18px;padding:26px 28px;margin-bottom:18px;">
          <div style="font-size:28px;font-weight:900;color:#dc2626;margin-bottom:10px;">ALERTA ANB Parts</div>
          <div style="font-size:16px;color:#0f172a;font-weight:600;">Perguntas recebidas no Mercado Livre aguardando resposta</div>
          <div style="font-size:13px;color:#64748b;margin-top:8px;">Revise as perguntas abaixo e responda pela tela Mercado Livre &gt; Perguntas.</div>
        </div>
        ${cards}
      </div>
    </div>
  `;
}

function buildPerguntasEmailText(perguntas: any[]) {
  return [
    'ALERTA ANB Parts - Perguntas Mercado Livre - Verifique',
    '',
    ...perguntas.flatMap((item) => [
      `Pergunta #${item.questionId}`,
      `Cliente: ${item.nomeCliente || '-'}`,
      `SKU / ID Peca: ${item.idPeca || item.sku || '-'}`,
      `Item ML: ${item.itemId || '-'}`,
      `Data: ${item.dataPergunta ? new Date(item.dataPergunta).toLocaleString('pt-BR') : '-'}`,
      `Pergunta: ${item.texto || ''}`,
      '',
    ]),
  ].join('\n');
}

export async function processMercadoLivrePerguntasScheduler() {
  const configGeral = await getConfiguracaoGeral();
  if (!configGeral.mercadoLivrePerguntasAtivo) return;

  const intervalMin = normalizeInterval(configGeral.mercadoLivrePerguntasIntervaloMin);
  const lastRun = configGeral.mercadoLivrePerguntasUltimaLeituraEm ? new Date(configGeral.mercadoLivrePerguntasUltimaLeituraEm) : null;
  const now = new Date();
  if (lastRun && now.getTime() - lastRun.getTime() < intervalMin * 60 * 1000) {
    return;
  }

  const sync = await syncMercadoLivrePerguntas();
  const perguntasPendentes = sync.novasPerguntas.filter((item) => !item.notificadaEm);

  if (!configGeral.resendApiKey || !configGeral.emailRemetente || !configGeral.mercadoLivrePerguntasEmailDestinatario || !configGeral.mercadoLivrePerguntasEmailTitulo) {
    console.log('[mercado-livre-perguntas] configuracao incompleta para envio');
    await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: now });
    return;
  }

  if (!perguntasPendentes.length) {
    console.log('[mercado-livre-perguntas] sem novas perguntas');
    await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: now });
    return;
  }

  await sendResendEmail({
    apiKey: configGeral.resendApiKey,
    from: configGeral.emailRemetente,
    to: configGeral.mercadoLivrePerguntasEmailDestinatario,
    subject: configGeral.mercadoLivrePerguntasEmailTitulo || DEFAULT_MERCADO_LIVRE_PERGUNTAS_TITULO,
    html: buildPerguntasEmailHtml(perguntasPendentes),
    text: buildPerguntasEmailText(perguntasPendentes),
  });

  const ids = perguntasPendentes.map((item) => item.id);
  if (ids.length) {
    await prisma.mercadoLivrePergunta.updateMany({
      where: { id: { in: ids } },
      data: { notificadaEm: now },
    });
  }

  await saveConfiguracaoGeral({ mercadoLivrePerguntasUltimaLeituraEm: now });
  console.log(`[mercado-livre-perguntas] email enviado com sucesso (${perguntasPendentes.length} pergunta(s))`);
}

export function startMercadoLivrePerguntasScheduler() {
  if (mercadoLivreSchedulerStarted) return;
  mercadoLivreSchedulerStarted = true;

  setInterval(async () => {
    if (mercadoLivreSchedulerRunning) return;
    mercadoLivreSchedulerRunning = true;
    try {
      await processMercadoLivrePerguntasScheduler();
    } catch (error: any) {
      console.error('[mercado-livre-perguntas] falha na rotina automatica:', error?.message || error);
    } finally {
      mercadoLivreSchedulerRunning = false;
    }
  }, 60 * 1000);
}
