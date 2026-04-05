import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const importRouter = Router();

// POST /import/motos
importRouter.post('/motos', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados invalidos' });

    const motos = raw
      .filter((m) => m.marca || m.modelo)
      .map((m) => ({
        marca: String(m.marca || 'SEM MARCA').trim(),
        modelo: String(m.modelo || 'SEM MODELO').trim(),
        ano: m.ano ? Number(m.ano) : null,
        precoCompra: Number(m.precoCompra) || 0,
      }));

    let imported = 0;
    for (const moto of motos) {
      const exists = await prisma.moto.findFirst({
        where: { marca: moto.marca, modelo: moto.modelo, ano: moto.ano },
      });
      if (!exists) {
        await prisma.moto.create({ data: moto });
        imported += 1;
      }
    }

    res.json({ imported });
  } catch (e) { next(e); }
});

// POST /import/pecas
importRouter.post('/pecas', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados invalidos' });

    let imported = 0;
    let skippedInvalidMoto = 0;
    const invalidMotoSamples: { idPeca: string; motoId: any }[] = [];
    const motos = await prisma.moto.findMany({ select: { id: true } });
    const validMotoIds = new Set(motos.map((m) => m.id));

    for (const p of raw) {
      if (!p.idPeca || !p.motoId) continue;

      const motoId = Number(p.motoId);
      if (!Number.isInteger(motoId) || !validMotoIds.has(motoId)) {
        skippedInvalidMoto += 1;
        if (invalidMotoSamples.length < 10) {
          invalidMotoSamples.push({ idPeca: String(p.idPeca), motoId: p.motoId });
        }
        continue;
      }

      const data = {
        motoId,
        idPeca: String(p.idPeca),
        descricao: String(p.descricao || ''),
        precoML: Number(p.precoML) || 0,
        valorLiq: Number(p.valorLiq) || 0,
        valorFrete: Number(p.valorFrete) || 0,
        valorTaxas: Number(p.valorTaxas) || 0,
        disponivel: p.disponivel === true || p.disponivel === 'Sim',
        emPrejuizo: false,
        cadastro: p.cadastro ? new Date(p.cadastro) : new Date(),
        dataVenda: p.dataVenda ? new Date(p.dataVenda) : null,
      };

      await prisma.peca.upsert({
        where: { idPeca: data.idPeca },
        create: data,
        update: {
          disponivel: data.disponivel,
          dataVenda: data.dataVenda,
          precoML: data.precoML,
          valorLiq: data.valorLiq,
          valorFrete: data.valorFrete,
          valorTaxas: data.valorTaxas,
          descricao: data.descricao,
        },
      });
      imported += 1;
    }

    res.json({ imported, skippedInvalidMoto, invalidMotoSamples });
  } catch (e) { next(e); }
});

// POST /import/despesas
importRouter.post('/despesas', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados invalidos' });

    const rows = raw.filter((r) => r.data && r.detalhes).map((r) => ({
      data: new Date(r.data),
      detalhes: String(r.detalhes),
      categoria: String(r.categoria || 'Outros'),
      valor: Number(r.valor) || 0,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.despesa.deleteMany();
      if (rows.length) await tx.despesa.createMany({ data: rows });
    });
    res.json({ imported: rows.length });
  } catch (e) { next(e); }
});

// POST /import/investimentos
importRouter.post('/investimentos', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados invalidos' });

    const rows = raw.filter((r) => r.data && r.socio).map((r) => ({
      data: new Date(r.data),
      socio: String(r.socio),
      moto: r.moto ? String(r.moto) : null,
      valor: Number(r.valor) || 0,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.investimento.deleteMany();
      if (rows.length) await tx.investimento.createMany({ data: rows });
    });
    res.json({ imported: rows.length });
  } catch (e) { next(e); }
});
