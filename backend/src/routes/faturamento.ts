import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const faturamentoRouter = Router();

// GET /faturamento/geral
faturamentoRouter.get('/geral', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: { disponivel: false, dataVenda: { not: null } },
      select: { precoML: true, dataVenda: true }
    });

    const por_mes: Record<string, { receita: number; qtd: number; mes: number; ano: number }> = {};
    pecas.forEach(p => {
      if (!p.dataVenda) return;
      const d = new Date(p.dataVenda);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!por_mes[key]) por_mes[key] = { receita: 0, qtd: 0, mes: d.getMonth() + 1, ano: d.getFullYear() };
      por_mes[key].receita += Number(p.precoML);
      por_mes[key].qtd += 1;
    });

    const result = Object.values(por_mes).sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
    );

    res.json(result);
  } catch (e) { next(e); }
});

// GET /faturamento/por-moto
faturamentoRouter.get('/por-moto', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: { disponivel: false, dataVenda: { not: null } },
      select: { precoML: true, dataVenda: true, moto: { select: { id: true, marca: true, modelo: true } } }
    });

    const por_moto_mes: Record<string, any> = {};
    pecas.forEach(p => {
      if (!p.dataVenda) return;
      const d = new Date(p.dataVenda);
      const key = `${p.moto.id}-${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!por_moto_mes[key]) por_moto_mes[key] = {
        motoId: p.moto.id,
        moto: `${p.moto.marca} ${p.moto.modelo}`,
        mes: d.getMonth() + 1,
        ano: d.getFullYear(),
        receita: 0, qtd: 0
      };
      por_moto_mes[key].receita += Number(p.precoML);
      por_moto_mes[key].qtd += 1;
    });

    const result = Object.values(por_moto_mes).sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
    );

    res.json(result);
  } catch (e) { next(e); }
});

// GET /faturamento/dashboard
faturamentoRouter.get('/dashboard', async (req, res, next) => {
  try {
    const [totalMotos, totalPecas, pecasVendidas, pecasDisp] = await Promise.all([
      prisma.moto.count(),
      prisma.peca.count(),
      prisma.peca.findMany({ where: { disponivel: false }, select: { precoML: true } }),
      prisma.peca.findMany({ where: { disponivel: true  }, select: { precoML: true } }),
    ]);

    const motos = await prisma.moto.findMany({ select: { precoCompra: true } });

    res.json({
      totalMotos,
      totalPecas,
      totalDisponivel: pecasDisp.length,
      totalVendidas:   pecasVendidas.length,
      receita:   pecasVendidas.reduce((s, p) => s + Number(p.precoML), 0),
      valorEst:  pecasDisp.reduce((s, p) => s + Number(p.precoML), 0),
      investido: motos.reduce((s, m) => s + Number(m.precoCompra), 0),
    });
  } catch (e) { next(e); }
});
