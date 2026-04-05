import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const financeiroRouter = Router();

const fmt = (v: any) => Number(v) || 0;

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
      valor: fmt(row.valor),
      frete: fmt(row.frete),
      total: fmt(row.valor) + fmt(row.frete),
      idMoto: row.peca?.motoId || null,
      skuMoto: row.peca?.motoId ? (skuMotoMap[row.peca.motoId] || null) : null,
      idPeca: row.peca?.idPeca || null,
      descricaoPeca: row.peca?.descricao || row.detalhe,
      moto: row.peca?.moto ? `${row.peca.moto.marca} ${row.peca.moto.modelo}` : null,
    })));
  } catch (e) { next(e); }
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
        await tx.peca.update({
          where: { id: row.pecaId },
          data: {
            emPrejuizo: false,
            disponivel: true,
            dataVenda: null,
            blingPedidoId: null,
            blingPedidoNum: null,
          },
        });
      }
    });

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
      prisma.peca.findMany({ where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } }, select: { precoML: true, valorLiq: true, valorFrete: true, valorTaxas: true } }),
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
