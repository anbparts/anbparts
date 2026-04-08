import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { sendDetranBaixaEmailIfNeeded } from '../lib/detran-alert';
import { z } from 'zod';

export const pecasRouter = Router();

const DEFAULT_SELL_FRETE = 29.9;
const DEFAULT_TAXA_PCT = 17;
const PREJUIZO_MOTIVOS = new Set([
  'Extravio no Envio',
  'Defeito',
  'SKU Cancelado',
  'Peça Restrita - Sem Revenda',
  'Extravio no Estoque',
]);

const pecaBaseSchema = z.object({
  motoId:      z.number().int(),
  descricao:   z.string().min(1),
  localizacao: z.string().optional().nullable(),
  precoML:     z.number().default(0),
  valorLiq:    z.number().default(0),
  valorFrete:  z.number().default(0),
  valorTaxas:  z.number().default(0),
  disponivel:  z.boolean().default(true),
  blingPedidoNum: z.string().optional().nullable(),
  dataVenda:   z.string().optional().nullable(),
  cadastro:    z.string().optional().nullable(),
});

const createPecaSchema = pecaBaseSchema.extend({
  idPeca: z.string().trim().min(1).optional().nullable(),
});

const updatePecaSchema = pecaBaseSchema.partial();

const prejuizoPayloadSchema = z.object({
  motivo: z.string().min(1),
  motoId: z.number().int().optional(),
  descricao: z.string().min(1).optional(),
  cadastro: z.string().optional().nullable(),
  precoML: z.number().optional(),
  valorFrete: z.number().optional(),
  valorTaxas: z.number().optional(),
  observacao: z.string().optional().nullable(),
});

async function gerarIdPeca(): Promise<string> {
  const last = await prisma.peca.findFirst({ orderBy: { idPeca: 'desc' } });
  if (!last) return 'PN0001';
  const num = parseInt(last.idPeca.replace('PN', '')) + 1;
  return 'PN' + String(num).padStart(4, '0');
}

function inferDefaultIdFormat(prefixo: string) {
  return prefixo.toUpperCase() === 'PN' ? 'plain' : 'underscore';
}

function normalizeIdPeca(value: string) {
  return String(value || '').trim().toUpperCase();
}

function extractSequenceForPrefix(idPeca: string, prefixo: string) {
  const normalizedId = normalizeIdPeca(idPeca);
  const normalizedPrefix = normalizeIdPeca(prefixo);
  const withoutSuffix = normalizedId.replace(/-\d+$/, '');

  if (withoutSuffix.startsWith(`${normalizedPrefix}_`)) {
    const numericPart = withoutSuffix.slice(normalizedPrefix.length + 1);
    if (/^\d+$/.test(numericPart)) {
      return {
        number: Number(numericPart),
        width: numericPart.length,
        format: 'underscore' as const,
      };
    }
  }

  if (withoutSuffix.startsWith(normalizedPrefix)) {
    const numericPart = withoutSuffix.slice(normalizedPrefix.length);
    if (/^\d+$/.test(numericPart)) {
      return {
        number: Number(numericPart),
        width: numericPart.length,
        format: 'plain' as const,
      };
    }
  }

  return null;
}

function buildSuggestedId(prefixo: string, nextNumber: number, width: number, format: 'plain' | 'underscore') {
  const padded = String(nextNumber).padStart(width, '0');
  return format === 'underscore' ? `${prefixo}_${padded}` : `${prefixo}${padded}`;
}

async function getProdutoConfig() {
  const cfg = await prisma.blingConfig.findFirst();
  const prefixos = cfg && Array.isArray(cfg.prefixos) ? (cfg.prefixos as any[]) : [];

  return {
    prefixos,
    fretePadrao: roundMoney(Math.max(0, Number(cfg?.fretePadrao) || DEFAULT_SELL_FRETE)),
    taxaPadraoPct: roundMoney(Math.max(0, Number(cfg?.taxaPadraoPct) || DEFAULT_TAXA_PCT)),
  };
}

async function suggestIdPecaForMoto(motoId: number) {
  const cfg = await getProdutoConfig();
  const prefixoConfig = cfg.prefixos.find((item) => Number(item?.motoId) === Number(motoId));
  const prefixo = prefixoConfig?.prefixo ? normalizeIdPeca(prefixoConfig.prefixo) : '';

  if (!prefixo) {
    return {
      prefixo: null,
      sugestao: await gerarIdPeca(),
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    };
  }

  const candidates = await prisma.peca.findMany({
    where: {
      OR: [
        { motoId: Number(motoId) },
        { idPeca: { startsWith: prefixo } },
      ],
    },
    select: { idPeca: true, motoId: true },
  });

  const motoMatches = candidates
    .filter((item) => item.motoId === Number(motoId))
    .map((item) => extractSequenceForPrefix(item.idPeca, prefixo))
    .filter(Boolean) as Array<{ number: number; width: number; format: 'plain' | 'underscore' }>;

  const prefixMatches = candidates
    .map((item) => extractSequenceForPrefix(item.idPeca, prefixo))
    .filter(Boolean) as Array<{ number: number; width: number; format: 'plain' | 'underscore' }>;

  const referenceMatches = motoMatches.length ? motoMatches : prefixMatches;
  const highest = [...referenceMatches].sort((a, b) => b.number - a.number)[0];
  const nextNumber = (highest?.number || 0) + 1;
  const width = highest?.width || 4;
  const format = highest?.format || inferDefaultIdFormat(prefixo);

  return {
    prefixo,
    sugestao: buildSuggestedId(prefixo, nextNumber, width, format),
    fretePadrao: cfg.fretePadrao,
    taxaPadraoPct: cfg.taxaPadraoPct,
  };
}

function parseDateStart(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function parseDateEnd(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2));
}

function normalizePecaLocalizacao(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function calculatePecaFinancialValues(
  current: { precoML: any; valorFrete: any; valorTaxas: any },
  nextPrecoML?: number,
  nextFrete?: number,
  nextTaxaValor?: number,
) {
  const precoML = roundMoney(Math.max(0, nextPrecoML !== undefined ? Number(nextPrecoML) || 0 : Number(current.precoML) || 0));
  const valorFrete = roundMoney(Math.max(0, nextFrete !== undefined ? Number(nextFrete) || 0 : Number(current.valorFrete) || 0));
  const valorTaxas = roundMoney(Math.max(0, nextTaxaValor !== undefined ? Number(nextTaxaValor) || 0 : Number(current.valorTaxas) || 0));
  const valorLiq = roundMoney(precoML - valorFrete - valorTaxas);

  return { precoML, valorFrete, valorTaxas, valorLiq };
}

function calculateManualSaleValues(
  peca: { precoML: any; valorFrete: any; valorTaxas: any },
  nextPrecoML?: number,
  nextFrete?: number,
  nextTaxaValor?: number,
) {
  const precoAtual = Number(peca.precoML) || 0;
  const precoVenda = nextPrecoML !== undefined ? Number(nextPrecoML) || 0 : precoAtual;
  const freteAtual = Number(peca.valorFrete) || 0;
  const taxasAtuais = Number(peca.valorTaxas) || 0;

  const valorFrete = nextFrete !== undefined
    ? roundMoney(Math.max(0, Number(nextFrete) || 0))
    : (freteAtual > 0 ? roundMoney(freteAtual) : DEFAULT_SELL_FRETE);
  const valorTaxas = nextTaxaValor !== undefined
    ? roundMoney(Math.max(0, Number(nextTaxaValor) || 0))
    : roundMoney(precoVenda * (
      precoAtual > 0 && taxasAtuais > 0
        ? (taxasAtuais / precoAtual)
        : (DEFAULT_TAXA_PCT / 100)
    ));
  const valorLiq = roundMoney(precoVenda - valorFrete - valorTaxas);

  return {
    precoML: precoVenda,
    valorFrete,
    valorTaxas,
    valorLiq,
  };
}

// GET /pecas
pecasRouter.get('/', async (req, res, next) => {
  try {
    const {
      motoId,
      disponivel,
      search,
      dataVendaFrom,
      dataVendaTo,
      precoMlZero,
      page = '1',
      per = '20',
      orderBy = 'cadastro',
      orderDir = 'desc',
    } = req.query as any;
    const where: any = { emPrejuizo: false };
    if (motoId) where.motoId = Number(motoId);
    if (disponivel !== undefined) where.disponivel = disponivel === 'true';
    if (precoMlZero === 'true') where.precoML = 0;
    if (search) where.OR = [
      { idPeca: { contains: search, mode: 'insensitive' } },
      { descricao: { contains: search, mode: 'insensitive' } },
      { blingPedidoNum: { contains: search, mode: 'insensitive' } },
    ];
    if (dataVendaFrom || dataVendaTo) {
      where.dataVenda = {};
      if (dataVendaFrom) where.dataVenda.gte = parseDateStart(dataVendaFrom);
      if (dataVendaTo) where.dataVenda.lte = parseDateEnd(dataVendaTo);
    }

    const normalizedOrderDir = String(orderDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderByMap: Record<string, any> = {
      motoId: { motoId: normalizedOrderDir },
      idPeca: { idPeca: normalizedOrderDir },
      descricao: { descricao: normalizedOrderDir },
      cadastro: { cadastro: normalizedOrderDir },
      precoML: { precoML: normalizedOrderDir },
      valorLiq: { valorLiq: normalizedOrderDir },
      valorFrete: { valorFrete: normalizedOrderDir },
      valorTaxas: { valorTaxas: normalizedOrderDir },
      dataVenda: { dataVenda: normalizedOrderDir },
      blingPedidoNum: { blingPedidoNum: normalizedOrderDir },
      disponivel: { disponivel: normalizedOrderDir },
      moto: [
        { moto: { marca: normalizedOrderDir } },
        { moto: { modelo: normalizedOrderDir } },
      ],
    };
    const normalizedOrderBy = String(orderBy || 'cadastro');
    const prismaOrderBy = orderByMap[normalizedOrderBy] || orderByMap.cadastro;

    const [total, pecas, totalDisp, totalVend] = await Promise.all([
      prisma.peca.count({ where }),
      prisma.peca.findMany({
        where,
        include: { moto: { select: { marca: true, modelo: true } } },
        orderBy: prismaOrderBy,
        skip: (Number(page) - 1) * Number(per),
        take: Number(per),
      }),
      prisma.peca.count({ where: { ...where, disponivel: true } }),
      prisma.peca.count({ where: { ...where, disponivel: false, dataVenda: { not: null } } }),
    ]);

    res.json({ total, totalDisp, totalVend, page: Number(page), per: Number(per), data: pecas });
  } catch (e) { next(e); }
});

// GET /pecas/sugestao-id
pecasRouter.get('/sugestao-id', async (req, res, next) => {
  try {
    const motoId = Number(req.query.motoId);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return res.status(400).json({ error: 'Moto invalida para gerar sugestao' });
    }

    const sugestao = await suggestIdPecaForMoto(motoId);
    res.json(sugestao);
  } catch (e) { next(e); }
});

// POST /pecas
pecasRouter.post('/', async (req, res, next) => {
  try {
    const data = createPecaSchema.parse(req.body);
    const suggested = await suggestIdPecaForMoto(Number(data.motoId));
    const idPeca = data.idPeca ? normalizeIdPeca(data.idPeca) : suggested.sugestao;
    const existing = await prisma.peca.findUnique({ where: { idPeca } });
    if (existing) {
      return res.status(400).json({ error: 'ID da peca ja existe no sistema' });
    }

    const financials = calculatePecaFinancialValues(
      data,
      Number(data.precoML),
      Number(data.valorFrete),
      Number(data.valorTaxas),
    );
    const peca = await prisma.peca.create({
      data: {
        motoId: data.motoId,
        descricao: data.descricao,
        precoML: financials.precoML,
        valorLiq: financials.valorLiq,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        disponivel: data.disponivel,
        emPrejuizo: false,
        blingPedidoNum: data.blingPedidoNum ? String(data.blingPedidoNum).trim() : null,
        localizacao: normalizePecaLocalizacao(data.localizacao),
        idPeca,
        cadastro:  data.cadastro  ? new Date(data.cadastro)  : new Date(),
        dataVenda: data.dataVenda ? new Date(data.dataVenda) : null,
      }
    });
    res.status(201).json(peca);
  } catch (e) { next(e); }
});

// PUT /pecas/:id
pecasRouter.put('/:id', async (req, res, next) => {
  try {
    const data = updatePecaSchema.parse(req.body);
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, precoML: true, valorFrete: true, valorTaxas: true },
    });
    if (!current) return res.status(404).json({ error: 'Peca nao encontrada' });

    const financials = calculatePecaFinancialValues(
      current,
      data.precoML !== undefined ? Number(data.precoML) : undefined,
      data.valorFrete !== undefined ? Number(data.valorFrete) : undefined,
      data.valorTaxas !== undefined ? Number(data.valorTaxas) : undefined,
    );
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        ...data,
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
        blingPedidoNum: data.blingPedidoNum !== undefined
          ? (data.blingPedidoNum ? String(data.blingPedidoNum).trim() : null)
          : undefined,
        localizacao: data.localizacao !== undefined
          ? normalizePecaLocalizacao(data.localizacao)
          : undefined,
        cadastro:  data.cadastro  ? new Date(data.cadastro)  : undefined,
        dataVenda: data.dataVenda ? new Date(data.dataVenda) : null,
      }
    });
    res.json(peca);
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/cancelar-venda
pecasRouter.patch('/:id/cancelar-venda', async (req, res, next) => {
  try {
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, precoML: true, valorFrete: true, valorTaxas: true }
    });
    if (!current) return res.status(404).json({ error: 'Peca nao encontrada' });

    const financials = calculatePecaFinancialValues(current);
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        disponivel: true,
        emPrejuizo: false,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
      }
    });

    res.json(peca);
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/vender
pecasRouter.patch('/:id/vender', async (req, res, next) => {
  try {
    const { dataVenda, pedidoNum, precoML, frete, taxaValor } = req.body;
    if (!pedidoNum || !String(pedidoNum).trim()) {
      return res.status(400).json({ error: 'Numero do pedido e obrigatorio' });
    }
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        motoId: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        moto: { select: { marca: true, modelo: true } },
      }
    });
    if (!current) return res.status(404).json({ error: 'Peça não encontrada' });

    const financials = calculateManualSaleValues(
      current,
      precoML !== undefined ? Number(precoML) : undefined,
      frete !== undefined ? Number(frete) : undefined,
      taxaValor !== undefined ? Number(taxaValor) : undefined,
    );
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        disponivel: false,
        emPrejuizo: false,
        dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
        blingPedidoId: null,
        blingPedidoNum: String(pedidoNum).trim(),
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
      }
    });
    let alertaDetranEmailEnviado = false;
    let alertaDetranEmailErro: string | null = null;
    try {
      const resultadoEmailDetran = await sendDetranBaixaEmailIfNeeded([
        {
          idPeca: current.idPeca,
          descricao: current.descricao,
          detranEtiqueta: current.detranEtiqueta || '',
          motoId: current.motoId,
          moto: current.moto ? `${current.moto.marca} ${current.moto.modelo}`.trim() : null,
        },
      ]);
      alertaDetranEmailEnviado = !!resultadoEmailDetran?.sent;
    } catch (error: any) {
      alertaDetranEmailErro = error?.message || String(error);
    }

    res.json({ ...peca, alertaDetranEmailEnviado, alertaDetranEmailErro });
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/prejuizo
pecasRouter.patch('/:id/prejuizo', async (req, res, next) => {
  try {
    const payload = prejuizoPayloadSchema.parse(req.body || {});
    const motivo = String(payload.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Motivo do prejuizo e obrigatorio' });
    if (!PREJUIZO_MOTIVOS.has(motivo)) {
      return res.status(400).json({ error: 'Motivo do prejuizo invalido' });
    }

    const peca = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        idPeca: true,
        motoId: true,
        descricao: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        disponivel: true,
        emPrejuizo: true,
      },
    });
    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });
    if (peca.emPrejuizo) return res.status(400).json({ error: 'Peca ja esta em prejuizo' });
    if (!peca.disponivel) return res.status(400).json({ error: 'So e possivel marcar prejuizo para pecas em estoque' });

    const descricao = payload.descricao ? String(payload.descricao).trim() : peca.descricao;
    const financials = calculatePecaFinancialValues(
      peca,
      payload.precoML !== undefined ? Number(payload.precoML) : undefined,
      payload.valorFrete !== undefined ? Number(payload.valorFrete) : undefined,
      payload.valorTaxas !== undefined ? Number(payload.valorTaxas) : undefined,
    );

    const detalhe = `${peca.idPeca} - ${descricao}`;
    const result = await prisma.$transaction(async (tx) => {
      await tx.peca.update({
        where: { id: peca.id },
        data: {
          motoId: payload.motoId !== undefined ? Number(payload.motoId) : undefined,
          descricao,
          cadastro: payload.cadastro ? new Date(payload.cadastro) : undefined,
          precoML: financials.precoML,
          valorFrete: financials.valorFrete,
          valorTaxas: financials.valorTaxas,
          valorLiq: financials.valorLiq,
          disponivel: false,
          emPrejuizo: true,
          dataVenda: null,
          blingPedidoId: null,
          blingPedidoNum: null,
        },
      });

      const prejuizo = await tx.prejuizo.create({
        data: {
          data: new Date(),
          detalhe,
          motivo,
          observacao: payload.observacao ? String(payload.observacao).trim() : null,
          pecaId: peca.id,
          valor: financials.precoML,
          frete: financials.valorFrete,
        },
      });

      return prejuizo;
    });

    res.json(result);
  } catch (e) { next(e); }
});

// DELETE /pecas/:id
pecasRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.peca.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
