import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const importRouter = Router();

// POST /import/motos  — recebe array de motos do frontend (já parseado do Excel)
importRouter.post('/motos', async (req, res, next) => {
  try {
    const motos = z.array(z.object({
      marca:       z.string(),
      modelo:      z.string(),
      ano:         z.number().optional().nullable(),
      precoCompra: z.number().optional(),
    })).parse(req.body);

    const created = await prisma.$transaction(
      motos.map(m => prisma.moto.create({ data: m }))
    );
    res.json({ imported: created.length });
  } catch (e) { next(e); }
});

// POST /import/pecas  — recebe array de peças do frontend (já parseado do Excel)
importRouter.post('/pecas', async (req, res, next) => {
  try {
    const pecas = z.array(z.object({
      motoId:     z.number(),
      idPeca:     z.string(),
      descricao:  z.string(),
      precoML:    z.number().optional(),
      valorLiq:   z.number().optional(),
      valorFrete: z.number().optional(),
      valorTaxas: z.number().optional(),
      disponivel: z.boolean(),
      cadastro:   z.string().optional(),
      dataVenda:  z.string().optional().nullable(),
    })).parse(req.body);

    // upsert por idPeca para evitar duplicatas
    const ops = pecas.map(p => prisma.peca.upsert({
      where: { idPeca: p.idPeca },
      create: {
        ...p,
        cadastro:  p.cadastro  ? new Date(p.cadastro)  : new Date(),
        dataVenda: p.dataVenda ? new Date(p.dataVenda) : null,
      },
      update: {
        disponivel: p.disponivel,
        dataVenda:  p.dataVenda ? new Date(p.dataVenda) : null,
        precoML:    p.precoML ?? 0,
      }
    }));

    const results = await prisma.$transaction(ops);
    res.json({ imported: results.length });
  } catch (e) { next(e); }
});
