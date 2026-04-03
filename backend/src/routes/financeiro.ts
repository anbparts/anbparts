import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const financeiroRouter = Router();

const fmt = (v: any) => Number(v) || 0;

// ── DESPESAS ────────────────────────────────────────────────────────────────
financeiroRouter.get('/despesas', async (req, res, next) => {
  try {
    const rows = await prisma.despesa.findMany({ orderBy: { data: 'desc' } });
    res.json(rows.map(r => ({ ...r, valor: fmt(r.valor) })));
  } catch (e) { next(e); }
});

financeiroRouter.post('/despesas', async (req, res, next) => {
  try {
    const { data, detalhes, categoria, valor } = req.body;
    const row = await prisma.despesa.create({ data: { data: new Date(data), detalhes, categoria: categoria || 'Outros', valor } });
    res.json(row);
  } catch (e) { next(e); }
});

financeiroRouter.delete('/despesas/:id', async (req, res, next) => {
  try {
    await prisma.despesa.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PREJUÍZOS ────────────────────────────────────────────────────────────────
financeiroRouter.get('/prejuizos', async (req, res, next) => {
  try {
    const rows = await prisma.prejuizo.findMany({ orderBy: { data: 'desc' } });
    res.json(rows.map(r => ({ ...r, valor: fmt(r.valor), frete: fmt(r.frete) })));
  } catch (e) { next(e); }
});

financeiroRouter.post('/prejuizos', async (req, res, next) => {
  try {
    const { data, detalhe, valor, frete } = req.body;
    const row = await prisma.prejuizo.create({ data: { data: new Date(data), detalhe, valor: valor || 0, frete: frete || 0 } });
    res.json(row);
  } catch (e) { next(e); }
});

financeiroRouter.delete('/prejuizos/:id', async (req, res, next) => {
  try {
    await prisma.prejuizo.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── INVESTIMENTOS ────────────────────────────────────────────────────────────
financeiroRouter.get('/investimentos', async (req, res, next) => {
  try {
    const rows = await prisma.investimento.findMany({ orderBy: { data: 'desc' } });
    res.json(rows.map(r => ({ ...r, valor: fmt(r.valor) })));
  } catch (e) { next(e); }
});

financeiroRouter.post('/investimentos', async (req, res, next) => {
  try {
    const { data, socio, moto, valor } = req.body;
    const row = await prisma.investimento.create({ data: { data: new Date(data), socio, moto: moto || null, valor } });
    res.json(row);
  } catch (e) { next(e); }
});

financeiroRouter.delete('/investimentos/:id', async (req, res, next) => {
  try {
    await prisma.investimento.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── DRE — calculado em tempo real a partir dos dados do banco ───────────────
financeiroRouter.get('/dre', async (req, res, next) => {
  try {
    const [pecasVendidas, despesas, prejuizos, motos] = await Promise.all([
      prisma.peca.findMany({ where: { disponivel: false }, select: { precoML: true, valorLiq: true, valorFrete: true, valorTaxas: true } }),
      prisma.despesa.findMany({ select: { valor: true, categoria: true } }),
      prisma.prejuizo.findMany({ select: { valor: true, frete: true } }),
      prisma.moto.findMany({ select: { precoCompra: true } }),
    ]);

    const receitaBruta  = pecasVendidas.reduce((s, p) => s + fmt(p.precoML), 0);
    const comissaoML    = pecasVendidas.reduce((s, p) => s + fmt(p.valorTaxas), 0);
    const frete         = pecasVendidas.reduce((s, p) => s + fmt(p.valorFrete), 0);
    // Receita líquida = Valor Líquido (já descontado taxa + frete, igual ao Excel)
    const receitaLiq    = pecasVendidas.reduce((s, p) => s + fmt(p.valorLiq), 0);

    // CMV = preços de compra + despesas categoria "Moto" (compras extras)
    const investido     = motos.reduce((s, m) => s + fmt(m.precoCompra), 0);
    const comprasMoto   = despesas.filter(d => d.categoria.trim() === 'Moto').reduce((s, d) => s + fmt(d.valor), 0);
    const cmv           = investido + comprasMoto;
    const lucroBruto    = receitaLiq - cmv;

    // Despesas operacionais (sem categoria Moto — ela vai pro CMV)
    const despOp        = despesas.filter(d => d.categoria.trim() !== 'Moto');
    const totalDesp     = despOp.reduce((s, d) => s + fmt(d.valor), 0);
    const totalPrej     = prejuizos.reduce((s, p) => s + fmt(p.valor) + fmt(p.frete), 0);
    const lucroOp       = lucroBruto - totalDesp - totalPrej;

    // Agrupamento por categoria (só despesas operacionais)
    const despPorCateg: Record<string, number> = {};
    despOp.forEach(d => { despPorCateg[d.categoria] = (despPorCateg[d.categoria] || 0) + fmt(d.valor); });

    res.json({
      receitaBruta, comissaoML, frete, receitaLiq,
      investido, comprasMoto, cmv, lucroBruto,
      totalDesp, totalPrej, lucroOp,
      despPorCateg,
      qtdVendidas: pecasVendidas.length,
    });
  } catch (e) { next(e); }
});
