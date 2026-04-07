import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getConfiguracaoGeral, saveConfiguracaoGeral } from '../lib/configuracoes-gerais';
import { sendDespesasDoDiaEmailIfNeeded } from '../lib/despesas-alert';
import { z } from 'zod';

export const financeiroRouter = Router();

const DEFAULT_FRETE_PADRAO = 29.9;
const DEFAULT_TAXA_PADRAO_PCT = 17;
const FINANCEIRO_TIMEZONE = 'America/Sao_Paulo';
const DESPESAS_SCHEDULER_INTERVAL_MS = 60 * 1000;
const INVESTIMENTO_TIPOS = ['Moto', 'Insumos', 'Infra-Estrutura', 'Obra', 'Operacional'] as const;
const DESPESA_STATUS = ['pendente', 'pago'] as const;
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

function hasReachedScheduleTime(currentTime: string, scheduledTime: string) {
  return currentTime >= scheduledTime;
}

function isPastOrToday(date: Date, timeZone = FINANCEIRO_TIMEZONE) {
  return toStoredDateKey(date) <= currentDateKey(timeZone);
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
  if (!hasReachedScheduleTime(now.timeKey, config.despesasEmailHorario)) return;
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

  setTimeout(runTick, 15000);
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
    const dataPagamento = statusPagamento === 'pago'
      ? (payload.dataPagamento ? parseDateOnlyInput(payload.dataPagamento) : parseDateOnlyInput(payload.data))
      : null;

    const row = await prisma.despesa.create({
      data: {
        data: parseDateOnlyInput(payload.data),
        detalhes: payload.detalhes,
        categoria: payload.categoria || 'Outros',
        valor: payload.valor,
        statusPagamento,
        dataPagamento,
        chavePix: normalizeText(payload.chavePix),
        codigoBarras: normalizeText(payload.codigoBarras),
        observacao: normalizeText(payload.observacao),
        ...mapAttachmentFields('anexo', anexo),
      },
    });

    res.json(mapDespesaRow(row));
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

financeiroRouter.delete('/despesas/:id', async (req, res, next) => {
  try {
    await prisma.despesa.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
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

// DRE
financeiroRouter.get('/dre', async (_req, res, next) => {
  try {
    const [pecasVendidas, despesas, prejuizos, motos] = await Promise.all([
      prisma.peca.findMany({
        where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } },
        select: { precoML: true, valorLiq: true, valorFrete: true, valorTaxas: true },
      }),
      prisma.despesa.findMany({
        select: { valor: true, categoria: true, statusPagamento: true, data: true },
      }),
      prisma.prejuizo.findMany({ select: { valor: true, frete: true } }),
      prisma.moto.findMany({ select: { precoCompra: true } }),
    ]);

    const despesasElegiveis = despesas.filter((item) => item.statusPagamento === 'pago' && isPastOrToday(item.data));

    const receitaBruta = pecasVendidas.reduce((sum, item) => sum + toNumber(item.precoML), 0);
    const comissaoML = pecasVendidas.reduce((sum, item) => sum + toNumber(item.valorTaxas), 0);
    const frete = pecasVendidas.reduce((sum, item) => sum + toNumber(item.valorFrete), 0);
    const receitaLiq = pecasVendidas.reduce((sum, item) => sum + toNumber(item.valorLiq), 0);

    const investido = motos.reduce((sum, item) => sum + toNumber(item.precoCompra), 0);
    const comprasMoto = despesasElegiveis
      .filter((item) => String(item.categoria || '').trim() === 'Moto')
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
    const cmv = investido + comprasMoto;
    const lucroBruto = receitaLiq - cmv;

    const despOp = despesasElegiveis.filter((item) => String(item.categoria || '').trim() !== 'Moto');
    const totalDesp = despOp.reduce((sum, item) => sum + toNumber(item.valor), 0);
    const totalPrej = prejuizos.reduce((sum, item) => sum + toNumber(item.valor) + toNumber(item.frete), 0);
    const lucroOp = lucroBruto - totalDesp - totalPrej;

    const despPorCateg: Record<string, number> = {};
    despOp.forEach((item) => {
      despPorCateg[item.categoria] = (despPorCateg[item.categoria] || 0) + toNumber(item.valor);
    });

    res.json({
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
      qtdVendidas: pecasVendidas.length,
    });
  } catch (e) {
    next(e);
  }
});
