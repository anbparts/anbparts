import { randomUUID } from 'crypto';
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const detranRouter = Router();

const DETRAN_ALLOWED_USER = 'bruno';
const DEFAULT_CONFIG_SLUG = 'default';

const FLOW_STEP_TEMPLATES: Record<string, Array<{ ordem: number; step: string; label: string; hint?: string }>> = {
  peca_avulsa_poc: [
    { ordem: 1, step: 'login_auth_mas', label: 'Login no auth MAS', hint: 'Acessar auth.mas.sp.gov.br e preencher CPF + senha.' },
    { ordem: 2, step: 'selecionar_manage', label: 'Selecionar Manage', hint: 'Entrar no app Manage dentro do portal MAS.' },
    { ordem: 3, step: 'otp_email', label: 'Ler OTP do Gmail', hint: 'Ler o codigo enviado pelo Detran e concluir a autenticacao.' },
    { ordem: 4, step: 'centro_controle', label: 'Abrir Centro de Controle', hint: 'Navegar ate o atalho de Centro de Controle.' },
    { ordem: 5, step: 'selecionar_empresa', label: 'Selecionar empresa', hint: 'Clicar no CNPJ/codigo da empresa de desmonte.' },
    { ordem: 6, step: 'abrir_entrada_pecas_avulsas', label: 'Abrir Entrada de Pecas Avulsas', hint: 'Entrar no fluxo de registro da etiqueta avulsa.' },
    { ordem: 7, step: 'consultar_veiculo', label: 'Consultar veiculo', hint: 'Consultar por renavam, placa e/ou chassi.' },
    { ordem: 8, step: 'selecionar_tipo_peca', label: 'Selecionar tipo de peca', hint: 'Abrir a lupa e escolher o tipo correto da peca.' },
    { ordem: 9, step: 'selecionar_etiqueta', label: 'Selecionar etiqueta/cartela', hint: 'Informar etiqueta direta ou selecionar cartela na lista.' },
    { ordem: 10, step: 'proximo', label: 'Avancar no Proximo', hint: 'Clicar em Proximo e capturar tudo que acontecer na tela.' },
    { ordem: 11, step: 'confirmacao', label: 'Confirmacao final', hint: 'Ler a mensagem de sucesso/erro e registrar evidencias.' },
  ],
  autenticacao_poc: [
    { ordem: 1, step: 'login_auth_mas', label: 'Login no auth MAS' },
    { ordem: 2, step: 'selecionar_manage', label: 'Selecionar Manage' },
    { ordem: 3, step: 'otp_email', label: 'Ler OTP do Gmail' },
    { ordem: 4, step: 'abrir_manage', label: 'Confirmar acesso ao Manage' },
  ],
};

const detranConfigSchema = z.object({
  enabled: z.boolean().optional(),
  sisdevCpf: z.string().trim().optional(),
  sisdevPassword: z.string().optional(),
  empresaCnpj: z.string().trim().optional(),
  empresaCodigo: z.string().trim().optional(),
  empresaNome: z.string().trim().optional(),
  gmailEmail: z.string().trim().optional(),
  gmailClientId: z.string().trim().optional(),
  gmailClientSecret: z.string().optional(),
  gmailRefreshToken: z.string().optional(),
  otpRemetente: z.string().trim().optional(),
  otpAssunto: z.string().trim().optional(),
  otpRegex: z.string().trim().optional(),
  reuseSession: z.boolean().optional(),
  runHeadless: z.boolean().optional(),
  timeoutMs: z.number().int().min(10_000).max(600_000).optional(),
  screenshotEachStep: z.boolean().optional(),
  htmlAfterProximo: z.boolean().optional(),
  captureNetworkTrace: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const createExecucaoSchema = z.object({
  flow: z.enum(['peca_avulsa_poc', 'autenticacao_poc']).default('peca_avulsa_poc'),
  placa: z.string().trim().optional().nullable(),
  renavam: z.string().trim().optional().nullable(),
  chassi: z.string().trim().optional().nullable(),
  tipoPeca: z.string().trim().optional().nullable(),
  notaFiscalEntrada: z.string().trim().optional().nullable(),
  cartelaNumero: z.string().trim().optional().nullable(),
  etiquetaInformada: z.string().trim().optional().nullable(),
  modoEtiqueta: z.enum(['direta', 'lista']).default('direta'),
  observacoes: z.string().trim().optional().nullable(),
  metadata: z.record(z.any()).optional().default({}),
}).superRefine((value, ctx) => {
  if (!value.placa && !value.renavam && !value.chassi) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['placa'],
      message: 'Informe ao menos placa, renavam ou chassi para identificar o veiculo.',
    });
  }

  if (value.flow === 'peca_avulsa_poc') {
    if (!value.tipoPeca) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tipoPeca'],
        message: 'Informe o tipo de peca da POC.',
      });
    }

    if (!value.notaFiscalEntrada) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notaFiscalEntrada'],
        message: 'Informe o numero da nota fiscal de entrada.',
      });
    }

    if (value.modoEtiqueta === 'direta' && !value.etiquetaInformada) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etiquetaInformada'],
        message: 'Informe a etiqueta quando o modo direto estiver selecionado.',
      });
    }

    if (value.modoEtiqueta === 'lista' && !value.cartelaNumero) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cartelaNumero'],
        message: 'Informe a cartela quando o modo lista estiver selecionado.',
      });
    }
  }
});

const listExecucoesQuerySchema = z.object({
  status: z.string().trim().optional(),
  flow: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(30),
});

const updateEtapaSchema = z.object({
  status: z.enum(['pending', 'running', 'success', 'error', 'skipped']),
  message: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  data: z.record(z.any()).optional(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});

const finalizarExecucaoSchema = z.object({
  status: z.enum(['sucesso', 'erro', 'cancelada', 'executando']),
  resultadoMensagem: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  currentUrl: z.string().optional().nullable(),
  pageTitle: z.string().optional().nullable(),
  duracaoMs: z.number().int().min(0).max(86_400_000).optional(),
  summary: z.record(z.any()).optional(),
  artifacts: z.record(z.any()).optional(),
  finishedAt: z.string().datetime().optional(),
});

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeUsername(req: any) {
  return normalizeText(req?.authUser?.username).toLowerCase();
}

function assertBruno(req: any, res: any) {
  if (normalizeUsername(req) !== DETRAN_ALLOWED_USER) {
    res.status(403).json({ error: 'Modulo Detran liberado somente para o usuario Bruno por enquanto.' });
    return false;
  }
  return true;
}

function maskConfiguredSecret(value: string) {
  return normalizeText(value).length > 0;
}

function buildConfigReadiness(config: any) {
  const hasSisdevLogin = Boolean(normalizeText(config?.sisdevCpf) && normalizeText(config?.sisdevPassword));
  const hasEmpresa = Boolean(normalizeText(config?.empresaCnpj) || normalizeText(config?.empresaCodigo) || normalizeText(config?.empresaNome));
  const hasGmailBase = Boolean(normalizeText(config?.gmailEmail) && normalizeText(config?.gmailClientId));
  const hasGmailFull = Boolean(hasGmailBase && normalizeText(config?.gmailClientSecret) && normalizeText(config?.gmailRefreshToken));
  const hasOtpRules = Boolean(normalizeText(config?.otpRemetente) && normalizeText(config?.otpAssunto) && normalizeText(config?.otpRegex));

  return {
    hasSisdevLogin,
    hasEmpresa,
    hasGmailBase,
    hasGmailFull,
    hasOtpRules,
    readyForPoc: Boolean(config?.enabled && hasSisdevLogin && hasEmpresa && hasGmailFull && hasOtpRules),
  };
}

function serializeConfig(config: any) {
  const readiness = buildConfigReadiness(config);

  return {
    slug: config.slug,
    enabled: Boolean(config.enabled),
    sisdevCpf: config.sisdevCpf || '',
    empresaCnpj: config.empresaCnpj || '',
    empresaCodigo: config.empresaCodigo || '',
    empresaNome: config.empresaNome || '',
    gmailEmail: config.gmailEmail || '',
    gmailClientId: config.gmailClientId || '',
    otpRemetente: config.otpRemetente || '',
    otpAssunto: config.otpAssunto || '',
    otpRegex: config.otpRegex || '',
    reuseSession: Boolean(config.reuseSession),
    runHeadless: Boolean(config.runHeadless),
    timeoutMs: Number(config.timeoutMs || 0),
    screenshotEachStep: Boolean(config.screenshotEachStep),
    htmlAfterProximo: Boolean(config.htmlAfterProximo),
    captureNetworkTrace: Boolean(config.captureNetworkTrace),
    notes: config.notes || '',
    hasSisdevPassword: maskConfiguredSecret(config.sisdevPassword),
    hasGmailClientSecret: maskConfiguredSecret(config.gmailClientSecret),
    hasGmailRefreshToken: maskConfiguredSecret(config.gmailRefreshToken),
    readiness,
  };
}

function buildExecucaoSteps(flow: string) {
  return (FLOW_STEP_TEMPLATES[flow] || FLOW_STEP_TEMPLATES.peca_avulsa_poc).map((item) => ({
    ordem: item.ordem,
    step: item.step,
    status: 'pending',
    data: {
      label: item.label,
      hint: item.hint || '',
    },
  }));
}

async function getConfigRecord() {
  return prisma.detranConfig.upsert({
    where: { slug: DEFAULT_CONFIG_SLUG },
    update: {},
    create: { slug: DEFAULT_CONFIG_SLUG },
  });
}

function mergeSecret(currentValue: string, nextValue: string | undefined) {
  if (nextValue === undefined) return currentValue;
  const normalized = normalizeText(nextValue);
  return normalized || currentValue;
}

function normalizeJsonField(value: unknown) {
  return value === null ? undefined : (value as Record<string, any> | undefined);
}

function normalizeJsonRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function resolveArtifactPath(artifacts: Record<string, any>, kind: string, index?: number) {
  const arrayArtifactKinds = new Set(['screenshots', 'htmlSnapshots']);
  const singleArtifactKinds = new Set([
    'finalHtml',
    'finalShot',
    'beforeNextHtml',
    'beforeNextShot',
    'afterNextHtml',
    'afterNextShot',
    'networkTrace',
    'consoleLog',
    'pageErrors',
    'storageState',
  ]);

  if (arrayArtifactKinds.has(kind)) {
    const files = Array.isArray(artifacts[kind]) ? artifacts[kind] : [];
    if (index === undefined || index < 0 || index >= files.length) return null;
    return typeof files[index] === 'string' ? files[index] : null;
  }

  if (singleArtifactKinds.has(kind)) {
    return typeof artifacts[kind] === 'string' ? artifacts[kind] : null;
  }

  return null;
}

function isPathInsideRunDir(filePath: string, runDir: string) {
  const resolvedFile = path.resolve(filePath);
  const resolvedRunDir = path.resolve(runDir);
  const fileForCompare = process.platform === 'win32' ? resolvedFile.toLowerCase() : resolvedFile;
  const runDirForCompare = process.platform === 'win32' ? resolvedRunDir.toLowerCase() : resolvedRunDir;

  return fileForCompare === runDirForCompare || fileForCompare.startsWith(`${runDirForCompare}${path.sep}`);
}

function artifactContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.json' || ext === '.jsonl') return 'text/plain; charset=utf-8';
  if (ext === '.html' || ext === '.htm') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
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

detranRouter.use((req, res, next) => {
  if (!assertBruno(req, res)) return;
  next();
});

detranRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [config, latestExecucao, groupedStatus, totalExecucoes] = await Promise.all([
      getConfigRecord(),
      prisma.detranExecucao.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          etapas: {
            orderBy: { ordem: 'asc' },
          },
        },
      }),
      prisma.detranExecucao.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.detranExecucao.count(),
    ]);

    const statusCountMap = Object.fromEntries(groupedStatus.map((row) => [row.status, row._count._all]));

    res.json({
      ok: true,
      config: serializeConfig(config),
      totals: {
        execucoes: totalExecucoes,
        pendentes: Number(statusCountMap.pendente || 0),
        executando: Number(statusCountMap.executando || 0),
        sucesso: Number(statusCountMap.sucesso || 0),
        erro: Number(statusCountMap.erro || 0),
        cancelada: Number(statusCountMap.cancelada || 0),
      },
      latestExecucao,
      flows: Object.keys(FLOW_STEP_TEMPLATES),
    });
  } catch (error) {
    next(error);
  }
});

detranRouter.get('/config', async (_req, res, next) => {
  try {
    const config = await getConfigRecord();
    res.json({ ok: true, config: serializeConfig(config) });
  } catch (error) {
    next(error);
  }
});

detranRouter.post('/config', async (req, res, next) => {
  try {
    const payload = detranConfigSchema.parse(req.body || {});
    const current = await getConfigRecord();
    const shouldResetGoogleDriveAccessToken =
      payload.gmailClientId !== undefined
      || Boolean(normalizeText(payload.gmailClientSecret))
      || Boolean(normalizeText(payload.gmailRefreshToken));

    const updated = await prisma.detranConfig.update({
      where: { slug: DEFAULT_CONFIG_SLUG },
      data: {
        enabled: payload.enabled ?? current.enabled,
        sisdevCpf: payload.sisdevCpf !== undefined ? normalizeText(payload.sisdevCpf) : current.sisdevCpf,
        sisdevPassword: mergeSecret(current.sisdevPassword, payload.sisdevPassword),
        empresaCnpj: payload.empresaCnpj !== undefined ? normalizeText(payload.empresaCnpj) : current.empresaCnpj,
        empresaCodigo: payload.empresaCodigo !== undefined ? normalizeText(payload.empresaCodigo) : current.empresaCodigo,
        empresaNome: payload.empresaNome !== undefined ? normalizeText(payload.empresaNome) : current.empresaNome,
        gmailEmail: payload.gmailEmail !== undefined ? normalizeText(payload.gmailEmail) : current.gmailEmail,
        gmailClientId: payload.gmailClientId !== undefined ? normalizeText(payload.gmailClientId) : current.gmailClientId,
        gmailClientSecret: mergeSecret(current.gmailClientSecret, payload.gmailClientSecret),
        gmailRefreshToken: mergeSecret(current.gmailRefreshToken, payload.gmailRefreshToken),
        otpRemetente: payload.otpRemetente !== undefined ? normalizeText(payload.otpRemetente) : current.otpRemetente,
        otpAssunto: payload.otpAssunto !== undefined ? normalizeText(payload.otpAssunto) : current.otpAssunto,
        otpRegex: payload.otpRegex !== undefined ? normalizeText(payload.otpRegex) : current.otpRegex,
        reuseSession: payload.reuseSession ?? current.reuseSession,
        runHeadless: payload.runHeadless ?? current.runHeadless,
        timeoutMs: payload.timeoutMs ?? current.timeoutMs,
        screenshotEachStep: payload.screenshotEachStep ?? current.screenshotEachStep,
        htmlAfterProximo: payload.htmlAfterProximo ?? current.htmlAfterProximo,
        captureNetworkTrace: payload.captureNetworkTrace ?? current.captureNetworkTrace,
        notes: payload.notes !== undefined ? normalizeNullableText(payload.notes) : current.notes,
      },
    });

    if (shouldResetGoogleDriveAccessToken) {
      const googleDriveData: any = {
        googleDriveAccessToken: '',
        googleDriveTokenExpiry: null,
      };
      if (payload.gmailClientId !== undefined) {
        googleDriveData.googleDriveClientId = normalizeText(payload.gmailClientId);
      }
      if (normalizeText(payload.gmailClientSecret)) {
        googleDriveData.googleDriveClientSecret = normalizeText(payload.gmailClientSecret);
      }
      if (normalizeText(payload.gmailRefreshToken)) {
        googleDriveData.googleDriveRefreshToken = normalizeText(payload.gmailRefreshToken);
      }

      await prisma.configuracaoGeral.updateMany({
        data: googleDriveData,
      });
    }

    res.json({ ok: true, config: serializeConfig(updated) });
  } catch (error) {
    next(error);
  }
});

detranRouter.get('/execucoes', async (req, res, next) => {
  try {
    const query = listExecucoesQuerySchema.parse(req.query || {});
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.flow) where.flow = query.flow;
    if (query.search) {
      where.OR = [
        { runId: { contains: query.search, mode: 'insensitive' } },
        { placa: { contains: query.search, mode: 'insensitive' } },
        { renavam: { contains: query.search, mode: 'insensitive' } },
        { chassi: { contains: query.search, mode: 'insensitive' } },
        { tipoPeca: { contains: query.search, mode: 'insensitive' } },
        { notaFiscalEntrada: { contains: query.search, mode: 'insensitive' } },
        { cartelaNumero: { contains: query.search, mode: 'insensitive' } },
        { etiquetaInformada: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const execucoes = await prisma.detranExecucao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        etapas: {
          orderBy: { ordem: 'asc' },
        },
      },
    });

    res.json({ ok: true, execucoes });
  } catch (error) {
    next(error);
  }
});

detranRouter.get('/execucoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Execucao invalida.' });
    }

    const execucao = await prisma.detranExecucao.findUnique({
      where: { id },
      include: {
        etapas: {
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!execucao) {
      return res.status(404).json({ error: 'Execucao nao encontrada.' });
    }

    res.json({ ok: true, execucao });
  } catch (error) {
    next(error);
  }
});

detranRouter.get('/execucoes/:id/artifacts/:kind/:index?', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const index = req.params.index !== undefined ? Number(req.params.index) : undefined;
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Execucao invalida.' });
    }
    if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
      return res.status(400).json({ error: 'Indice de artefato invalido.' });
    }

    const execucao = await prisma.detranExecucao.findUnique({
      where: { id },
      select: { artifacts: true },
    });

    if (!execucao) {
      return res.status(404).json({ error: 'Execucao nao encontrada.' });
    }

    const artifacts = normalizeJsonRecord(execucao.artifacts);
    const runDir = typeof artifacts.runDir === 'string' ? artifacts.runDir : '';
    const artifactPath = resolveArtifactPath(artifacts, normalizeText(req.params.kind), index);

    if (!runDir || !artifactPath || !isPathInsideRunDir(artifactPath, runDir)) {
      return res.status(404).json({ error: 'Artefato nao encontrado para esta execucao.' });
    }

    await fs.access(artifactPath);
    res.setHeader('Content-Type', artifactContentType(artifactPath));
    return res.sendFile(path.resolve(artifactPath));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Arquivo de artefato nao encontrado no servidor.' });
    }
    next(error);
  }
});

detranRouter.post('/execucoes', async (req, res, next) => {
  try {
    const payload = createExecucaoSchema.parse(req.body || {});
    const runId = `sisdev-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const username = normalizeUsername(req);
    const flowSteps = buildExecucaoSteps(payload.flow);

    const execucao = await prisma.$transaction(async (tx) => {
      const created = await tx.detranExecucao.create({
        data: {
          runId,
          flow: payload.flow,
          status: 'pendente',
          createdBy: username,
          placa: normalizeNullableText(payload.placa),
          renavam: normalizeNullableText(payload.renavam),
          chassi: normalizeNullableText(payload.chassi),
          tipoPeca: normalizeNullableText(payload.tipoPeca),
          notaFiscalEntrada: normalizeNullableText(payload.notaFiscalEntrada),
          cartelaNumero: normalizeNullableText(payload.cartelaNumero),
          etiquetaInformada: normalizeNullableText(payload.etiquetaInformada),
          modoEtiqueta: payload.modoEtiqueta,
          observacoes: normalizeNullableText(payload.observacoes),
          payload: {
            flow: payload.flow,
            modoEtiqueta: payload.modoEtiqueta,
            metadata: payload.metadata || {},
            createdFrom: 'anb-detran-ui',
          },
          summary: {
            statusLabel: 'Pendente',
            readyToAutomate: true,
          },
          artifacts: {
            expectedLogs: ['screenshots', 'htmlAfterProximo', 'networkTrace', 'successMessage'],
          },
        },
      });

      await tx.detranExecucaoEtapa.createMany({
        data: flowSteps.map((step) => ({
          execucaoId: created.id,
          ordem: step.ordem,
          step: step.step,
          status: step.status,
          data: step.data,
        })),
      });

      return tx.detranExecucao.findUnique({
        where: { id: created.id },
        include: {
          etapas: {
            orderBy: { ordem: 'asc' },
          },
        },
      });
    });

    res.status(201).json({ ok: true, execucao });
  } catch (error) {
    next(error);
  }
});

detranRouter.post('/execucoes/:id/etapas/:step', async (req, res, next) => {
  try {
    const execucaoId = Number(req.params.id);
    const step = normalizeText(req.params.step);
    if (!Number.isInteger(execucaoId) || execucaoId <= 0 || !step) {
      return res.status(400).json({ error: 'Parametros invalidos para atualizar a etapa.' });
    }

    const payload = updateEtapaSchema.parse(req.body || {});
    const execucao = await prisma.detranExecucao.findUnique({ where: { id: execucaoId } });
    if (!execucao) {
      return res.status(404).json({ error: 'Execucao nao encontrada.' });
    }

    const now = new Date();
    const startedAt = payload.startedAt ? new Date(payload.startedAt) : payload.status === 'running' ? now : undefined;
    const finishedAt = payload.finishedAt ? new Date(payload.finishedAt) : ['success', 'error', 'skipped'].includes(payload.status) ? now : undefined;

    const currentEtapa = await prisma.detranExecucaoEtapa.findUnique({
      where: {
        execucaoId_step: {
          execucaoId,
          step,
        },
      },
    });

    const resolvedStartedAt = startedAt || currentEtapa?.startedAt || null;
    const resolvedFinishedAt = finishedAt || currentEtapa?.finishedAt || null;
    const durationMs = resolvedStartedAt && resolvedFinishedAt
      ? Math.max(0, resolvedFinishedAt.getTime() - resolvedStartedAt.getTime())
      : currentEtapa?.durationMs || null;

    const etapa = await prisma.detranExecucaoEtapa.upsert({
      where: {
        execucaoId_step: {
          execucaoId,
          step,
        },
      },
      create: {
        execucaoId,
        ordem: currentEtapa?.ordem || 999,
        step,
        status: payload.status,
        url: normalizeNullableText(payload.url),
        title: normalizeNullableText(payload.title),
        message: normalizeNullableText(payload.message),
        durationMs: durationMs ?? undefined,
        startedAt: resolvedStartedAt || undefined,
        finishedAt: resolvedFinishedAt || undefined,
        data: payload.data || currentEtapa?.data || {},
      },
      update: {
        status: payload.status,
        url: payload.url !== undefined ? normalizeNullableText(payload.url) : currentEtapa?.url,
        title: payload.title !== undefined ? normalizeNullableText(payload.title) : currentEtapa?.title,
        message: payload.message !== undefined ? normalizeNullableText(payload.message) : currentEtapa?.message,
        durationMs: durationMs ?? currentEtapa?.durationMs ?? undefined,
        startedAt: resolvedStartedAt || undefined,
        finishedAt: resolvedFinishedAt || undefined,
        data: payload.data !== undefined ? payload.data : currentEtapa?.data || {},
      },
    });

    await prisma.detranExecucao.update({
      where: { id: execucaoId },
      data: {
        status: resolveExecucaoStatusFromEtapa(execucao.status, payload.status),
        currentUrl: payload.url !== undefined ? normalizeNullableText(payload.url) : execucao.currentUrl,
        pageTitle: payload.title !== undefined ? normalizeNullableText(payload.title) : execucao.pageTitle,
        updatedAt: new Date(),
      },
    });

    res.json({ ok: true, etapa });
  } catch (error) {
    next(error);
  }
});

detranRouter.post('/execucoes/:id/finalizar', async (req, res, next) => {
  try {
    const execucaoId = Number(req.params.id);
    if (!Number.isInteger(execucaoId) || execucaoId <= 0) {
      return res.status(400).json({ error: 'Execucao invalida.' });
    }

    const payload = finalizarExecucaoSchema.parse(req.body || {});
    const execucao = await prisma.detranExecucao.findUnique({ where: { id: execucaoId } });
    if (!execucao) {
      return res.status(404).json({ error: 'Execucao nao encontrada.' });
    }

    const finishedAt = payload.finishedAt ? new Date(payload.finishedAt) : ['sucesso', 'erro', 'cancelada'].includes(payload.status) ? new Date() : execucao.finishedAt;
    const duracaoMs = payload.duracaoMs !== undefined
      ? payload.duracaoMs
      : finishedAt
      ? Math.max(0, finishedAt.getTime() - new Date(execucao.startedAt).getTime())
      : execucao.duracaoMs;
    const summary = payload.summary !== undefined ? payload.summary : normalizeJsonField(execucao.summary);
    const artifacts = payload.artifacts !== undefined ? payload.artifacts : normalizeJsonField(execucao.artifacts);

    const updated = await prisma.detranExecucao.update({
      where: { id: execucaoId },
      data: {
        status: payload.status,
        resultadoMensagem: payload.resultadoMensagem !== undefined ? normalizeNullableText(payload.resultadoMensagem) : execucao.resultadoMensagem,
        errorMessage: payload.errorMessage !== undefined ? normalizeNullableText(payload.errorMessage) : execucao.errorMessage,
        currentUrl: payload.currentUrl !== undefined ? normalizeNullableText(payload.currentUrl) : execucao.currentUrl,
        pageTitle: payload.pageTitle !== undefined ? normalizeNullableText(payload.pageTitle) : execucao.pageTitle,
        duracaoMs: duracaoMs ?? undefined,
        summary,
        artifacts,
        finishedAt: finishedAt || undefined,
      },
      include: {
        etapas: {
          orderBy: { ordem: 'asc' },
        },
      },
    });

    res.json({ ok: true, execucao: updated });
  } catch (error) {
    next(error);
  }
});

detranRouter.delete('/execucoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Execucao invalida.' });
    }

    await prisma.detranExecucao.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
