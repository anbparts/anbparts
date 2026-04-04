import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const pecasRouter = Router();

const DEFAULT_SELL_FRETE = 29.9;
const DEFAULT_TAXA_PCT = 17;

const pecaSchema = z.object({
  motoId:      z.number().int(),
  descricao:   z.string().min(1),
  precoML:     z.number().default(0),
  valorLiq:    z.number().default(0),
  valorFrete:  z.number().default(0),
  valorTaxas:  z.number().default(0),
  disponivel:  z.boolean().default(true),
  dataVenda:   z.string().optional().nullable(),
  cadastro:    z.string().optional().nullable(),
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
    const { motoId, disponivel, search, dataVendaFrom, dataVendaTo, page = '1', per = '20' } = req.query as any;
    const where: any = {};
    if (motoId) where.motoId = Number(motoId);
    if (disponivel !== undefined) where.disponivel = disponivel === 'true';
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
      prisma.peca.count({ where: { ...where, disponivel: true  } }),
      prisma.peca.count({ where: { ...where, disponivel: false } }),
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
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        ...data,
        cadastro:  data.cadastro  ? new Date(data.cadastro)  : undefined,
        dataVenda: data.dataVenda ? new Date(data.dataVenda) : null,
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

// DELETE /pecas/:id
pecasRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.peca.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
