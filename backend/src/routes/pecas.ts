import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const pecasRouter = Router();

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

// GET /pecas
pecasRouter.get('/', async (req, res, next) => {
  try {
    const { motoId, disponivel, search, page = '1', per = '20' } = req.query as any;
    const where: any = {};
    if (motoId) where.motoId = Number(motoId);
    if (disponivel !== undefined) where.disponivel = disponivel === 'true';
    if (search) where.OR = [
      { idPeca: { contains: search, mode: 'insensitive' } },
      { descricao: { contains: search, mode: 'insensitive' } },
    ];

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
    const { dataVenda, precoML } = req.body;
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        disponivel: false,
        dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
        ...(precoML ? { precoML } : {}),
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
