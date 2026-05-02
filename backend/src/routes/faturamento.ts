import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { loadMercadoLivreSaldoResumo } from './mercado-livre';

export const faturamentoRouter = Router();
const DASHBOARD_MERCADO_PAGO_TIMEOUT_MS = 4000;

function getBaseSku(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-\d+$/, '');
}

function normalizeDespesaCategoria(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

async function loadDashboardMercadoPagoSaldo() {
  try {
    return await Promise.race([
      loadMercadoLivreSaldoResumo(),
      new Promise((resolve) => {
        setTimeout(() => resolve({
          connected: true,
          error: 'Mercado Pago demorando para responder. Os indicadores locais continuam disponiveis.',
          consultadoEm: new Date().toISOString(),
        }), DASHBOARD_MERCADO_PAGO_TIMEOUT_MS);
      }),
    ]);
  } catch (error: any) {
    return {
      connected: true,
      error: String(error?.message || 'Nao foi possivel consultar o saldo do Mercado Pago.'),
      consultadoEm: new Date().toISOString(),
    };
  }
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
    const [totalMotos, totalPecas, pecasVendidas, pecasDisp, motos, despesas, mercadoLivreSaldo, totalPrejuizo] = await Promise.all([
      prisma.moto.count(),
      prisma.peca.count(),
      prisma.peca.findMany({ where: { disponivel: false, emPrejuizo: false, dataVenda: { not: null } }, select: { precoML: true, valorLiq: true, valorTaxas: true, valorFrete: true } }),
      prisma.peca.findMany({ where: { disponivel: true, emPrejuizo: false }, select: { idPeca: true, precoML: true, valorLiq: true } }),
      prisma.moto.findMany({ select: { precoCompra: true } }),
      prisma.despesa.findMany({ select: { valor: true, categoria: true } }),
      loadDashboardMercadoPagoSaldo(),
      prisma.peca.count({ where: { emPrejuizo: true } }),
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
    const comprasMoto   = despesas.filter(d => normalizeDespesaCategoria(d.categoria) === 'moto').reduce((s, d) => s + Number(d.valor), 0);
    const cmv           = investido + comprasMoto;

    // Despesas operacionais (sem categoria Moto)
    const totalDesp     = despesas.filter(d => normalizeDespesaCategoria(d.categoria) !== 'moto').reduce((s, d) => s + Number(d.valor), 0);

    res.json({
      totalMotos,
      totalPecas,
      totalDisponivel: pecasDisp.length,
      totalIdsDisponiveis,
      totalVendidas:   pecasVendidas.length,
      totalPrejuizo,
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
      mercadoLivreSaldo,
    });
  } catch (e) { next(e); }
});

// GET /faturamento/estoque-percentual — % do estoque vendido por mês/moto
faturamentoRouter.get('/estoque-percentual', async (req, res, next) => {
  try {
    // Buscar todas as peças com dados necessários (excluindo prejuízos)
    const pecas = await prisma.peca.findMany({
      where: { emPrejuizo: false },
      select: {
        valorLiq: true,
        precoML:  true,
        cadastro: true,
        dataVenda: true,
        disponivel: true,
        moto: { select: { id: true, marca: true, modelo: true, ano: true } },
      },
    });

    // Determinar range de meses existentes nas vendas
    const mesesVenda = pecas
      .filter(p => p.dataVenda)
      .map(p => {
        const d = new Date(p.dataVenda!);
        return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
      });

    if (mesesVenda.length === 0) { res.json({ meses: [], porMoto: [], consolidado: [] }); return; }

    // Range de meses: do mais antigo ao mais recente com venda
    const minAno  = Math.min(...mesesVenda.map(m => m.ano));
    const minMes  = Math.min(...mesesVenda.filter(m => m.ano === minAno).map(m => m.mes));
    const maxAno  = Math.max(...mesesVenda.map(m => m.ano));
    const maxMes  = Math.max(...mesesVenda.filter(m => m.ano === maxAno).map(m => m.mes));

    // Gerar lista de meses no range
    const meses: { ano: number; mes: number; key: string }[] = [];
    let a = minAno, m = minMes;
    while (a < maxAno || (a === maxAno && m <= maxMes)) {
      meses.push({ ano: a, mes: m, key: `${a}-${String(m).padStart(2, '0')}` });
      m++; if (m > 12) { m = 1; a++; }
    }

    // Agrupar peças por moto
    const motoMap: Record<number, { id: number; nome: string; pecas: typeof pecas }> = {};
    for (const p of pecas) {
      const mid = p.moto.id;
      if (!motoMap[mid]) {
        motoMap[mid] = {
          id: mid,
          nome: `${p.moto.marca} ${p.moto.modelo}${p.moto.ano ? ' ' + p.moto.ano : ''}`,
          pecas: [],
        };
      }
      motoMap[mid].pecas.push(p);
    }

    // Para cada moto × mês: calcular estoque início do mês e vendas do mês
    const porMoto: any[] = [];
    const consolidadoMap: Record<string, { estoqueInicio: number; vendido: number; qtdVendida: number }> = {};

    for (const motoData of Object.values(motoMap)) {
      for (const { ano, mes, key } of meses) {
        const inicioMes = new Date(ano, mes - 1, 1);
        const fimMes    = new Date(ano, mes, 1);

        // Estoque no início do mês: cadastrado antes do início do mês
        // E (ainda disponível OU foi vendida durante ou depois do início do mês)
        const estoqueInicioPecas = motoData.pecas.filter(p => {
          const cad = new Date(p.cadastro);
          if (cad >= inicioMes) return false;
          if (p.disponivel) return true;
          if (!p.dataVenda) return false;
          return new Date(p.dataVenda) >= inicioMes;
        });

        // Vendas no mês
        const vendidasMes = motoData.pecas.filter(p => {
          if (!p.dataVenda) return false;
          const dv = new Date(p.dataVenda);
          return dv >= inicioMes && dv < fimMes;
        });

        const estoqueInicio = estoqueInicioPecas.reduce((s, p) => s + Number(p.valorLiq || p.precoML), 0);
        const vendido       = vendidasMes.reduce((s, p) => s + Number(p.valorLiq), 0);
        const percentual    = estoqueInicio > 0 ? (vendido / estoqueInicio) * 100 : 0;

        if (estoqueInicio > 0 || vendido > 0) {
          porMoto.push({
            motoId: motoData.id,
            moto:   motoData.nome,
            ano, mes, key,
            estoqueInicio: Math.round(estoqueInicio * 100) / 100,
            vendido:       Math.round(vendido * 100) / 100,
            qtdVendida:    vendidasMes.length,
            percentual:    Math.round(percentual * 10) / 10,
          });
        }

        // Consolidado
        if (!consolidadoMap[key]) consolidadoMap[key] = { estoqueInicio: 0, vendido: 0, qtdVendida: 0 };
        consolidadoMap[key].estoqueInicio += estoqueInicio;
        consolidadoMap[key].vendido       += vendido;
        consolidadoMap[key].qtdVendida    += vendidasMes.length;
      }
    }

    // Consolidado final
    const consolidado = meses
      .filter(({ key }) => consolidadoMap[key])
      .map(({ ano, mes, key }) => {
        const c = consolidadoMap[key];
        return {
          ano, mes, key,
          estoqueInicio: Math.round(c.estoqueInicio * 100) / 100,
          vendido:       Math.round(c.vendido * 100) / 100,
          qtdVendida:    c.qtdVendida,
          percentual:    c.estoqueInicio > 0
            ? Math.round((c.vendido / c.estoqueInicio) * 1000) / 10
            : 0,
        };
      });

    res.json({ meses: meses.map(m => m.key), porMoto, consolidado });
  } catch (e) { next(e); }
});
