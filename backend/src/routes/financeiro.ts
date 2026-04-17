import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getConfiguracaoGeral, saveConfiguracaoGeral } from '../lib/configuracoes-gerais';
import { sendDespesasDoDiaEmailIfNeeded } from '../lib/despesas-alert';
import { z } from 'zod';
import { randomUUID } from 'crypto';

export const financeiroRouter = Router();

const DEFAULT_FRETE_PADRAO = 29.9;
const DEFAULT_TAXA_PADRAO_PCT = 17;
const FINANCEIRO_TIMEZONE = 'America/Sao_Paulo';
const DESPESAS_SCHEDULER_INTERVAL_MS = 60 * 1000;
const INVESTIMENTO_TIPOS = ['Moto', 'Insumos', 'Infra-Estrutura', 'Obra', 'Operacional'] as const;
const DESPESA_STATUS = ['pendente', 'pago'] as const;
const DESPESA_RECORRENCIA = ['nenhuma', 'semanal', 'mensal'] as const;
const PREJUIZO_MOTIVOS = new Set([
  'Extravio no Envio',
  'Defeito',
  'SKU Cancelado',
  'Peca Restrita - Sem Revenda',
  'Peca Restrita - Sem Revenda',
  'Extravio no Estoque',
]);

const despesasSchedulerState = {
  started: false,
  running: false,
};

const prejuizoUpdateSchema = z.object({
  data: z.string().min(1),
  motivo: z.string().min(1),
  valor: z.number().min(0),
  frete: z.number().min(0),
  observacao: z.string().optional().nullable(),
});

const investimentoSchema = z.object({
  data: z.string().min(1),
  socio: z.string().min(1),
  tipo: z.enum(INVESTIMENTO_TIPOS),
  moto: z.string().trim().optional().nullable(),
  valor: z.number().min(0),
});

const attachmentSchema = z.object({
  name: z.string().trim().min(1),
  dataUrl: z.string().trim().min(1),
});

const despesaBaseSchema = z.object({
  data: z.string().min(1),
  detalhes: z.string().trim().min(1),
  categoria: z.string().trim().min(1).default('Outros'),
  valor: z.number().min(0),
  recorrenciaTipo: z.enum(DESPESA_RECORRENCIA).default('nenhuma'),
  recorrenciaAte: z.string().optional().nullable(),
  chavePix: z.string().optional().nullable(),
  codigoBarras: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  anexo: attachmentSchema.optional().nullable(),
  statusPagamento: z.enum(DESPESA_STATUS).default('pendente'),
  dataPagamento: z.string().optional().nullable(),
});

const despesaCreateSchema = despesaBaseSchema;
const despesaUpdateSchema = despesaBaseSchema.partial();

const despesaStatusSchema = z.object({
  statusPagamento: z.enum(DESPESA_STATUS),
  dataPagamento: z.string().optional().nullable(),
  comprovante: attachmentSchema.optional().nullable(),
});

const despesaBulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

function toNumber(value: any) {
  return Number(value) || 0;
}

function normalizeText(value: any) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeInvestimentoTipo(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return 'Operacional';

  const lower = raw.toLowerCase();
  const match = INVESTIMENTO_TIPOS.find((item) => item.toLowerCase() === lower);
  if (match) return match;

  if (/^\d+$/.test(raw) || /^id\s*\d+$/i.test(raw) || /^#\d+$/i.test(raw)) return 'Moto';

  return 'Operacional';
}

function normalizeAttachment(value: any) {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim();
  const dataUrl = String(value.dataUrl || '').trim();
  if (!name || !dataUrl.startsWith('data:')) return null;
  return { name, dataUrl };
}

function parseDateOnlyInput(value: any) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text);
  return new Date(`${text}T00:00:00.000Z`);
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsUtcPreservingDay(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedTargetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedTargetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedTargetMonth, Math.min(day, lastDay), 0, 0, 0, 0));
}

function buildDespesaRecorrenteDatas(
  startDate: Date,
  recorrenciaTipo: 'semanal' | 'mensal' | null,
  recorrenciaAte: Date | null,
) {
  const datas = [new Date(startDate)];
  if (!recorrenciaTipo || !recorrenciaAte || recorrenciaAte.getTime() <= startDate.getTime()) {
    return datas;
  }

  let cursor = new Date(startDate);
  while (true) {
    cursor = recorrenciaTipo === 'semanal'
      ? addDaysUtc(cursor, 7)
      : addMonthsUtcPreservingDay(cursor, 1);

    if (cursor.getTime() > recorrenciaAte.getTime()) break;
    datas.push(new Date(cursor));
  }

  return datas;
}

function mapAttachmentFields(prefix: 'anexo' | 'comprovante', attachment: ReturnType<typeof normalizeAttachment>) {
  return {
    [`${prefix}Nome`]: attachment?.name || null,
    [`${prefix}Arquivo`]: attachment?.dataUrl || null,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildSkuMotoMap(prefixos: any): Record<number, string> {
  const grouped: Record<number, string[]> = {};
  const rows = Array.isArray(prefixos) ? prefixos : [];

  for (const item of rows) {
    const motoId = Number(item?.motoId);
    const prefixo = String(item?.prefixo || '').trim().toUpperCase();
    if (!motoId || !prefixo) continue;
    if (!grouped[motoId]) grouped[motoId] = [];
    if (!grouped[motoId].includes(prefixo)) grouped[motoId].push(prefixo);
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([motoId, skus]) => [Number(motoId), skus.join(' / ')]),
  );
}

function getTimezoneDateParts(date = new Date(), timeZone = FINANCEIRO_TIMEZONE) {
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
    runKey: `${year}-${month}-${day} ${hour}:${minute}`,
  };
}

function currentDateKey(timeZone = FINANCEIRO_TIMEZONE) {
  return getTimezoneDateParts(new Date(), timeZone).dateKey;
}

function toStoredDateKey(date: Date | string | null | undefined) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
}

function extractYear(date: Date | string | null | undefined) {
  const key = toStoredDateKey(date);
  if (!key) return null;
  return Number(key.slice(0, 4));
}

function extractMonth(date: Date | string | null | undefined) {
  const key = toStoredDateKey(date);
  if (!key) return null;
  return Number(key.slice(5, 7));
}

function matchesYearMonth(date: Date | string | null | undefined, year?: number | null, month?: number | null) {
  const valueYear = extractYear(date);
  const valueMonth = extractMonth(date);
  if (!valueYear || !valueMonth) return false;
  if (year && valueYear !== year) return false;
  if (month && valueMonth !== month) return false;
  return true;
}

function isScheduledMinute(currentTime: string, scheduledTime: string) {
  return currentTime === scheduledTime;
}

function isPastOrToday(date: Date, timeZone = FINANCEIRO_TIMEZONE) {
  return toStoredDateKey(date) <= currentDateKey(timeZone);
}

function msUntilNextMinuteTick() {
  const now = new Date();
  return ((60 - now.getSeconds()) * 1000) - now.getMilliseconds() + 250;
}

function mapDespesaRow(row: any) {
  return {
    ...row,
    valor: toNumber(row.valor),
  };
}

async function tickDespesasEmailScheduler() {
  if (despesasSchedulerState.running) return;

  const config = await getConfiguracaoGeral();
  if (!config.despesasEmailAtivo) return;

  const now = getTimezoneDateParts(new Date(), FINANCEIRO_TIMEZONE);
  if (!isScheduledMinute(now.timeKey, config.despesasEmailHorario)) return;
  const executionKey = `${now.dateKey} ${config.despesasEmailHorario}`;
  if (String(config.despesasEmailUltimaExecucaoChave || '') === executionKey) return;

  despesasSchedulerState.running = true;
  try {
    const result = await sendDespesasDoDiaEmailIfNeeded(now.dateKey, FINANCEIRO_TIMEZONE);

    if (result?.sent) {
      console.log(`[despesas-email] enviado com sucesso (${result.total || 0} despesa(s)) em ${executionKey}`);
      await saveConfiguracaoGeral({
        despesasEmailUltimaExecucaoChave: executionKey,
        despesasEmailUltimaExecucaoEm: new Date(),
      });
      return;
    }

    if (result?.reason === 'sem_despesas_do_dia') {
      console.log(`[despesas-email] sem despesas do dia em ${executionKey}`);
      await saveConfiguracaoGeral({
        despesasEmailUltimaExecucaoChave: executionKey,
        despesasEmailUltimaExecucaoEm: new Date(),
      });
      return;
    }

    if (result?.reason === 'configuracao_incompleta') {
      console.log('[despesas-email] configuracao incompleta; rotina nao executada');
      return;
    }

    console.log('[despesas-email] rotina concluida sem envio', result);
  } finally {
    despesasSchedulerState.running = false;
  }
}

export function startFinanceiroSchedulers() {
  if (despesasSchedulerState.started) return;
  despesasSchedulerState.started = true;

  const runTick = () => {
    tickDespesasEmailScheduler().catch((error) => {
      console.error('Falha na rotina automatica de despesas:', error);
      despesasSchedulerState.running = false;
    });
  };

  setTimeout(runTick, msUntilNextMinuteTick());
  setInterval(runTick, DESPESAS_SCHEDULER_INTERVAL_MS);
}

// DESPESAS
financeiroRouter.get('/despesas', async (_req, res, next) => {
  try {
    const rows = await prisma.despesa.findMany({
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });
    res.json(rows.map(mapDespesaRow));
  } catch (e) {
    next(e);
  }
});

financeiroRouter.post('/despesas', async (req, res, next) => {
  try {
    const payload = despesaCreateSchema.parse(req.body || {});
    const anexo = normalizeAttachment(payload.anexo);
    const statusPagamento = payload.statusPagamento || 'pendente';
    const recorrenciaTipo = payload.recorrenciaTipo === 'nenhuma' ? null : payload.recorrenciaTipo;
    const recorrenciaAte = recorrenciaTipo && payload.recorrenciaAte ? parseDateOnlyInput(payload.recorrenciaAte) : null;
    const dataBase = parseDateOnlyInput(payload.data);
    const datasSerie = buildDespesaRecorrenteDatas(dataBase, recorrenciaTipo, recorrenciaAte);
    const recorrenciaSerieId = recorrenciaTipo && datasSerie.length > 1 ? randomUUID() : null;
    const dataPagamento = statusPagamento === 'pago'
      ? (payload.dataPagamento ? parseDateOnlyInput(payload.dataPagamento) : dataBase)
      : null;

    const rows = await prisma.$transaction(
      datasSerie.map((dataOcorrencia, index) => prisma.despesa.create({
        data: {
          data: dataOcorrencia,
          detalhes: payload.detalhes,
          categoria: payload.categoria || 'Outros',
          valor: payload.valor,
          recorrenciaSerieId,
          recorrenciaTipo,
          recorrenciaFim: recorrenciaSerieId ? recorrenciaAte : null,
          recorrenciaGerada: recorrenciaSerieId ? index > 0 : false,
          statusPagamento,
          dataPagamento: statusPagamento === 'pago' ? dataPagamento : null,
          chavePix: normalizeText(payload.chavePix),
          codigoBarras: normalizeText(payload.codigoBarras),
          observacao: normalizeText(payload.observacao),
          ...mapAttachmentFields('anexo', anexo),
        },
      })),
    );

    res.json({
      ok: true,
      totalCriadas: rows.length,
      data: rows.map(mapDespesaRow),
    });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.put('/despesas/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = despesaUpdateSchema.parse(req.body || {});
    const current = await prisma.despesa.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Despesa nao encontrada' });

    const anexo = payload.anexo !== undefined ? normalizeAttachment(payload.anexo) : undefined;
    const statusPagamento = payload.statusPagamento ?? current.statusPagamento;
    const dataPagamento = statusPagamento === 'pago'
      ? (
          payload.dataPagamento
            ? parseDateOnlyInput(payload.dataPagamento)
            : current.dataPagamento || parseDateOnlyInput(payload.data || toStoredDateKey(current.data))
        )
      : null;

    const row = await prisma.despesa.update({
      where: { id },
      data: {
        data: payload.data ? parseDateOnlyInput(payload.data) : undefined,
        detalhes: payload.detalhes ?? undefined,
        categoria: payload.categoria ?? undefined,
        valor: payload.valor ?? undefined,
        statusPagamento,
        dataPagamento,
        chavePix: payload.chavePix !== undefined ? normalizeText(payload.chavePix) : undefined,
        codigoBarras: payload.codigoBarras !== undefined ? normalizeText(payload.codigoBarras) : undefined,
        observacao: payload.observacao !== undefined ? normalizeText(payload.observacao) : undefined,
        ...(anexo !== undefined ? mapAttachmentFields('anexo', anexo) : {}),
      },
    });

    res.json(mapDespesaRow(row));
  } catch (e) {
    next(e);
  }
});

financeiroRouter.patch('/despesas/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = despesaStatusSchema.parse(req.body || {});
    const current = await prisma.despesa.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Despesa nao encontrada' });

    const comprovante = normalizeAttachment(payload.comprovante);
    const row = await prisma.despesa.update({
      where: { id },
      data: payload.statusPagamento === 'pago'
        ? {
            statusPagamento: 'pago',
            dataPagamento: payload.dataPagamento ? parseDateOnlyInput(payload.dataPagamento) : parseDateOnlyInput(currentDateKey()),
            ...mapAttachmentFields('comprovante', comprovante),
          }
        : {
            statusPagamento: 'pendente',
            dataPagamento: null,
            comprovanteNome: null,
            comprovanteArquivo: null,
          },
    });

    res.json(mapDespesaRow(row));
  } catch (e) {
    next(e);
  }
});

financeiroRouter.post('/despesas/bulk-delete', async (req, res, next) => {
  try {
    const payload = despesaBulkDeleteSchema.parse(req.body || {});
    const uniqueIds = Array.from(new Set(payload.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!uniqueIds.length) {
      return res.status(400).json({ error: 'Nenhuma despesa valida foi informada para exclusao.' });
    }

    const deleted = await prisma.despesa.deleteMany({
      where: {
        id: { in: uniqueIds },
      },
    });

    res.json({ ok: true, deleted: deleted.count, ids: uniqueIds });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.delete('/despesas/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const scope = String(req.query.scope || 'single').trim().toLowerCase();
    const current = await prisma.despesa.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Despesa nao encontrada' });

    if (scope === 'future_series' && current.recorrenciaSerieId) {
      const deleted = await prisma.despesa.deleteMany({
        where: {
          recorrenciaSerieId: current.recorrenciaSerieId,
          data: { gte: current.data },
        },
      });
      return res.json({ ok: true, deleted: deleted.count, scope: 'future_series' });
    }

    await prisma.despesa.delete({ where: { id } });
    res.json({ ok: true, deleted: 1, scope: 'single' });
  } catch (e) {
    next(e);
  }
});

// PREJUIZOS
financeiroRouter.get('/prejuizos', async (_req, res, next) => {
  try {
    const [rows, cfg] = await Promise.all([
      prisma.prejuizo.findMany({
        include: {
          peca: {
            select: {
              id: true,
              idPeca: true,
              motoId: true,
              descricao: true,
              moto: { select: { marca: true, modelo: true } },
            },
          },
        },
        orderBy: [{ data: 'desc' }, { id: 'desc' }],
      }),
      prisma.blingConfig.findFirst({ select: { prefixos: true } }),
    ]);

    const skuMotoMap = buildSkuMotoMap(cfg?.prefixos);
    res.json(rows.map((row) => ({
      ...row,
      valor: toNumber(row.valor),
      frete: toNumber(row.frete),
      total: toNumber(row.valor) + toNumber(row.frete),
      idMoto: row.peca?.motoId || null,
      skuMoto: row.peca?.motoId ? (skuMotoMap[row.peca.motoId] || null) : null,
      idPeca: row.peca?.idPeca || null,
      descricaoPeca: row.peca?.descricao || row.detalhe,
      moto: row.peca?.moto ? `${row.peca.moto.marca} ${row.peca.moto.modelo}` : null,
    })));
  } catch (e) {
    next(e);
  }
});

financeiroRouter.delete('/prejuizos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.prejuizo.findUnique({
      where: { id },
      select: { id: true, pecaId: true },
    });
    if (!row) return res.status(404).json({ error: 'Prejuizo nao encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.prejuizo.delete({ where: { id } });
      if (row.pecaId) {
        const [peca, cfg] = await Promise.all([
          tx.peca.findUnique({
            where: { id: row.pecaId },
            select: { id: true, precoML: true },
          }),
          tx.blingConfig.findFirst({
            select: { fretePadrao: true, taxaPadraoPct: true },
          }),
        ]);

        const precoML = toNumber(peca?.precoML);
        const valorFrete = roundMoney(toNumber(cfg?.fretePadrao) || DEFAULT_FRETE_PADRAO);
        const taxaPct = toNumber(cfg?.taxaPadraoPct) || DEFAULT_TAXA_PADRAO_PCT;
        const valorTaxas = roundMoney(precoML * (taxaPct / 100));
        const valorLiq = roundMoney(precoML - valorFrete - valorTaxas);

        await tx.peca.update({
          where: { id: row.pecaId },
          data: {
            emPrejuizo: false,
            disponivel: true,
            dataVenda: null,
            blingPedidoId: null,
            blingPedidoNum: null,
            valorFrete,
            valorTaxas,
            valorLiq,
          },
        });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.patch('/prejuizos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = prejuizoUpdateSchema.parse(req.body || {});
    const motivo = String(payload.motivo || '').trim();
    if (!PREJUIZO_MOTIVOS.has(motivo)) {
      return res.status(400).json({ error: 'Motivo do prejuizo invalido' });
    }

    const row = await prisma.prejuizo.findUnique({
      where: { id },
      select: { id: true, pecaId: true },
    });
    if (!row) return res.status(404).json({ error: 'Prejuizo nao encontrado' });

    const updated = await prisma.$transaction(async (tx) => {
      const prejuizo = await tx.prejuizo.update({
        where: { id },
        data: {
          data: new Date(payload.data),
          motivo,
          valor: payload.valor,
          frete: payload.frete,
          observacao: payload.observacao ? String(payload.observacao).trim() : null,
        },
      });

      if (row.pecaId) {
        const peca = await tx.peca.findUnique({
          where: { id: row.pecaId },
          select: { valorTaxas: true },
        });
        const valorTaxas = toNumber(peca?.valorTaxas);
        await tx.peca.update({
          where: { id: row.pecaId },
          data: {
            precoML: payload.valor,
            valorFrete: payload.frete,
            valorLiq: roundMoney(payload.valor - payload.frete - valorTaxas),
          },
        });
      }

      return prejuizo;
    });

    res.json({ ...updated, valor: toNumber(updated.valor), frete: toNumber(updated.frete) });
  } catch (e) {
    next(e);
  }
});

// INVESTIMENTOS
financeiroRouter.get('/investimentos', async (_req, res, next) => {
  try {
    const rows = await prisma.investimento.findMany({ orderBy: [{ data: 'desc' }, { id: 'desc' }] });
    res.json(rows.map((row) => ({ ...row, tipo: normalizeInvestimentoTipo(row.tipo), valor: toNumber(row.valor) })));
  } catch (e) {
    next(e);
  }
});

financeiroRouter.post('/investimentos', async (req, res, next) => {
  try {
    const parsed = investimentoSchema.parse({
      ...req.body,
      tipo: normalizeInvestimentoTipo(req.body?.tipo),
    });

    const row = await prisma.investimento.create({
      data: {
        data: new Date(parsed.data),
        socio: parsed.socio,
        tipo: parsed.tipo,
        moto: normalizeText(parsed.moto),
        valor: parsed.valor,
      },
    });
    res.json({ ...row, valor: toNumber(row.valor) });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.put('/investimentos/:id', async (req, res, next) => {
  try {
    const parsed = investimentoSchema.parse({
      ...req.body,
      tipo: normalizeInvestimentoTipo(req.body?.tipo),
    });

    const row = await prisma.investimento.update({
      where: { id: Number(req.params.id) },
      data: {
        data: new Date(parsed.data),
        socio: parsed.socio,
        tipo: parsed.tipo,
        moto: normalizeText(parsed.moto),
        valor: parsed.valor,
      },
    });
    res.json({ ...row, tipo: normalizeInvestimentoTipo(row.tipo), valor: toNumber(row.valor) });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.delete('/investimentos', async (_req, res, next) => {
  try {
    const deleted = await prisma.investimento.deleteMany({});
    res.json({ ok: true, deleted: deleted.count });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.delete('/investimentos/:id', async (req, res, next) => {
  try {
    await prisma.investimento.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

financeiroRouter.get('/despesas-receita', async (req, res, next) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const mes = Number(req.query.mes) || 0;

    const [pecasVendidas, despesas] = await Promise.all([
      prisma.peca.findMany({
        where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } },
        select: { precoML: true, valorTaxas: true, valorFrete: true, dataVenda: true },
      }),
      prisma.despesa.findMany({
        select: { data: true, detalhes: true, categoria: true, valor: true, statusPagamento: true },
      }),
    ]);

    const monthIndexes = mes ? [mes] : Array.from({ length: 12 }, (_, index) => index + 1);

    // Coleta todas as categorias únicas — exclui "Contador" e categorias sem valor no período
    const CATEGORIAS_EXCLUIDAS = ['contador'];
    const todasCategorias = Array.from(new Set(despesas.map((d) => String(d.categoria || 'Outros').trim())))
      .filter((cat) => !CATEGORIAS_EXCLUIDAS.includes(cat.toLowerCase()))
      .sort();

    const months = monthIndexes.map((monthIndex) => {
      const receitaBruta = pecasVendidas
        .filter((item) => matchesYearMonth(item.dataVenda, ano, monthIndex))
        .reduce((sum, item) => sum + toNumber(item.precoML), 0);

      const taxasMl = pecasVendidas
        .filter((item) => matchesYearMonth(item.dataVenda, ano, monthIndex))
        .reduce((sum, item) => sum + toNumber(item.valorTaxas), 0);

      const fretePago = pecasVendidas
        .filter((item) => matchesYearMonth(item.dataVenda, ano, monthIndex))
        .reduce((sum, item) => sum + toNumber(item.valorFrete), 0);

      const despesasMes = despesas
        .filter((item) => matchesYearMonth(item.data, ano, monthIndex))
        .reduce((sum, item) => sum + toNumber(item.valor), 0);

      const despesasPendentes = despesas
        .filter((item) => item.statusPagamento === 'pendente' && matchesYearMonth(item.data, ano, monthIndex))
        .reduce((sum, item) => sum + toNumber(item.valor), 0);

      // Breakdown por categoria
      const despesasPorCategoria: Record<string, number> = {};
      todasCategorias.forEach((cat) => {
        despesasPorCategoria[cat] = despesas
          .filter((item) => matchesYearMonth(item.data, ano, monthIndex) && String(item.categoria || 'Outros').trim() === cat)
          .reduce((sum, item) => sum + toNumber(item.valor), 0);
      });

      const totalSaidas = taxasMl + fretePago + despesasMes;
      const resultadoBruto = receitaBruta - totalSaidas;

      return {
        ano,
        mes: monthIndex,
        label: `${String(monthIndex).padStart(2, '0')}/${ano}`,
        receitaBruta,
        taxasMl,
        fretePago,
        despesasGerais: despesasMes,
        despesasPendentes,
        despesasPorCategoria,
        totalSaidas,
        resultadoBruto,
      };
    });

    const totalReceitaBruta = months.reduce((sum, item) => sum + item.receitaBruta, 0);
    const totalTaxasMl = months.reduce((sum, item) => sum + item.taxasMl, 0);
    const totalFretePago = months.reduce((sum, item) => sum + item.fretePago, 0);
    const totalDespesasGerais = months.reduce((sum, item) => sum + item.despesasGerais, 0);
    const totalSaidas = months.reduce((sum, item) => sum + item.totalSaidas, 0);
    const totalResultadoBruto = months.reduce((sum, item) => sum + item.resultadoBruto, 0);

    // Totais por categoria — só retorna categorias com valor > 0 no período
    const totalPorCategoria: Record<string, number> = {};
    todasCategorias.forEach((cat) => {
      totalPorCategoria[cat] = months.reduce((sum, item) => sum + (item.despesasPorCategoria[cat] || 0), 0);
    });

    const categoriasComValor = todasCategorias.filter((cat) => (totalPorCategoria[cat] || 0) > 0);

    res.json({
      ano,
      mes: mes || null,
      categorias: categoriasComValor,
      months,
      totals: {
        receitaBruta: totalReceitaBruta,
        taxasMl: totalTaxasMl,
        fretePago: totalFretePago,
        despesasGerais: totalDespesasGerais,
        totalSaidas,
        resultadoBruto: totalResultadoBruto,
        porCategoria: totalPorCategoria,
      },
    });
  } catch (e) {
    next(e);
  }
});

// DRE
financeiroRouter.get('/dre', async (req, res, next) => {
  try {
    const ano = Number(req.query.ano) || null;
    const [pecasVendidas, despesas, prejuizos, motos] = await Promise.all([
      prisma.peca.findMany({
        where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } },
        select: { precoML: true, valorLiq: true, valorFrete: true, valorTaxas: true, dataVenda: true },
      }),
      prisma.despesa.findMany({
        select: { valor: true, categoria: true, statusPagamento: true, data: true },
      }),
      prisma.prejuizo.findMany({ select: { valor: true, frete: true, data: true } }),
      prisma.moto.findMany({ select: { precoCompra: true, dataCompra: true } }),
    ]);

    const pecasVendidasFiltradas = pecasVendidas.filter((item) => matchesYearMonth(item.dataVenda, ano));
    const despesasElegiveis = despesas.filter((item) => (
      item.statusPagamento === 'pago' &&
      isPastOrToday(item.data) &&
      matchesYearMonth(item.data, ano)
    ));
    const prejuizosFiltrados = prejuizos.filter((item) => matchesYearMonth(item.data, ano));
    const motosFiltradas = ano
      ? motos.filter((item) => matchesYearMonth(item.dataCompra, ano))
      : motos;

    const receitaBruta = pecasVendidasFiltradas.reduce((sum, item) => sum + toNumber(item.precoML), 0);
    const comissaoML = pecasVendidasFiltradas.reduce((sum, item) => sum + toNumber(item.valorTaxas), 0);
    const frete = pecasVendidasFiltradas.reduce((sum, item) => sum + toNumber(item.valorFrete), 0);
    const receitaLiq = pecasVendidasFiltradas.reduce((sum, item) => sum + toNumber(item.valorLiq), 0);

    const investido = motosFiltradas.reduce((sum, item) => sum + toNumber(item.precoCompra), 0);
    const comprasMoto = despesasElegiveis
      .filter((item) => String(item.categoria || '').trim() === 'Moto')
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
    const cmv = investido + comprasMoto;
    const lucroBruto = receitaLiq - cmv;

    const despOp = despesasElegiveis.filter((item) => String(item.categoria || '').trim() !== 'Moto');
    const totalDesp = despOp.reduce((sum, item) => sum + toNumber(item.valor), 0);
    const totalPrej = prejuizosFiltrados.reduce((sum, item) => sum + toNumber(item.valor) + toNumber(item.frete), 0);
    const lucroOp = lucroBruto - totalDesp - totalPrej;

    const despPorCateg: Record<string, number> = {};
    despOp.forEach((item) => {
      despPorCateg[item.categoria] = (despPorCateg[item.categoria] || 0) + toNumber(item.valor);
    });

    const anosDisponiveis = Array.from(new Set([
      ...pecasVendidas.map((item) => extractYear(item.dataVenda)),
      ...despesas.map((item) => extractYear(item.data)),
      ...prejuizos.map((item) => extractYear(item.data)),
      ...motos.map((item) => extractYear(item.dataCompra)),
    ].filter(Boolean) as number[])).sort((a, b) => b - a);

    res.json({
      ano,
      anosDisponiveis,
      receitaBruta,
      comissaoML,
      frete,
      receitaLiq,
      investido,
      comprasMoto,
      cmv,
      lucroBruto,
      totalDesp,
      totalPrej,
      lucroOp,
      despPorCateg,
      qtdVendidas: pecasVendidasFiltradas.length,
    });
  } catch (e) {
    next(e);
  }
});
