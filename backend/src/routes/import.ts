import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const importRouter = Router();

// POST /import/motos  — recebe array de motos do frontend (já parseado do Excel)
importRouter.post('/motos', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados inválidos' });

    const motos = raw
      .filter(m => m.marca || m.modelo)
      .map(m => ({
        marca:       String(m.marca || 'SEM MARCA').trim(),
        modelo:      String(m.modelo || 'SEM MODELO').trim(),
        ano:         m.ano ? Number(m.ano) : null,
        precoCompra: Number(m.precoCompra) || 0,
      }));

    let imported = 0;
    for (const m of motos) {
      // Evita duplicata pela combinação marca+modelo+ano
      const exists = await prisma.moto.findFirst({
        where: { marca: m.marca, modelo: m.modelo, ano: m.ano }
      });
      if (!exists) {
        await prisma.moto.create({ data: m });
        imported++;
      }
    }

    res.json({ imported });
  } catch (e) { next(e); }
});

// POST /import/pecas  — recebe array de peças do frontend (já parseado do Excel)
importRouter.post('/pecas', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados inválidos' });

    const pecas = raw.filter(p => p.idPeca && p.motoId).map(p => ({
      motoId:     Number(p.motoId) || 1,
      idPeca:     String(p.idPeca),
      descricao:  String(p.descricao || ''),
      precoML:    Number(p.precoML)    || 0,
      valorLiq:   Number(p.valorLiq)   || 0,
      valorFrete: Number(p.valorFrete) || 0,
      valorTaxas: Number(p.valorTaxas) || 0,
      disponivel: p.disponivel === true || p.disponivel === 'Sim',
      cadastro:   p.cadastro  ? new Date(p.cadastro)  : new Date(),
      dataVenda:  p.dataVenda ? new Date(p.dataVenda) : null,
    }));

    const ops = pecas.map(p => prisma.peca.upsert({
      where:  { idPeca: p.idPeca },
      create: p,
      update: { disponivel: p.disponivel, dataVenda: p.dataVenda, precoML: p.precoML },
    }));

    const results = await prisma.$transaction(ops);
    res.json({ imported: results.length });
  } catch (e) { next(e); }
});

// POST /import/despesas
importRouter.post('/despesas', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados inválidos' });

    const rows = raw.filter(r => r.data && r.detalhes).map(r => ({
      data:      new Date(r.data),
      detalhes:  String(r.detalhes),
      categoria: String(r.categoria || 'Outros'),
      valor:     Number(r.valor) || 0,
    }));

    // Limpa e reimporta (evita duplicata)
    await prisma.despesa.deleteMany();
    await prisma.despesa.createMany({ data: rows });
    res.json({ imported: rows.length });
  } catch (e) { next(e); }
});

// POST /import/prejuizos
importRouter.post('/prejuizos', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados inválidos' });

    const rows = raw.filter(r => r.data && r.detalhe).map(r => ({
      data:   new Date(r.data),
      detalhe: String(r.detalhe),
      valor:  Number(r.valor) || 0,
      frete:  Number(r.frete) || 0,
    }));

    await prisma.prejuizo.deleteMany();
    await prisma.prejuizo.createMany({ data: rows });
    res.json({ imported: rows.length });
  } catch (e) { next(e); }
});

// POST /import/investimentos
importRouter.post('/investimentos', async (req, res, next) => {
  try {
    const raw = req.body as any[];
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'Dados inválidos' });

    const rows = raw.filter(r => r.data && r.socio).map(r => ({
      data:  new Date(r.data),
      socio: String(r.socio),
      moto:  r.moto ? String(r.moto) : null,
      valor: Number(r.valor) || 0,
    }));

    await prisma.investimento.deleteMany();
    await prisma.investimento.createMany({ data: rows });
    res.json({ imported: rows.length });
  } catch (e) { next(e); }
});
