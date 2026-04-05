import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const faturamentoRouter = Router();

function getBaseSku(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-\d+$/, '');
}

// GET /faturamento/geral — receita líquida mensal (Valor Líquido = já descontado taxa+frete)
faturamentoRouter.get('/geral', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } },
      select: { valorLiq: true, precoML: true, dataVenda: true }
    });

    const por_mes: Record<string, any> = {};
    pecas.forEach(p => {
      if (!p.dataVenda) return;
      const d = new Date(p.dataVenda);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!por_mes[key]) por_mes[key] = { receita: 0, receitaLiq: 0, qtd: 0, mes: d.getMonth() + 1, ano: d.getFullYear() };
      por_mes[key].receita    += Number(p.precoML);   // bruta
      por_mes[key].receitaLiq += Number(p.valorLiq);  // líquida
      por_mes[key].qtd        += 1;
    });

    res.json(Object.values(por_mes).sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
    ));
  } catch (e) { next(e); }
});

// GET /faturamento/por-moto — receita por moto/mês
faturamentoRouter.get('/por-moto', async (req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } },
      select: { valorLiq: true, precoML: true, dataVenda: true, moto: { select: { id: true, marca: true, modelo: true } } }
    });

    const por_moto_mes: Record<string, any> = {};
    pecas.forEach(p => {
      if (!p.dataVenda) return;
      const d = new Date(p.dataVenda);
      const key = `${p.moto.id}-${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!por_moto_mes[key]) por_moto_mes[key] = {
        motoId: p.moto.id,
        moto: `${p.moto.marca} ${p.moto.modelo}`,
        mes: d.getMonth() + 1, ano: d.getFullYear(),
        receita: 0, receitaLiq: 0, qtd: 0
      };
      por_moto_mes[key].receita    += Number(p.precoML);
      por_moto_mes[key].receitaLiq += Number(p.valorLiq);
      por_moto_mes[key].qtd        += 1;
    });

    res.json(Object.values(por_moto_mes).sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
    ));
  } catch (e) { next(e); }
});

// GET /faturamento/dashboard
faturamentoRouter.get('/dashboard', async (req, res, next) => {
  try {
    const [totalMotos, totalPecas, pecasVendidas, pecasDisp, motos, despesas] = await Promise.all([
      prisma.moto.count(),
      prisma.peca.count(),
      prisma.peca.findMany({ where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } }, select: { precoML: true, valorLiq: true, valorTaxas: true, valorFrete: true } }),
      prisma.peca.findMany({ where: { disponivel: true, emPrejuizo: false }, select: { idPeca: true, precoML: true, valorLiq: true } }),
      prisma.moto.findMany({ select: { precoCompra: true } }),
      prisma.despesa.findMany({ select: { valor: true, categoria: true } }),
    ]);

    const receitaBruta  = pecasVendidas.reduce((s, p) => s + Number(p.precoML), 0);
    const receitaLiq    = pecasVendidas.reduce((s, p) => s + Number(p.valorLiq), 0);
    const comissaoML    = pecasVendidas.reduce((s, p) => s + Number(p.valorTaxas), 0);
    const frete         = pecasVendidas.reduce((s, p) => s + Number(p.valorFrete), 0);
    const valorEst      = pecasDisp.reduce((s, p) => s + Number(p.precoML), 0);
    const valorEstLiq   = pecasDisp.reduce((s, p) => s + Number(p.valorLiq), 0);
    const totalIdsDisponiveis = new Set(
      pecasDisp
        .map((p) => getBaseSku(p.idPeca))
        .filter(Boolean),
    ).size;

    // CMV = preços de compra + despesas categoria Moto
    const investido     = motos.reduce((s, m) => s + Number(m.precoCompra), 0);
    const comprasMoto   = despesas.filter(d => d.categoria.trim() === 'Moto').reduce((s, d) => s + Number(d.valor), 0);
    const cmv           = investido + comprasMoto;

    // Despesas operacionais (sem categoria Moto)
    const totalDesp     = despesas.filter(d => d.categoria.trim() !== 'Moto').reduce((s, d) => s + Number(d.valor), 0);

    res.json({
      totalMotos,
      totalPecas,
      totalDisponivel: pecasDisp.length,
      totalIdsDisponiveis,
      totalVendidas:   pecasVendidas.length,
      receitaBruta,
      receitaLiq,
      comissaoML,
      frete,
      valorEst,
      valorEstLiq,
      investido,
      cmv,
      totalDesp,
      lucroOp: receitaLiq - cmv - totalDesp,
    });
  } catch (e) { next(e); }
});
