import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const motosRouter = Router();

const motoSchema = z.object({
  marca:        z.string().min(1),
  modelo:       z.string().min(1),
  ano:          z.number().int().optional().nullable(),
  cor:          z.string().optional().nullable(),
  placa:        z.string().optional().nullable(),
  chassi:       z.string().optional().nullable(),
  dataCompra:   z.string().optional().nullable(),
  precoCompra:  z.number().default(0),
  origemCompra: z.string().optional().nullable(),
  observacoes:  z.string().optional().nullable(),
});

// GET /motos
motosRouter.get('/', async (req, res, next) => {
  try {
    const motos = await prisma.moto.findMany({
      include: {
        pecas: {
          select: { id: true, disponivel: true, emPrejuizo: true, precoML: true, valorLiq: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    const result = motos.map(m => {
      const disponiveis = m.pecas.filter(p => p.disponivel && !p.emPrejuizo);
      const vendidas    = m.pecas.filter(p => !p.disponivel && !p.emPrejuizo);

      // Receita = Preço ML das vendidas (valor bruto)
      const receita = vendidas.reduce((s, p) => s + Number(p.precoML), 0);

      // Valor estoque = Preço ML das disponíveis
      const valorEst = disponiveis.reduce((s, p) => s + Number(p.precoML), 0);

      // Lucro previsto = igual ao Excel:
      // (Valor Líq. vendidas + Valor Líq. em estoque) - Preço Compra
      // Valor Líquido = já descontado taxa ML + frete
      const vlVendidas  = vendidas.reduce((s, p) => s + Number(p.valorLiq), 0);
      const vlEstoque   = disponiveis.reduce((s, p) => s + Number(p.valorLiq), 0);
      const lucro       = (vlVendidas + vlEstoque) - Number(m.precoCompra);

      // % recuperada = quanto do investimento já voltou (valor líq. vendidas / preço compra)
      const pctRecuperada = Number(m.precoCompra) > 0
        ? Math.round(vlVendidas / Number(m.precoCompra) * 100)
        : 0;

      return {
        ...m,
        precoCompra:    Number(m.precoCompra),
        qtdDisp:        disponiveis.length,
        qtdVendidas:    vendidas.length,
        receitaTotal:   receita,
        valorEstoque:   valorEst,
        vlVendidas,
        vlEstoque,
        lucro,
        pctRecuperada,
        pecas: undefined,
      };
    });

    res.json(result);
  } catch (e) { next(e); }
});

// GET /motos/:id
motosRouter.get('/:id', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUniqueOrThrow({
      where: { id: Number(req.params.id) },
      include: { pecas: { orderBy: { idPeca: 'asc' } } }
    });
    res.json(moto);
  } catch (e) { next(e); }
});

// POST /motos
motosRouter.post('/', async (req, res, next) => {
  try {
    const data = motoSchema.parse(req.body);
    const moto = await prisma.moto.create({
      data: {
        ...data,
        dataCompra: data.dataCompra ? new Date(data.dataCompra) : null,
      }
    });
    res.status(201).json(moto);
  } catch (e) { next(e); }
});

// PUT /motos/:id
motosRouter.put('/:id', async (req, res, next) => {
  try {
    const data = motoSchema.partial().parse(req.body);
    const moto = await prisma.moto.update({
      where: { id: Number(req.params.id) },
      data: {
        ...data,
        dataCompra: data.dataCompra ? new Date(data.dataCompra) : undefined,
      }
    });
    res.json(moto);
  } catch (e) { next(e); }
});

// DELETE /motos/:id
motosRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.moto.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
