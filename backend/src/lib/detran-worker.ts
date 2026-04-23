import { promises as fs } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { google } from 'googleapis';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { prisma } from './prisma';

const DETRAN_CONFIG_SLUG = 'default';
const DETRAN_TIMEZONE = 'America/Sao_Paulo';
const DETRAN_POLL_INTERVAL_MS = 15_000;
const DETRAN_BOOT_DELAY_MS = 5_000;
const OTP_POLL_INTERVAL_MS = 5_000;
const OTP_WAIT_TIMEOUT_MS = 90_000;
const PAGE_WAIT_AFTER_ACTION_MS = 2_000;
const PROXIMO_WAIT_TIMEOUT_MS = 15_000;
const DETRAN_ARTIFACTS_ROOT = path.resolve(process.cwd(), 'runtime', 'detran-runs');
const DETRAN_SESSION_ROOT = path.resolve(process.cwd(), 'runtime', 'detran-session');
const DETRAN_SESSION_FILE = path.join(DETRAN_SESSION_ROOT, 'storage-state.json');
const AUTH_URL = 'https://auth.mas.sp.gov.br/login/#/form';
const HOME_URL = 'https://masprd.home.mas.sp.gov.br';
const MANAGE_URL = 'https://masprd.manage.mas.sp.gov.br/maximo/oslc/graphite/manage-shell/index.html#/main';

const workerState = {
  started: false,
  running: false,
  currentRunId: '' as string,
};

type DetranConfigRow = Awaited<ReturnType<typeof loadDetranConfig>>;
type DetranConfigRecord = NonNullable<DetranConfigRow>;
type DetranExecucaoRecord = NonNullable<Awaited<ReturnType<typeof loadExecucaoById>>>;

type ArtifactBundle = {
  runDir: string;
  networkFile: string;
  consoleFile: string;
  pageErrorFile: string;
  screenshots: string[];
  htmlSnapshots: string[];
  traces: string[];
};

type RuntimeArtifacts = {
  screenshots: string[];
  htmlSnapshots: string[];
  networkTrace: string | null;
  consoleLog: string | null;
  pageErrors: string | null;
  beforeNextShot: string | null;
  afterNextShot: string | null;
  beforeNextHtml: string | null;
  afterNextHtml: string | null;
  finalShot: string | null;
  finalHtml: string | null;
  storageState: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeJsonRecord(value: unknown) {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
}

function toInputJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSafeFileName(value: string) {
  return normalizeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildTimestampLabel() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: DETRAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date()).replace(/[ :]/g, '-');
}

function buildOtpRegex(source: string) {
  try {
    return new RegExp(source, 'i');
  } catch {
    return /([A-Z0-9]{4,10})/i;
  }
}

function buildReadyForExecution(config: DetranConfigRow) {
  if (!config) return false;
  return Boolean(
    config.enabled
    && normalizeText(config.sisdevCpf)
    && normalizeText(config.sisdevPassword)
    && (normalizeText(config.empresaCodigo) || normalizeText(config.empresaCnpj) || normalizeText(config.empresaNome))
    && normalizeText(config.gmailEmail)
    && normalizeText(config.gmailClientId)
    && normalizeText(config.gmailClientSecret)
    && normalizeText(config.gmailRefreshToken)
    && normalizeText(config.otpRemetente)
    && normalizeText(config.otpAssunto)
    && normalizeText(config.otpRegex),
  );
}

function detectSuccessText(text: string) {
  const normalized = normalizeSearchText(text);
  return (
    normalized.includes('sucesso')
    || normalized.includes('registrada com sucesso')
    || normalized.includes('registrado com sucesso')
    || normalized.includes('peca registrada')
  );
}

function detectErrorText(text: string) {
  const normalized = normalizeSearchText(text);
  return (
    normalized.includes('erro')
    || normalized.includes('nao foi possivel')
    || normalized.includes('invalido')
    || normalized.includes('obrigatorio')
    || normalized.includes('falhou')
  );
}

function isAuthUrl(url: string) {
  const normalized = normalizeText(url).toLowerCase();
  return normalized.includes('auth.mas.sp.gov.br/login');
}

function isHomeUrl(url: string) {
  const normalized = normalizeText(url).toLowerCase();
  return normalized.includes('home.mas.sp.gov.br');
}

function isManageUrl(url: string) {
  const normalized = normalizeText(url).toLowerCase();
  return normalized.includes('manage.mas.sp.gov.br') || normalized.includes('/maximo/');
}

function isHomeBody(text: string) {
  const normalized = normalizeSearchText(text);
  return (
    normalized.includes('navegador do suite')
    || normalized.includes('seus aplicativos')
    || (normalized.includes('manage') && normalized.includes('mais aplicativos'))
  );
}

function isManageBody(text: string) {
  const normalized = normalizeSearchText(text);
  return (
    normalized.includes('centro de controle')
    || normalized.includes('aplicativos favoritos')
    || normalized.includes('quadro de avisos')
    || normalized.includes('manage')
  );
}

function isOtpBody(text: string) {
  const normalized = normalizeSearchText(text);
  return (
    normalized.includes('inserir codigo')
    || normalized.includes('codigo de verificacao')
    || normalized.includes('enviamos uma mensagem para o seu e-mail')
    || normalized.includes('reenviar codigo')
  );
}

type PortalState = 'auth' | 'home' | 'otp' | 'manage_shell' | 'other';

async function detectPortalState(page: Page): Promise<PortalState> {
  const url = page.url();
  const text = await bodyText(page);

  if (isOtpBody(text)) return 'otp';
  if (isManageUrl(url) || isManageBody(text)) return 'manage_shell';
  if (isHomeUrl(url) || isHomeBody(text)) return 'home';
  if (isAuthUrl(url)) return 'auth';
  return 'other';
}

async function waitForPortalState(
  page: Page,
  accepted: PortalState[],
  timeoutMs: number,
) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    const state = await detectPortalState(page);
    if (accepted.includes(state)) {
      return state;
    }
    await sleep(750);
  }

  return null;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function ensureArtifacts(runId: string): Promise<{ files: ArtifactBundle; runtime: RuntimeArtifacts }> {
  const runDir = path.join(DETRAN_ARTIFACTS_ROOT, toSafeFileName(runId));
  await ensureDir(runDir);
  await ensureDir(DETRAN_SESSION_ROOT);

  return {
    files: {
      runDir,
      networkFile: path.join(runDir, 'network-trace.jsonl'),
      consoleFile: path.join(runDir, 'console.jsonl'),
      pageErrorFile: path.join(runDir, 'page-errors.jsonl'),
      screenshots: [],
      htmlSnapshots: [],
      traces: [],
    },
    runtime: {
      screenshots: [],
      htmlSnapshots: [],
      networkTrace: null,
      consoleLog: null,
      pageErrors: null,
      beforeNextShot: null,
      afterNextShot: null,
      beforeNextHtml: null,
      afterNextHtml: null,
      finalShot: null,
      finalHtml: null,
      storageState: null,
    },
  };
}

async function appendJsonLine(filePath: string, payload: Record<string, unknown>) {
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function loadDetranConfig() {
  return prisma.detranConfig.findUnique({
    where: { slug: DETRAN_CONFIG_SLUG },
  });
}

async function loadExecucaoById(id: number) {
  return prisma.detranExecucao.findUnique({
    where: { id },
    include: {
      etapas: {
        orderBy: { ordem: 'asc' },
      },
    },
  });
}

function resolveExecucaoStatusFromEtapa(currentStatus: string, etapaStatus: string) {
  const current = normalizeText(currentStatus).toLowerCase();
  const next = normalizeText(etapaStatus).toLowerCase();

  if (next === 'error') return 'erro';
  if (next === 'running') return 'executando';
  if (next === 'success' || next === 'skipped') {
    if (current === 'erro' || current === 'cancelada' || current === 'sucesso') {
      return currentStatus;
    }
    return 'executando';
  }

  return currentStatus;
}

async function setExecucaoArtifacts(execucaoId: number, patch: Record<string, unknown>) {
  const current = await prisma.detranExecucao.findUnique({
    where: { id: execucaoId },
    select: { artifacts: true },
  });

  const artifacts = normalizeJsonRecord(current?.artifacts);

  await prisma.detranExecucao.update({
    where: { id: execucaoId },
    data: {
      artifacts: toInputJson({
        ...artifacts,
        ...patch,
      }),
    },
  });
}

async function setExecucaoSummary(execucaoId: number, patch: Record<string, unknown>) {
  const current = await prisma.detranExecucao.findUnique({
    where: { id: execucaoId },
    select: { summary: true },
  });

  const summary = normalizeJsonRecord(current?.summary);

  await prisma.detranExecucao.update({
    where: { id: execucaoId },
    data: {
      summary: toInputJson({
        ...summary,
        ...patch,
      }),
    },
  });
}

async function updateEtapa(
  execucao: DetranExecucaoRecord,
  step: string,
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped',
  patch: {
    message?: string | null;
    url?: string | null;
    title?: string | null;
    data?: Record<string, unknown>;
    startedAt?: Date;
    finishedAt?: Date;
  } = {},
) {
  const currentEtapa = execucao.etapas.find((item) => item.step === step);
  const resolvedStartedAt = patch.startedAt ?? currentEtapa?.startedAt ?? (status === 'running' ? new Date() : undefined);
  const resolvedFinishedAt = patch.finishedAt ?? currentEtapa?.finishedAt ?? (status === 'success' || status === 'error' || status === 'skipped' ? new Date() : undefined);
  const durationMs = resolvedStartedAt && resolvedFinishedAt
    ? Math.max(0, resolvedFinishedAt.getTime() - resolvedStartedAt.getTime())
    : currentEtapa?.durationMs ?? null;

  await prisma.detranExecucaoEtapa.upsert({
    where: {
      execucaoId_step: {
        execucaoId: execucao.id,
        step,
      },
    },
    create: {
      execucaoId: execucao.id,
      ordem: currentEtapa?.ordem ?? 999,
      step,
      status,
      message: normalizeNullableText(patch.message),
      url: normalizeNullableText(patch.url),
      title: normalizeNullableText(patch.title),
      data: toInputJson(patch.data ?? normalizeJsonRecord(currentEtapa?.data)),
      startedAt: resolvedStartedAt,
      finishedAt: resolvedFinishedAt,
      durationMs: durationMs ?? undefined,
    },
    update: {
      status,
      message: patch.message !== undefined ? normalizeNullableText(patch.message) : currentEtapa?.message,
      url: patch.url !== undefined ? normalizeNullableText(patch.url) : currentEtapa?.url,
      title: patch.title !== undefined ? normalizeNullableText(patch.title) : currentEtapa?.title,
      data: toInputJson(patch.data ?? normalizeJsonRecord(currentEtapa?.data)),
      startedAt: resolvedStartedAt,
      finishedAt: resolvedFinishedAt,
      durationMs: durationMs ?? undefined,
    },
  });

  await prisma.detranExecucao.update({
    where: { id: execucao.id },
    data: {
      status: resolveExecucaoStatusFromEtapa(execucao.status, status),
      currentUrl: patch.url !== undefined ? normalizeNullableText(patch.url) : execucao.currentUrl,
      pageTitle: patch.title !== undefined ? normalizeNullableText(patch.title) : execucao.pageTitle,
      updatedAt: new Date(),
    },
  });
}

async function finalizeExecucao(
  execucaoId: number,
  status: 'sucesso' | 'erro' | 'cancelada' | 'executando',
  payload: {
    resultadoMensagem?: string | null;
    errorMessage?: string | null;
    currentUrl?: string | null;
    pageTitle?: string | null;
    summary?: Record<string, unknown>;
    artifacts?: Record<string, unknown>;
  } = {},
) {
  const current = await prisma.detranExecucao.findUnique({
    where: { id: execucaoId },
    select: {
      startedAt: true,
      summary: true,
      artifacts: true,
    },
  });

  const finishedAt = status === 'executando' ? null : new Date();
  const duracaoMs = finishedAt && current?.startedAt
    ? Math.max(0, finishedAt.getTime() - new Date(current.startedAt).getTime())
    : undefined;

  const currentSummary = normalizeJsonRecord(current?.summary);
  const currentArtifacts = normalizeJsonRecord(current?.artifacts);

  await prisma.detranExecucao.update({
    where: { id: execucaoId },
    data: {
      status,
      resultadoMensagem: payload.resultadoMensagem !== undefined ? normalizeNullableText(payload.resultadoMensagem) : undefined,
      errorMessage: payload.errorMessage !== undefined ? normalizeNullableText(payload.errorMessage) : undefined,
      currentUrl: payload.currentUrl !== undefined ? normalizeNullableText(payload.currentUrl) : undefined,
      pageTitle: payload.pageTitle !== undefined ? normalizeNullableText(payload.pageTitle) : undefined,
      duracaoMs,
      finishedAt: finishedAt ?? undefined,
      summary: toInputJson(payload.summary ? { ...currentSummary, ...payload.summary } : currentSummary),
      artifacts: toInputJson(payload.artifacts ? { ...currentArtifacts, ...payload.artifacts } : currentArtifacts),
    },
  });
}

async function markExecucaoErro(
  execucao: DetranExecucaoRecord,
  message: string,
  patch: {
    step?: string;
    currentUrl?: string | null;
    pageTitle?: string | null;
    artifacts?: Record<string, unknown>;
    summary?: Record<string, unknown>;
  } = {},
) {
  if (patch.step) {
    await updateEtapa(execucao, patch.step, 'error', {
      message,
      url: patch.currentUrl ?? null,
      title: patch.pageTitle ?? null,
      finishedAt: new Date(),
      data: patch.summary,
    });
  }

  await finalizeExecucao(execucao.id, 'erro', {
    resultadoMensagem: message,
    errorMessage: message,
    currentUrl: patch.currentUrl ?? null,
    pageTitle: patch.pageTitle ?? null,
    summary: patch.summary,
    artifacts: patch.artifacts,
  });
}

async function saveScreenshot(page: Page, runDir: string, basename: string) {
  const safeName = `${buildTimestampLabel()}-${toSafeFileName(basename)}.png`;
  const filePath = path.join(runDir, safeName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function saveHtml(page: Page, runDir: string, basename: string) {
  const safeName = `${buildTimestampLabel()}-${toSafeFileName(basename)}.html`;
  const filePath = path.join(runDir, safeName);
  const html = await page.content();
  await fs.writeFile(filePath, html, 'utf8');
  return filePath;
}

function buildArtifactsPatch(runtime: RuntimeArtifacts, files: ArtifactBundle) {
  return {
    runDir: files.runDir,
    screenshots: files.screenshots,
    htmlSnapshots: files.htmlSnapshots,
    networkTrace: runtime.networkTrace,
    consoleLog: runtime.consoleLog,
    pageErrors: runtime.pageErrors,
    beforeNextShot: runtime.beforeNextShot,
    afterNextShot: runtime.afterNextShot,
    beforeNextHtml: runtime.beforeNextHtml,
    afterNextHtml: runtime.afterNextHtml,
    finalShot: runtime.finalShot,
    finalHtml: runtime.finalHtml,
    storageState: runtime.storageState,
  };
}

async function maybeCaptureSnapshot(
  execucaoId: number,
  page: Page,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
  basename: string,
) {
  if (!config.screenshotEachStep) return;

  const screenshotPath = await saveScreenshot(page, artifacts.runDir, basename);
  const htmlPath = await saveHtml(page, artifacts.runDir, basename);

  artifacts.screenshots.push(screenshotPath);
  artifacts.htmlSnapshots.push(htmlPath);
  runtime.screenshots.push(screenshotPath);
  runtime.htmlSnapshots.push(htmlPath);

  await setExecucaoArtifactsFromRuntime(execucaoId, runtime, artifacts);
}

async function setExecucaoArtifactsFromRuntime(execucaoId: number, runtime: RuntimeArtifacts, files: ArtifactBundle) {
  await setExecucaoArtifacts(execucaoId, buildArtifactsPatch(runtime, files));
}

async function bodyText(page: Page) {
  try {
    return normalizeText(await page.locator('body').innerText());
  } catch {
    return '';
  }
}

async function firstVisible(page: Page, candidates: Array<() => Locator>) {
  for (const candidate of candidates) {
    try {
      const locator = candidate().first();
      if (await locator.isVisible({ timeout: 500 })) {
        return locator;
      }
    } catch {
      // noop
    }
  }
  return null;
}

async function fillByLabel(page: Page, label: RegExp, value: string, options?: { clear?: boolean }) {
  const locator = await firstVisible(page, [
    () => page.getByLabel(label),
    () => page.getByPlaceholder(label),
    () => page.getByText(label).locator('xpath=following::input[1]'),
    () => page.getByText(label).locator('xpath=following::textarea[1]'),
  ]);

  if (!locator) {
    throw new Error(`Campo nao encontrado para ${label.toString()}.`);
  }

  if (options?.clear !== false) {
    await locator.fill('');
  }
  await locator.fill(value);
  return locator;
}

async function clickByText(page: Page, label: RegExp) {
  const locator = await firstVisible(page, [
    () => page.getByRole('button', { name: label }),
    () => page.getByRole('link', { name: label }),
    () => page.getByText(label),
  ]);

  if (!locator) {
    throw new Error(`Acao nao encontrada para ${label.toString()}.`);
  }

  await locator.click();
}

async function clickFirstVisible(page: Page, candidates: Array<() => Locator>) {
  const locator = await firstVisible(page, candidates);
  if (!locator) {
    throw new Error('Acao solicitada nao foi encontrada na tela.');
  }
  await locator.click();
}

async function clickAndFollowPage(page: Page, locator: Locator) {
  const context = page.context();
  const popupPromise = context.waitForEvent('page', { timeout: 6_000 }).catch(() => null);
  await locator.click();
  const popup = await popupPromise;

  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
    return popup;
  }

  return page;
}

async function clickManage(page: Page) {
  const manageCard = await firstVisible(page, [
    () => page.locator('div,section,article').filter({ has: page.getByText(/^Manage$/i) }),
    () => page.getByText(/^Manage$/i).locator('xpath=ancestor::*[self::div or self::section or self::article][1]'),
  ]);

  if (manageCard) {
    try {
      await manageCard.hover();
      await sleep(800);
    } catch {
      // noop
    }

    const manageStartLocator = await firstVisible(page, [
      () => manageCard.getByRole('button', { name: /iniciar/i }),
      () => manageCard.getByRole('link', { name: /iniciar/i }),
      () => manageCard.getByText(/iniciar/i),
      () => page.getByRole('button', { name: /iniciar/i }),
      () => page.getByRole('link', { name: /iniciar/i }),
      () => page.getByText(/iniciar/i),
    ]);

    if (manageStartLocator) {
      return clickAndFollowPage(page, manageStartLocator);
    }
  }

  throw new Error('O card do Manage apareceu, mas o link Iniciar nao ficou disponivel para clique.');
}

async function submitAuthLogin(page: Page, passwordField: Locator) {
  try {
    await clickFirstVisible(page, [
      () => page.locator('button[type="submit"]'),
      () => page.getByRole('button', { name: /entrar|login|avancar|continuar/i }),
      () => page.getByText(/entrar|login|avancar|continuar/i),
    ]);
  } catch {
    await passwordField.press('Enter');
  }
}

async function waitForPostLoginState(page: Page, timeoutMs: number) {
  return waitForPortalState(page, ['home', 'otp', 'manage_shell'], timeoutMs);
}

async function waitForManageReady(page: Page, timeoutMs: number) {
  const state = await waitForPortalState(page, ['otp', 'manage_shell'], timeoutMs);
  return state === 'otp' || state === 'manage_shell';
}

async function waitForOtpScreen(page: Page) {
  const otpLocator = await firstVisible(page, [
    () => page.getByText(/Inserir c[oó]digo/i),
    () => page.getByText(/Codigo/i),
  ]);

  return otpLocator !== null;
}

async function readMessageBody(gmailPayload: any): Promise<string> {
  const tryDecode = (data: string | undefined | null) => {
    const raw = normalizeText(data);
    if (!raw) return '';
    return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  };

  const walkParts = (payload: any): string => {
    if (!payload) return '';

    const mimeType = normalizeText(payload.mimeType).toLowerCase();
    if (mimeType === 'text/plain' || mimeType === 'text/html') {
      return tryDecode(payload.body?.data);
    }

    if (Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        const content = walkParts(part);
        if (content) return content;
      }
    }

    return tryDecode(payload.body?.data);
  };

  return walkParts(gmailPayload);
}

async function waitForOtpCode(config: DetranConfigRecord, notBefore: Date, onPoll?: (message: string) => Promise<void>) {
  const oauth2Client = new google.auth.OAuth2(
    normalizeText(config.gmailClientId),
    normalizeText(config.gmailClientSecret),
  );
  oauth2Client.setCredentials({
    refresh_token: normalizeText(config.gmailRefreshToken),
  });

  const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });

  const startedAt = Date.now();
  const otpRegex = buildOtpRegex(normalizeText(config.otpRegex));
  const remetente = normalizeSearchText(config.otpRemetente);
  const assunto = normalizeSearchText(config.otpAssunto);
  let lastSeenMessageId = '';

  while ((Date.now() - startedAt) < OTP_WAIT_TIMEOUT_MS) {
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: `from:${normalizeText(config.otpRemetente)}`,
    });

    const messages = list.data.messages || [];
    for (const message of messages) {
      if (!message.id || message.id === lastSeenMessageId) continue;

      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });

      const internalDate = Number(details.data.internalDate || 0);
      const sentAt = Number.isFinite(internalDate) ? new Date(internalDate) : null;
      if (sentAt && sentAt.getTime() < notBefore.getTime() - 60_000) {
        continue;
      }

      const headers = details.data.payload?.headers || [];
      const from = normalizeSearchText(headers.find((item: any) => normalizeText(item?.name).toLowerCase() === 'from')?.value);
      const subject = normalizeSearchText(headers.find((item: any) => normalizeText(item?.name).toLowerCase() === 'subject')?.value);

      if (remetente && !from.includes(remetente)) continue;
      if (assunto && !subject.includes(assunto)) continue;

      const content = await readMessageBody(details.data.payload);
      const match = otpRegex.exec(content);
      lastSeenMessageId = message.id;

      if (!match?.[1]) {
        if (onPoll) await onPoll('Email do OTP encontrado, mas o regex nao localizou o codigo ainda.');
        continue;
      }

      return {
        code: match[1],
        messageId: message.id,
        subject: headers.find((item: any) => normalizeText(item?.name).toLowerCase() === 'subject')?.value || '',
        from: headers.find((item: any) => normalizeText(item?.name).toLowerCase() === 'from')?.value || '',
        receivedAt: sentAt?.toISOString() || '',
        snippet: normalizeText(details.data.snippet),
      };
    }

    if (onPoll) {
      await onPoll('Aguardando email com o codigo do SISDEV...');
    }
    await sleep(OTP_POLL_INTERVAL_MS);
  }

  throw new Error('Tempo esgotado aguardando o codigo OTP no Gmail.');
}

async function performLogin(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'login_auth_mas', 'running', {
    message: 'Abrindo a home do MAS e validando a autenticacao.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' }).catch(async () => {
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });
  });
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  const locateLoginFields = async () => ({
    cpfField: await firstVisible(page, [
      () => page.getByLabel(/cpf|usuario|usu.rio/i),
      () => page.getByPlaceholder(/cpf|usuario|usu.rio/i),
      () => page.locator('input[type="text"]'),
    ]),
    passwordField: await firstVisible(page, [
      () => page.getByLabel(/senha/i),
      () => page.getByPlaceholder(/senha/i),
      () => page.locator('input[type="password"]'),
    ]),
  });
  let portalState = await detectPortalState(page);
  let submittedCredentials = false;
  let { cpfField, passwordField } = await locateLoginFields();
  if ((!cpfField || !passwordField) && portalState === 'auth') {
    await sleep(4_000);
    ({ cpfField, passwordField } = await locateLoginFields());
  }
  if (cpfField && passwordField) {
    await cpfField.fill(normalizeText(config.sisdevCpf));
    await passwordField.fill(normalizeText(config.sisdevPassword));
    await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '01-auth-form');
    await submitAuthLogin(page, passwordField);
    submittedCredentials = true;
    const postLoginState = await waitForPostLoginState(page, 20_000);
    if (!postLoginState) {
      await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '02-auth-stuck');
      throw new Error('As credenciais foram enviadas, mas o portal nao voltou para a home do MAS nem avancou para o OTP.');
    }
    portalState = postLoginState;
    await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  } else {
    portalState = await detectPortalState(page);
  }
  if (!submittedCredentials && portalState === 'auth') {
    await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '01-auth-no-form');
    throw new Error('A tela de autenticacao ficou no auth MAS sem mostrar o formulario nem liberar a home do MAS.');
  }
  if (!['home', 'otp', 'manage_shell'].includes(portalState)) {
    await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '02-auth-unknown-state');
    throw new Error('Depois do login, o portal nao exibiu a home do MAS, o OTP nem a shell do Manage.');
  }
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '02-auth-after-login');
  await updateEtapa(execucao, 'login_auth_mas', 'success', {
    message: submittedCredentials
      ? portalState === 'home'
        ? 'Credenciais enviadas e a home do MAS carregou com os aplicativos.'
        : portalState === 'otp'
        ? 'Credenciais enviadas e o portal avancou direto para a tela de OTP.'
        : 'Credenciais enviadas e a shell do Manage abriu sem novo OTP.'
      : portalState === 'home'
      ? 'Sessao valida reaproveitada na home do MAS.'
      : portalState === 'otp'
      ? 'Sessao reaproveitada e o portal abriu direto na tela de OTP.'
      : 'Sessao reaproveitada com shell do Manage ja acessivel.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      portalState,
      submittedCredentials,
    },
    finishedAt: new Date(),
  });
}

async function performManageSelection(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) : Promise<Page> {
  await updateEtapa(execucao, 'selecionar_manage', 'running', {
    message: 'Localizando o card Manage e clicando em Iniciar.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });
  let portalState = await detectPortalState(page);
  if (portalState === 'otp' || portalState === 'manage_shell') {
    await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '03-manage-already-progressed');
    await updateEtapa(execucao, 'selecionar_manage', 'success', {
      message: portalState === 'otp'
        ? 'O fluxo do Manage ja estava na tela de OTP antes do clique em Iniciar.'
        : 'O fluxo do Manage ja estava aberto antes do clique em Iniciar.',
      url: page.url(),
      title: await page.title().catch(() => ''),
      data: {
        portalState,
        clickedIniciar: false,
      },
      finishedAt: new Date(),
    });
    return page;
  }
  if (portalState !== 'home') {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await sleep(PAGE_WAIT_AFTER_ACTION_MS);
    portalState = await detectPortalState(page);
  }
  if (portalState !== 'home') {
    const waitedHomeState = await waitForPortalState(page, ['home', 'otp', 'manage_shell'], 15_000);
    portalState = waitedHomeState ?? await detectPortalState(page);
  }
  if (portalState === 'otp' || portalState === 'manage_shell') {
    await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '03-manage-auto-progressed');
    await updateEtapa(execucao, 'selecionar_manage', 'success', {
      message: portalState === 'otp'
        ? 'O portal pulou para o OTP antes de clicar manualmente no Iniciar.'
        : 'A shell do Manage abriu antes de clicar no Iniciar.',
      url: page.url(),
      title: await page.title().catch(() => ''),
      data: {
        portalState,
        clickedIniciar: false,
      },
      finishedAt: new Date(),
    });
    return page;
  }
  if (portalState !== 'home') {
    throw new Error('Depois do login, a home do MAS nao exibiu o card Manage para clicar em Iniciar.');
  }
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '03-home-before-manage');
  const nextPage = await clickManage(page);
  if (nextPage !== page) {
    page = nextPage;
  }
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  const manageState = await waitForPortalState(page, ['otp', 'manage_shell'], 20_000);
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '04-manage-after-start');
  const currentUrl = page.url();
  const currentTitle = await page.title().catch(() => '');
  const currentBody = await bodyText(page);
  if (!manageState && !isManageUrl(currentUrl) && !isManageBody(currentBody) && !isOtpBody(currentBody)) {
    throw new Error('O clique em Iniciar no Manage nao disparou a tela do codigo nem abriu o app.');
  }
  await updateEtapa(execucao, 'selecionar_manage', 'success', {
    message: isOtpBody(currentBody)
      ? 'Iniciar do Manage clicado com sucesso; a tela de OTP apareceu.'
      : 'Iniciar do Manage clicado com sucesso; a shell do Manage abriu.',
    url: currentUrl,
    title: currentTitle,
    data: {
      manageUrl: currentUrl,
      clickedIniciar: true,
      portalState: manageState ?? 'other',
      otpDetected: isOtpBody(currentBody),
    },
    finishedAt: new Date(),
  });
  return page;
}

async function performOtp(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'otp_email', 'running', {
    message: 'Aguardando a tela do codigo e a chegada do OTP por email.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  let portalState = await detectPortalState(page);
  let otpVisible = portalState === 'otp';
  if (!otpVisible) {
    otpVisible = await waitForOtpScreen(page);
    if (otpVisible) {
      portalState = 'otp';
    }
  }
  if (!otpVisible) {
    if (portalState === 'manage_shell') {
      await updateEtapa(execucao, 'otp_email', 'skipped', {
        message: 'O Manage abriu sem solicitar novo codigo OTP nesta sessao.',
        url: page.url(),
        title: await page.title().catch(() => ''),
        finishedAt: new Date(),
      });
      return;
    }
    throw new Error('Depois de clicar em Iniciar no Manage, a tela para inserir o codigo nao apareceu.');
  }
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '04-otp-screen');
  const otpInfo = await waitForOtpCode(config, new Date(execucao.createdAt), async (message) => {
    await updateEtapa(execucao, 'otp_email', 'running', {
      message,
      url: page.url(),
      title: await page.title().catch(() => ''),
      data: {
        polling: true,
      },
    });
  });
  const otpField = await firstVisible(page, [
    () => page.getByLabel(/codigo|c.digo/i),
    () => page.locator('input[type="text"]'),
    () => page.locator('input'),
  ]);
  if (!otpField) {
    throw new Error('Campo do codigo OTP nao foi encontrado na tela.');
  }
  await otpField.fill(otpInfo.code);
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '05-otp-filled');
  await clickByText(page, /entrar|confirmar|continuar/i);
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  const afterOtpState = await waitForPortalState(page, ['manage_shell'], 20_000);
  await updateEtapa(execucao, 'otp_email', 'success', {
    message: `Codigo OTP obtido por Gmail e enviado ao portal. Email: ${otpInfo.subject || 'sem assunto'}.`,
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      portalStateAfterOtp: afterOtpState ?? 'other',
      otpEmailSubject: otpInfo.subject,
      otpEmailFrom: otpInfo.from,
      otpEmailReceivedAt: otpInfo.receivedAt,
      otpSnippet: otpInfo.snippet,
    },
    finishedAt: new Date(),
  });
}

async function performCentroControle(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'centro_controle', 'running', {
    message: 'Abrindo Centro de Controle.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  const alreadyThere = normalizeSearchText(await bodyText(page)).includes('centro de controle');
  if (!alreadyThere) {
    await clickByText(page, /centro de controle/i);
    await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  }

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '06-centro-controle');
  await updateEtapa(execucao, 'centro_controle', 'success', {
    message: 'Centro de Controle visivel no Manage.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    finishedAt: new Date(),
  });
}

async function performSelecionarEmpresa(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'selecionar_empresa', 'running', {
    message: 'Selecionando a empresa configurada no SISDEV.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  const body = await bodyText(page);
  const companyTokens = [
    normalizeText(config.empresaCodigo),
    normalizeText(config.empresaCnpj),
    normalizeText(config.empresaNome),
  ].filter(Boolean);

  const alreadySelected = companyTokens.some((token) => normalizeSearchText(body).includes(normalizeSearchText(token)))
    && normalizeSearchText(body).includes('entrada de pecas avulsas') === false
    && normalizeSearchText(body).includes('registrar entrada de veiculos') === false;

  if (!alreadySelected) {
    let clicked = false;
    for (const token of companyTokens) {
      const locator = await firstVisible(page, [
        () => page.getByText(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
      ]);
      if (!locator) continue;
      await locator.click();
      clicked = true;
      break;
    }

    if (!clicked) {
      throw new Error('Nao foi possivel localizar a empresa configurada na lista do Centro de Controle.');
    }
    await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  }

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '07-empresa');
  await updateEtapa(execucao, 'selecionar_empresa', 'success', {
    message: 'Empresa selecionada com sucesso.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    finishedAt: new Date(),
  });
}

async function performAbrirEntradaPecasAvulsas(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'abrir_entrada_pecas_avulsas', 'running', {
    message: 'Abrindo o fluxo de Entrada de Pecas Avulsas.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  const body = normalizeSearchText(await bodyText(page));
  if (!body.includes('entrada de pecas avulsas')) {
    await clickByText(page, /entrada de pecas avulsas/i);
    await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  }

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '08-entrada-pecas-avulsas');
  await updateEtapa(execucao, 'abrir_entrada_pecas_avulsas', 'success', {
    message: 'Tela de Entrada de Pecas Avulsas aberta.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    finishedAt: new Date(),
  });
}

async function performConsultarVeiculo(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'consultar_veiculo', 'running', {
    message: 'Preenchendo identificadores do veiculo e consultando no portal.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  if (normalizeText(execucao.renavam)) {
    await fillByLabel(page, /renavam/i, normalizeText(execucao.renavam));
  }
  if (normalizeText(execucao.placa)) {
    await fillByLabel(page, /placa/i, normalizeText(execucao.placa));
  }
  if (normalizeText(execucao.chassi)) {
    await fillByLabel(page, /chassi/i, normalizeText(execucao.chassi));
  }

  if (normalizeText(execucao.notaFiscalEntrada)) {
    await fillByLabel(page, /nota fiscal/i, normalizeText(execucao.notaFiscalEntrada));
  }

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '09-before-consulta');
  await clickByText(page, /consultar ve[ií]culo/i);
  await sleep(PAGE_WAIT_AFTER_ACTION_MS * 2);

  const pageText = await bodyText(page);
  const vehicleMatched = [
    normalizeText(execucao.placa),
    normalizeText(execucao.renavam),
    normalizeText(execucao.chassi),
  ].filter(Boolean).some((value) => normalizeSearchText(pageText).includes(normalizeSearchText(value)));

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '10-after-consulta');
  await updateEtapa(execucao, 'consultar_veiculo', vehicleMatched ? 'success' : 'error', {
    message: vehicleMatched
      ? 'Consulta do veiculo concluida; os dados informados apareceram na tela.'
      : 'Consulta executada, mas os dados do veiculo nao ficaram evidentes na tela. Revise o log capturado.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      vehicleMatched,
      screenExcerpt: pageText.slice(0, 1200),
    },
    finishedAt: new Date(),
  });

  if (!vehicleMatched) {
    throw new Error('O portal nao exibiu os dados esperados do veiculo apos a consulta.');
  }
}

async function performSelecionarTipoPeca(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'selecionar_tipo_peca', 'running', {
    message: 'Preenchendo o tipo de peca diretamente na tela.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  await fillByLabel(page, /tipo de peca|tipo de pe[aç]a/i, normalizeText(execucao.tipoPeca));
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '11-tipo-peca');

  await updateEtapa(execucao, 'selecionar_tipo_peca', 'success', {
    message: `Tipo de peca preenchido com o valor "${normalizeText(execucao.tipoPeca)}".`,
    url: page.url(),
    title: await page.title().catch(() => ''),
    finishedAt: new Date(),
  });
}

async function performSelecionarEtiqueta(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'selecionar_etiqueta', 'running', {
    message: 'Preenchendo a etiqueta/cartela informada na execucao.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  const etiqueta = normalizeText(execucao.etiquetaInformada) || normalizeText(execucao.cartelaNumero);
  if (!etiqueta) {
    throw new Error('Nenhuma etiqueta/cartela valida foi informada na execucao.');
  }

  await fillByLabel(page, /numero da peca avulsa|n[uú]mero da pe[aç]a avulsa/i, etiqueta);
  await sleep(PAGE_WAIT_AFTER_ACTION_MS);
  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '12-etiqueta');

  await updateEtapa(execucao, 'selecionar_etiqueta', 'success', {
    message: `Etiqueta/cartela preenchida com "${etiqueta}".`,
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      modoEtiqueta: execucao.modoEtiqueta,
      etiqueta,
    },
    finishedAt: new Date(),
  });
}

async function performProximo(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'proximo', 'running', {
    message: 'Clicando em Proximo e capturando tudo o que acontecer na tela.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  runtime.beforeNextShot = await saveScreenshot(page, artifacts.runDir, '13-before-proximo');
  runtime.beforeNextHtml = await saveHtml(page, artifacts.runDir, '13-before-proximo');
  artifacts.screenshots.push(runtime.beforeNextShot);
  artifacts.htmlSnapshots.push(runtime.beforeNextHtml);

  await clickByText(page, /pr[oó]ximo/i);

  try {
    await page.waitForLoadState('networkidle', { timeout: PROXIMO_WAIT_TIMEOUT_MS });
  } catch {
    await sleep(PAGE_WAIT_AFTER_ACTION_MS * 2);
  }

  runtime.afterNextShot = await saveScreenshot(page, artifacts.runDir, '14-after-proximo');
  runtime.afterNextHtml = await saveHtml(page, artifacts.runDir, '14-after-proximo');
  artifacts.screenshots.push(runtime.afterNextShot);
  artifacts.htmlSnapshots.push(runtime.afterNextHtml);

  const excerpt = (await bodyText(page)).slice(0, 1600);

  await updateEtapa(execucao, 'proximo', 'success', {
    message: 'Clique em Proximo executado; tela posterior capturada para analise.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      afterNextExcerpt: excerpt,
    },
    finishedAt: new Date(),
  });
}

async function performAutenticacaoConfirmacao(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'abrir_manage', 'running', {
    message: 'Validando se o Manage ficou acessivel depois da autenticacao.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  await maybeCaptureSnapshot(execucao.id, page, config, artifacts, runtime, '06-auth-manage');
  const text = await bodyText(page);
  const currentUrl = page.url();
  const pageTitle = await page.title().catch(() => '');
  const manageReady = currentUrl.includes('manage.mas.sp.gov.br')
    || normalizeSearchText(text).includes('manage')
    || normalizeSearchText(text).includes('centro de controle');

  await updateEtapa(execucao, 'abrir_manage', manageReady ? 'success' : 'error', {
    message: manageReady
      ? 'Manage acessivel apos login e OTP.'
      : 'O login passou, mas o Manage nao ficou claro na tela final.',
    url: currentUrl,
    title: pageTitle,
    data: {
      excerpt: text.slice(0, 1200),
      manageReady,
    },
    finishedAt: new Date(),
  });

  if (!manageReady) {
    throw new Error('O fluxo de autenticacao nao chegou claramente ao Manage.');
  }

  runtime.finalShot = await saveScreenshot(page, artifacts.runDir, '07-auth-final');
  runtime.finalHtml = await saveHtml(page, artifacts.runDir, '07-auth-final');
  artifacts.screenshots.push(runtime.finalShot);
  artifacts.htmlSnapshots.push(runtime.finalHtml);
  await setExecucaoArtifacts(execucao.id, buildArtifactsPatch(runtime, artifacts));

  await finalizeExecucao(execucao.id, 'sucesso', {
    resultadoMensagem: 'Autenticacao concluida com sucesso e Manage acessivel.',
    currentUrl,
    pageTitle,
    summary: {
      flow: execucao.flow,
      manageReady: true,
    },
    artifacts: buildArtifactsPatch(runtime, artifacts),
  });
}

async function performConfirmacao(
  page: Page,
  execucao: DetranExecucaoRecord,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  await updateEtapa(execucao, 'confirmacao', 'running', {
    message: 'Lendo a mensagem final da tela para decidir o resultado da POC.',
    url: page.url(),
    title: await page.title().catch(() => ''),
  });

  const finalText = await bodyText(page);
  runtime.finalShot = await saveScreenshot(page, artifacts.runDir, '15-final');
  runtime.finalHtml = await saveHtml(page, artifacts.runDir, '15-final');
  artifacts.screenshots.push(runtime.finalShot);
  artifacts.htmlSnapshots.push(runtime.finalHtml);

  const success = detectSuccessText(finalText);
  const error = detectErrorText(finalText);
  const excerpt = finalText.slice(0, 2000);

  await updateEtapa(execucao, 'confirmacao', success ? 'success' : error ? 'error' : 'success', {
    message: success
      ? 'Mensagem final de sucesso encontrada na tela.'
      : error
      ? 'Tela final trouxe um indicio de erro ou validacao.'
      : 'Tela final capturada sem uma frase conclusiva; revisar excerpt e screenshots.',
    url: page.url(),
    title: await page.title().catch(() => ''),
    data: {
      success,
      error,
      finalExcerpt: excerpt,
    },
    finishedAt: new Date(),
  });

  await finalizeExecucao(execucao.id, success ? 'sucesso' : error ? 'erro' : 'sucesso', {
    resultadoMensagem: success
      ? excerpt || 'Fluxo executado sem erro visivel na tela final.'
      : excerpt || 'Fluxo executado, mas a tela final trouxe um retorno inconclusivo.',
    errorMessage: error ? excerpt || 'Erro detectado na tela final.' : null,
    currentUrl: page.url(),
    pageTitle: await page.title().catch(() => ''),
    summary: {
      flow: execucao.flow,
      success,
      error,
      finalExcerpt: excerpt,
    },
    artifacts: {
      screenshots: artifacts.screenshots,
      htmlSnapshots: artifacts.htmlSnapshots,
      networkTrace: runtime.networkTrace,
      consoleLog: runtime.consoleLog,
      pageErrors: runtime.pageErrors,
      beforeNextShot: runtime.beforeNextShot,
      afterNextShot: runtime.afterNextShot,
      beforeNextHtml: runtime.beforeNextHtml,
      afterNextHtml: runtime.afterNextHtml,
      finalShot: runtime.finalShot,
      finalHtml: runtime.finalHtml,
      storageState: runtime.storageState,
    },
  });
}

async function attachTelemetry(
  context: BrowserContext,
  page: Page,
  config: DetranConfigRecord,
  artifacts: ArtifactBundle,
  runtime: RuntimeArtifacts,
) {
  runtime.networkTrace = artifacts.networkFile;
  runtime.consoleLog = artifacts.consoleFile;
  runtime.pageErrors = artifacts.pageErrorFile;

  page.on('console', (message) => {
    void appendJsonLine(artifacts.consoleFile, {
      ts: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on('pageerror', (error) => {
    void appendJsonLine(artifacts.pageErrorFile, {
      ts: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
    });
  });

  if (!config.captureNetworkTrace) return;

  page.on('request', (request) => {
    void appendJsonLine(artifacts.networkFile, {
      ts: new Date().toISOString(),
      stage: 'request',
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
    });
  });

  page.on('response', async (response) => {
    void appendJsonLine(artifacts.networkFile, {
      ts: new Date().toISOString(),
      stage: 'response',
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
    });
  });

  void context;
}

async function runExecucao(execucaoId: number) {
  const config = await loadDetranConfig();
  const execucao = await loadExecucaoById(execucaoId);

  if (!execucao) return;

  const { files: artifacts, runtime } = await ensureArtifacts(execucao.runId);
  await setExecucaoSummary(execucao.id, {
    startedByWorkerAt: new Date().toISOString(),
    workerVersion: 'detran-worker-v2',
  });

  if (!buildReadyForExecution(config)) {
    await markExecucaoErro(execucao, 'Configuracao do Detran incompleta para executar a automacao real.', {
      artifacts: {
        runDir: artifacts.runDir,
      },
      summary: {
        configReady: false,
      },
    });
    return;
  }
  const readyConfig = config as DetranConfigRecord;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: !!readyConfig.runHeadless,
      args: ['--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 960 },
      storageState: readyConfig.reuseSession && await fileExists(DETRAN_SESSION_FILE) ? DETRAN_SESSION_FILE : undefined,
    });
    page = await context.newPage();
    page.setDefaultTimeout(Math.max(30_000, Number(readyConfig.timeoutMs || 120_000)));
    page.setDefaultNavigationTimeout(Math.max(30_000, Number(readyConfig.timeoutMs || 120_000)));

    await attachTelemetry(context, page, readyConfig, artifacts, runtime);
    await setExecucaoArtifacts(execucao.id, {
      runDir: artifacts.runDir,
      networkTrace: runtime.networkTrace,
      consoleLog: runtime.consoleLog,
      pageErrors: runtime.pageErrors,
    });

    await performLogin(page, execucao, readyConfig, artifacts, runtime);
    page = await performManageSelection(page, execucao, readyConfig, artifacts, runtime);
    await performOtp(page, execucao, readyConfig, artifacts, runtime);

    if (readyConfig.reuseSession) {
      await ensureDir(DETRAN_SESSION_ROOT);
      await context.storageState({ path: DETRAN_SESSION_FILE });
      runtime.storageState = DETRAN_SESSION_FILE;
    }

    if (execucao.flow === 'autenticacao_poc') {
      await performAutenticacaoConfirmacao(page, execucao, readyConfig, artifacts, runtime);
      return;
    }

    await performCentroControle(page, execucao, readyConfig, artifacts, runtime);
    await performSelecionarEmpresa(page, execucao, readyConfig, artifacts, runtime);
    await performAbrirEntradaPecasAvulsas(page, execucao, readyConfig, artifacts, runtime);
    await performConsultarVeiculo(page, execucao, readyConfig, artifacts, runtime);
    await performSelecionarTipoPeca(page, execucao, readyConfig, artifacts, runtime);
    await performSelecionarEtiqueta(page, execucao, readyConfig, artifacts, runtime);
    await performProximo(page, execucao, readyConfig, artifacts, runtime);
    await setExecucaoArtifacts(execucao.id, buildArtifactsPatch(runtime, artifacts));
    await performConfirmacao(page, execucao, readyConfig, artifacts, runtime);
  } catch (error: any) {
    const currentExecucao = await loadExecucaoById(execucao.id);
    const message = normalizeText(error?.message || error) || 'Falha inesperada ao executar a automacao do Detran.';
    const currentUrl = page ? page.url() : currentExecucao?.currentUrl || null;
    const pageTitle = page ? await page.title().catch(() => '') : currentExecucao?.pageTitle || null;

    if (page) {
      try {
        runtime.finalShot = await saveScreenshot(page, artifacts.runDir, 'error-final');
        runtime.finalHtml = await saveHtml(page, artifacts.runDir, 'error-final');
        artifacts.screenshots.push(runtime.finalShot);
        artifacts.htmlSnapshots.push(runtime.finalHtml);
      } catch {
        // noop
      }
    }

    await markExecucaoErro(currentExecucao || execucao, message, {
      currentUrl,
      pageTitle,
      artifacts: buildArtifactsPatch(runtime, artifacts),
      summary: {
        workerVersion: 'detran-worker-v2',
        failedAt: new Date().toISOString(),
        flow: execucao.flow,
      },
    });
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function tickDetranWorker() {
  if (workerState.running) return;

  const next = await prisma.detranExecucao.findFirst({
    where: { status: 'pendente' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, runId: true },
  });

  if (!next) return;

  workerState.running = true;
  workerState.currentRunId = next.runId;

  try {
    await runExecucao(next.id);
  } catch (error) {
    console.error('Falha no tick do worker Detran:', error);
  } finally {
    workerState.running = false;
    workerState.currentRunId = '';
  }
}

export function startDetranExecutionWorker() {
  if (workerState.started) return;
  workerState.started = true;

  const run = () => {
    void tickDetranWorker();
  };

  setTimeout(run, DETRAN_BOOT_DELAY_MS);
  setInterval(run, DETRAN_POLL_INTERVAL_MS);
}
