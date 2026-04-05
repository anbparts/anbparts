import { Router } from 'express';
import { prisma } from '../lib/prisma';
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

const pecaSchema = z.object({
  motoId:      z.number().int(),
  descricao:   z.string().min(1),
  precoML:     z.number().default(0),
  valorLiq:    z.number().default(0),
  valorFrete:  z.number().default(0),
  valorTaxas:  z.number().default(0),
  disponivel:  z.boolean().default(true),
  blingPedidoNum: z.string().optional().nullable(),
  dataVenda:   z.string().optional().nullable(),
  cadastro:    z.string().optional().nullable(),
});

const prejuizoPayloadSchema = z.object({
  motivo: z.string().min(1),
  motoId: z.number().int().optional(),
  descricao: z.string().min(1).optional(),
  cadastro: z.string().optional().nullable(),
  precoML: z.number().optional(),
  valorFrete: z.number().optional(),
  valorTaxas: z.number().optional(),
});

async function gerarIdPeca(): Promise<string> {
  const last = await prisma.peca.findFirst({ orderBy: { idPeca: 'desc' } });
  if (!last) return 'PN0001';
  const num = parseInt(last.idPeca.replace('PN', '')) + 1;
  return 'PN' + String(num).padStart(4, '0');
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
    const { motoId, disponivel, search, dataVendaFrom, dataVendaTo, precoMlZero, page = '1', per = '20' } = req.query as any;
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

    const [total, pecas, totalDisp, totalVend] = await Promise.all([
      prisma.peca.count({ where }),
      prisma.peca.findMany({
        where,
        include: { moto: { select: { marca: true, modelo: true } } },
        orderBy: { idPeca: 'asc' },
        skip: (Number(page) - 1) * Number(per),
        take: Number(per),
      }),
      prisma.peca.count({ where: { ...where, disponivel: true } }),
      prisma.peca.count({ where: { ...where, disponivel: false, dataVenda: { not: null } } }),
    ]);

    res.json({ total, totalDisp, totalVend, page: Number(page), per: Number(per), data: pecas });
  } catch (e) { next(e); }
});

// POST /pecas
pecasRouter.post('/', async (req, res, next) => {
  try {
    const data = pecaSchema.parse(req.body);
    const idPeca = await gerarIdPeca();
    const peca = await prisma.peca.create({
      data: {
        ...data,
        emPrejuizo: false,
        blingPedidoNum: data.blingPedidoNum ? String(data.blingPedidoNum).trim() : null,
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
    const data = pecaSchema.partial().parse(req.body);
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
      select: { id: true, precoML: true, valorFrete: true, valorTaxas: true }
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
    res.json(peca);
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
