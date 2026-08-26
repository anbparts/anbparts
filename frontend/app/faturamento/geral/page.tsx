'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ChartPanel, DonutChart, HeatmapChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/api-base';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const API = API_BASE;

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentYear() {
  return String(new Date().getFullYear());
}

function currentMonth() {
  return new Date().getMonth() + 1;
}

function quarterLabel(mes: number) {
  if (mes <= 3) return '1T';
  if (mes <= 6) return '2T';
  if (mes <= 9) return '3T';
  return '4T';
}

function periodKey(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function marcaDaMoto(nome: any) {
  const texto = String(nome || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!texto) return 'SEM MARCA';
  const marcasCompostas = ['HARLEY DAVIDSON', 'ROYAL ENFIELD', 'MOTO GUZZI', 'MV AGUSTA'];
  const composta = marcasCompostas.find((marca) => texto.startsWith(marca));
  if (composta) return composta;
  return texto.split(' ')[0] || 'SEM MARCA';
}

const GIRO_BREAKPOINTS_DEFAULT = [7, 15, 30, 60, 90, 180, 365];
const VALOR_BREAKPOINTS_DEFAULT = [300, 600, 1000, 1500];

const GIRO_BREAKPOINTS_KEY = 'anb.faturamentoGeral.giroBreakpoints';
const VALOR_BREAKPOINTS_KEY = 'anb.faturamentoGeral.valorBreakpoints';
const GIRO_VISAO_KEY = 'anb.faturamentoGeral.giroVisao';
const VALOR_VISAO_KEY = 'anb.faturamentoGeral.valorVisao';

function gerarFaixasNumericas(
  breakpointsRaw: number[],
  passo: number,
  fmtLimite: (n: number) => string,
  labelAte: string,
  labelAcima: string,
  conector: string,
): { label: string; min: number; max: number }[] {
  const bps = Array.from(new Set(breakpointsRaw.filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
  if (!bps.length) return [];
  const faixas: { label: string; min: number; max: number }[] = [];
  bps.forEach((bp, index) => {
    if (index === 0) {
      faixas.push({ label: `${labelAte} ${fmtLimite(bp)}`, min: 0, max: bp });
    } else {
      const min = bps[index - 1] + passo;
      faixas.push({ label: `${fmtLimite(min)} ${conector} ${fmtLimite(bp)}`, min, max: bp });
    }
  });
  faixas.push({ label: `${labelAcima} ${fmtLimite(bps[bps.length - 1])}`, min: bps[bps.length - 1] + passo, max: Infinity });
  return faixas;
}

function carregarBreakpointsSalvos(chave: string, padrao: number[]): number[] {
  if (typeof window === 'undefined') return padrao;
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return padrao;
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista) || !lista.length) return padrao;
    const numeros = lista.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    return numeros.length ? numeros : padrao;
  } catch {
    return padrao;
  }
}

function carregarVisaoSalva(chave: string): 'sku' | 'categoria' {
  if (typeof window === 'undefined') return 'sku';
  const valor = window.localStorage.getItem(chave);
  return valor === 'categoria' ? 'categoria' : 'sku';
}

function mediaDias(valores: number[]) {
  if (!valores.length) return 0;
  return valores.reduce((sum, v) => sum + v, 0) / valores.length;
}

function medianaDias(valores: number[]) {
  if (!valores.length) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

function subLinhasPorVisao(itens: any[], visao: 'sku' | 'categoria', mapaCategorias: Record<string, string[]>) {
  const mapa = new Map<string, number>();
  itens.forEach((l: any) => {
    if (visao === 'sku') {
      mapa.set(l.skuBase, (mapa.get(l.skuBase) || 0) + 1);
    } else {
      const categorias = mapaCategorias[l.skuBase];
      const lista = categorias && categorias.length ? categorias : ['Sem categoria'];
      lista.forEach((categoria) => mapa.set(categoria, (mapa.get(categoria) || 0) + 1));
    }
  });
  return Array.from(mapa.entries())
    .map(([label, qtd]) => ({ label, qtd, pct: itens.length ? (qtd / itens.length) * 100 : 0 }))
    .sort((a, b) => b.qtd - a.qtd);
}

const cs: any = {
  topbar: {
    minHeight: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th: {
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontFamily: 'Geist Mono, monospace',
    fontSize: 10.5,
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-muted)',
  },
  td: { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  sel: {
    background: 'var(--gray-50)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '7px 11px',
    fontSize: 13,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    height: 32,
    cursor: 'pointer',
  },
};

export default function FaturamentoGeralPage() {
  const [data, setData] = useState<any[]>([]);
  const [filtAno, setFiltAno] = useState(currentYear());
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [giroData, setGiroData] = useState<any[] | null>(null);
  const [giroLoading, setGiroLoading] = useState(false);
  const [giroAno, setGiroAno] = useState('');
  const [giroMes, setGiroMes] = useState('');
  const [giroMarca, setGiroMarca] = useState('');
  const [giroMoto, setGiroMoto] = useState('');
  const [valorFaixaAberta, setValorFaixaAberta] = useState('');
  const [giroFaixaAberta, setGiroFaixaAberta] = useState('');
  const [provisaoData, setProvisaoData] = useState<any[] | null>(null);
  const [provisaoLoading, setProvisaoLoading] = useState(false);
  const [provisaoMarca, setProvisaoMarca] = useState('');
  const [mapaCategorias, setMapaCategorias] = useState<Record<string, string[]>>({});
  const [mapaCategoriasCarregado, setMapaCategoriasCarregado] = useState(false);
  const [giroBreakpoints, setGiroBreakpoints] = useState<number[]>(GIRO_BREAKPOINTS_DEFAULT);
  const [valorBreakpoints, setValorBreakpoints] = useState<number[]>(VALOR_BREAKPOINTS_DEFAULT);
  const [giroVisao, setGiroVisao] = useState<'sku' | 'categoria'>('sku');
  const [valorVisao, setValorVisao] = useState<'sku' | 'categoria'>('sku');
  const [configFaixasAberto, setConfigFaixasAberto] = useState<'giro' | 'valor' | ''>('');
  const [configFaixasTexto, setConfigFaixasTexto] = useState('');
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const isCompact = isPhone || isTabletPortrait;
  const shouldUseCompactMonthlyPanel = viewportMode !== 'desktop';

  useEffect(() => {
    api.faturamento.geral().then((response) => {
      setData(response);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setGiroBreakpoints(carregarBreakpointsSalvos(GIRO_BREAKPOINTS_KEY, GIRO_BREAKPOINTS_DEFAULT));
    setValorBreakpoints(carregarBreakpointsSalvos(VALOR_BREAKPOINTS_KEY, VALOR_BREAKPOINTS_DEFAULT));
    setGiroVisao(carregarVisaoSalva(GIRO_VISAO_KEY));
    setValorVisao(carregarVisaoSalva(VALOR_VISAO_KEY));
  }, []);

  // Busca de novo toda vez que entra na aba Tempo de Giro/Por Valor vindo de fora dela (nao so
  // na primeira vez) — sem isso, uma venda feita depois de a tela ja ter carregado nunca aparecia
  // ate recarregar a pagina inteira. So nao refaz ao alternar entre giro<->valor (mesmo dataset).
  const estavaEmGiroOuValor = useRef(false);
  useEffect(() => {
    const agora = modo === 'giro' || modo === 'valor';
    if (agora && !estavaEmGiroOuValor.current) {
      setGiroLoading(true);
      fetch(`${API}/faturamento/tempo-giro`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setGiroData(Array.isArray(d?.linhas) ? d.linhas : []))
        .catch(() => setGiroData([]))
        .finally(() => setGiroLoading(false));
    }
    estavaEmGiroOuValor.current = agora;
  }, [modo]);

  useEffect(() => {
    if ((modo !== 'giro' && modo !== 'valor') || mapaCategoriasCarregado) return;
    setMapaCategoriasCarregado(true);
    fetch(`${API}/faturamento/mapa-categorias`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setMapaCategorias(d?.mapa && typeof d.mapa === 'object' ? d.mapa : {}))
      .catch(() => setMapaCategorias({}));
  }, [modo, mapaCategoriasCarregado]);

  // Mesmo motivo do efeito acima: sem isso, a Provisao ficava com o retrato de quando a tela
  // foi aberta pela primeira vez, mesmo depois de vendas novas.
  const estavaEmProvisao = useRef(false);
  useEffect(() => {
    const agora = modo === 'provisao';
    if (agora && !estavaEmProvisao.current) {
      setProvisaoLoading(true);
      fetch(`${API}/faturamento/provisao`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setProvisaoData(Array.isArray(d?.linhas) ? d.linhas : []))
        .catch(() => setProvisaoData([]))
        .finally(() => setProvisaoLoading(false));
    }
    estavaEmProvisao.current = agora;
  }, [modo]);

  const anos = Array.from(new Set(data.map((item: any) => item.ano))).sort((a, b) => b - a);
  const filtered = data.filter((item) => !filtAno || item.ano === Number(filtAno));
  const mesAtual = currentMonth();
  const anoCardAtual = filtAno ? Number(filtAno) : new Date().getFullYear();

  const totalReceita = filtered.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
  const totalQtd = filtered.reduce((sum, item) => sum + Number(item.qtd || 0), 0);
  const mesCorrente = filtered.find((item) => item.ano === anoCardAtual && item.mes === mesAtual) || null;

  const periodItems = filtAno
    ? Array.from({ length: 12 }, (_, index) => ({
        key: periodKey(Number(filtAno), index + 1),
        label: MESES[index],
      }))
    : Array.from(
        new Set(
          filtered
            .slice()
            .sort((a, b) => periodKey(a.ano, a.mes).localeCompare(periodKey(b.ano, b.mes)))
            .map((item) => periodKey(item.ano, item.mes)),
        ),
      )
        .slice(-12)
        .map((key) => {
          const [ano, mes] = key.split('-');
          return {
            key,
            label: `${MESES[Number(mes) - 1]}/${String(ano).slice(-2)}`,
          };
        });

  const monthlyMap = new Map<string, { receita: number; qtd: number }>();
  filtered.forEach((item) => {
    const key = periodKey(item.ano, item.mes);
    const current = monthlyMap.get(key) || { receita: 0, qtd: 0 };
    current.receita += Number(item.receitaLiq || item.receita || 0);
    current.qtd += Number(item.qtd || 0);
    monthlyMap.set(key, current);
  });

  const painelMensalRows = [
    {
      label: 'Receita liquida',
      note: fmt(totalReceita),
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        return {
          label: period.label,
          value: current.receita,
          displayValue: current.receita > 0 ? fmt(current.receita) : '--',
          note: current.qtd > 0 ? `${current.qtd} p` : '',
        };
      }),
    },
    {
      label: 'Pecas vendidas',
      note: `${totalQtd} pecas`,
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        return {
          label: period.label,
          value: current.qtd,
          displayValue: current.qtd > 0 ? current.qtd.toLocaleString('pt-BR') : '--',
          note: '',
        };
      }),
    },
    {
      label: 'Ticket medio',
      note: totalQtd > 0 ? fmt(totalReceita / totalQtd) : '--',
      cells: periodItems.map((period) => {
        const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
        const ticket = current.qtd > 0 ? current.receita / current.qtd : 0;
        return {
          label: period.label,
          value: ticket,
          displayValue: current.qtd > 0 ? fmt(ticket) : '--',
          note: current.qtd > 0 ? `${current.qtd} p` : '',
        };
      }),
    },
  ];

  const quarterMap = new Map<string, { receita: number; qtd: number }>();
  filtered.forEach((item) => {
    const key = filtAno ? quarterLabel(item.mes) : `${quarterLabel(item.mes)}/${String(item.ano).slice(-2)}`;
    const current = quarterMap.get(key) || { receita: 0, qtd: 0 };
    current.receita += Number(item.receitaLiq || item.receita || 0);
    current.qtd += Number(item.qtd || 0);
    quarterMap.set(key, current);
  });

  const quarterItems = Array.from(quarterMap.entries())
    .map(([label, value]) => ({ label, value: value.receita, note: `${value.qtd} pecas` }))
    .sort((a, b) => b.value - a.value);

  const topPeriods = filtered
    .map((item) => ({
      label: `${MESES[item.mes - 1]}/${item.ano}`,
      value: Number(item.receitaLiq || item.receita || 0),
      note: `${item.qtd} pecas`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const monthlySummaryCards = periodItems.map((period) => {
    const current = monthlyMap.get(period.key) || { receita: 0, qtd: 0 };
    const ticket = current.qtd > 0 ? current.receita / current.qtd : 0;

    return {
      label: period.label,
      receita: current.receita,
      qtd: current.qtd,
      ticket,
      active: current.receita > 0 || current.qtd > 0,
    };
  });

  const giroRaw = giroData || [];
  const giroAnos = Array.from(new Set(giroRaw.map((l: any) => l.anoVenda))).sort((a, b) => b - a);
  const giroMarcas = Array.from(new Set(giroRaw.map((l: any) => marcaDaMoto(l.moto)))).sort();
  const giroMotosFiltradasPorMarca = Array.from(new Set(giroRaw
    .filter((l: any) => !giroMarca || marcaDaMoto(l.moto) === giroMarca)
    .map((l: any) => l.moto)
  )).sort();

  const giroFiltrado = giroRaw.filter((l: any) =>
    (!giroAno || l.anoVenda === Number(giroAno)) &&
    (!giroMes || l.mesVenda === Number(giroMes)) &&
    (!giroMarca || marcaDaMoto(l.moto) === giroMarca) &&
    (!giroMoto || l.moto === giroMoto)
  );

  const giroFaixasConfig = gerarFaixasNumericas(giroBreakpoints, 1, (n) => `${n} dias`, 'Ate', 'Mais de', 'a');

  const giroDistribuicao = giroFaixasConfig.map((faixa) => {
    const itens = giroFiltrado.filter((l: any) => l.diasGiro >= faixa.min && l.diasGiro <= faixa.max);
    return {
      label: faixa.label,
      qtd: itens.length,
      pct: giroFiltrado.length ? (itens.length / giroFiltrado.length) * 100 : 0,
      itens,
    };
  });

  const giroMediaGeral = mediaDias(giroFiltrado.map((l: any) => l.diasGiro));
  const giroMedianaGeral = medianaDias(giroFiltrado.map((l: any) => l.diasGiro));

  const giroPorMotoMap = new Map<number, { moto: string; dias: number[] }>();
  giroFiltrado.forEach((l: any) => {
    const atual = giroPorMotoMap.get(l.motoId) || { moto: l.moto, dias: [] as number[] };
    atual.dias.push(l.diasGiro);
    giroPorMotoMap.set(l.motoId, atual);
  });
  const giroPorMoto = Array.from(giroPorMotoMap.entries())
    .map(([motoId, v]) => ({ motoId, moto: v.moto, qtd: v.dias.length, media: mediaDias(v.dias) }))
    .sort((a, b) => b.qtd - a.qtd);

  const giroPorSkuMap = new Map<string, { dias: number[] }>();
  giroFiltrado.forEach((l: any) => {
    const atual = giroPorSkuMap.get(l.skuBase) || { dias: [] as number[] };
    atual.dias.push(l.diasGiro);
    giroPorSkuMap.set(l.skuBase, atual);
  });
  const giroPorSku = Array.from(giroPorSkuMap.entries())
    .map(([sku, v]) => ({ sku, qtd: v.dias.length, media: mediaDias(v.dias) }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 30);

  const valorFaixasConfig = gerarFaixasNumericas(valorBreakpoints, 0.01, (n) => fmt(n), 'Ate', 'Acima de', 'a');

  const valorDistribuicao = valorFaixasConfig.map((faixa) => {
    const itens = giroFiltrado.filter((l: any) => l.valor >= faixa.min && l.valor <= faixa.max);
    return {
      label: faixa.label,
      qtd: itens.length,
      pct: giroFiltrado.length ? (itens.length / giroFiltrado.length) * 100 : 0,
      itens,
    };
  });
  const valorTotalGeral = giroFiltrado.length;

  const HOJE = new Date();
  const provisaoRaw = provisaoData || [];
  const provisaoMarcas = Array.from(new Set(provisaoRaw.map((m: any) => marcaDaMoto(m.moto)))).sort();
  const provisaoFiltrado = provisaoRaw.filter((m: any) => !provisaoMarca || marcaDaMoto(m.moto) === provisaoMarca);

  const provisaoCalculada = provisaoFiltrado.map((m: any) => {
    const primeiraVenda = m.primeiraVenda ? new Date(m.primeiraVenda) : null;
    const diasAtivo = primeiraVenda ? Math.max(1, Math.round((HOJE.getTime() - primeiraVenda.getTime()) / 86400000)) : 0;
    const receitaPorDia = diasAtivo > 0 ? m.receitaLiq / diasAtivo : 0;
    const pecasPorDia = diasAtivo > 0 ? m.qtdVendida / diasAtivo : 0;
    const saldoRestante = m.precoCompra - m.receitaLiq;
    const percentualPago = m.precoCompra > 0 ? Math.min(999, (m.receitaLiq / m.precoCompra) * 100) : null;

    const semCusto = !(m.precoCompra > 0);
    const jaPago = !semCusto && saldoRestante <= 0;
    const semVendas = m.qtdVendida === 0;

    const diasParaPagar = !semCusto && !jaPago && !semVendas && receitaPorDia > 0
      ? Math.ceil(saldoRestante / receitaPorDia)
      : null;
    const dataPayback = diasParaPagar != null ? new Date(HOJE.getTime() + diasParaPagar * 86400000) : null;

    const diasParaEsgotar = m.qtdEstoque > 0 && pecasPorDia > 0 ? Math.ceil(m.qtdEstoque / pecasPorDia) : (m.qtdEstoque === 0 ? 0 : null);

    let status: 'pago' | 'projetado' | 'sem_dados' = 'sem_dados';
    if (jaPago) status = 'pago';
    else if (diasParaPagar != null) status = 'projetado';

    // Lucro futuro: receita ja recebida + receita projetada ate zerar o estoque no ritmo atual,
    // menos o preco de compra. Reflete o lucro final esperado quando toda a moto for vendida.
    const receitaFuturaProjetada = receitaPorDia * (diasParaEsgotar || 0);
    const receitaTotalProjetada = m.receitaLiq + receitaFuturaProjetada;
    const lucroFuturo = receitaTotalProjetada - m.precoCompra;
    const pctLucroFuturo = m.precoCompra > 0 ? (lucroFuturo / m.precoCompra) * 100 : null;

    return { ...m, diasAtivo, receitaPorDia, pecasPorDia, saldoRestante, percentualPago, semCusto, jaPago, semVendas, diasParaPagar, dataPayback, diasParaEsgotar, status, lucroFuturo, pctLucroFuturo };
  }).sort((a: any, b: any) => {
    const ordem = { pago: 0, projetado: 1, sem_dados: 2 };
    if (ordem[a.status as keyof typeof ordem] !== ordem[b.status as keyof typeof ordem]) {
      return ordem[a.status as keyof typeof ordem] - ordem[b.status as keyof typeof ordem];
    }
    if (a.status === 'projetado') return (a.diasParaPagar || 0) - (b.diasParaPagar || 0);
    return String(a.moto).localeCompare(String(b.moto));
  });

  const provisaoTotalInvestido = provisaoFiltrado.reduce((sum: number, m: any) => sum + m.precoCompra, 0);
  const provisaoTotalRecuperado = provisaoFiltrado.reduce((sum: number, m: any) => sum + m.receitaLiq, 0);
  const provisaoTotalSaldo = provisaoTotalInvestido - provisaoTotalRecuperado;
  const provisaoPctGeral = provisaoTotalInvestido > 0 ? (provisaoTotalRecuperado / provisaoTotalInvestido) * 100 : 0;

  const provisaoLucroFuturoTotal = provisaoCalculada.reduce((sum: number, m: any) => sum + m.lucroFuturo, 0);
  const provisaoPctLucroValidos = provisaoCalculada.map((m: any) => m.pctLucroFuturo).filter((v: any) => v !== null) as number[];
  const provisaoMediaPctLucro = provisaoPctLucroValidos.length
    ? provisaoPctLucroValidos.reduce((sum: number, v: number) => sum + v, 0) / provisaoPctLucroValidos.length
    : 0;

  function abrirConfigFaixas(tab: 'giro' | 'valor') {
    const atual = tab === 'giro' ? giroBreakpoints : valorBreakpoints;
    setConfigFaixasTexto(atual.join(' '));
    setConfigFaixasAberto(tab);
  }

  function salvarConfigFaixas() {
    const numeros = configFaixasTexto
      .split(/[;\s]+/)
      .filter(Boolean)
      .map((s) => Number(s.replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!numeros.length) return;
    const unicos = Array.from(new Set(numeros)).sort((a, b) => a - b);
    if (configFaixasAberto === 'giro') {
      setGiroBreakpoints(unicos);
      window.localStorage.setItem(GIRO_BREAKPOINTS_KEY, JSON.stringify(unicos));
    } else if (configFaixasAberto === 'valor') {
      setValorBreakpoints(unicos);
      window.localStorage.setItem(VALOR_BREAKPOINTS_KEY, JSON.stringify(unicos));
    }
    setConfigFaixasAberto('');
  }

  function alterarVisao(tab: 'giro' | 'valor', visao: 'sku' | 'categoria') {
    if (tab === 'giro') {
      setGiroVisao(visao);
      window.localStorage.setItem(GIRO_VISAO_KEY, visao);
    } else {
      setValorVisao(visao);
      window.localStorage.setItem(VALOR_VISAO_KEY, visao);
    }
  }

  function renderTabelaFaixas(
    tab: 'giro' | 'valor',
    faixas: { label: string; qtd: number; pct: number; itens: any[] }[],
    visao: 'sku' | 'categoria',
    faixaAberta: string,
    setFaixaAberta: (v: string) => void,
    totalGeral: number,
    colunaFaixa: string,
    subtitulo: string,
  ) {
    return (
      <div style={cs.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>{colunaFaixa}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{subtitulo}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['sku', 'categoria'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => alterarVisao(tab, v)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                    background: visao === v ? 'var(--ink)' : 'var(--white)',
                    color: visao === v ? 'var(--white)' : 'var(--ink)',
                  }}
                >
                  {v === 'sku' ? 'SKU' : 'Categoria'}
                </button>
              ))}
            </div>
            <button onClick={() => abrirConfigFaixas(tab)} style={{ ...cs.sel, cursor: 'pointer' }}>
              Configurar faixas
            </button>
          </div>
        </div>
        {visao === 'categoria' && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', padding: '10px 18px 0' }}>
            Categorias seguem a configuracao atual da Curva ABC (modo de categorias multiplas + unificacao). Se o modo "todas as categorias" estiver ativo la, um mesmo SKU pode contar em mais de uma categoria e os subtotais podem somar mais que 100%.
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
              <tr>{[colunaFaixa, 'Qtd.', '%'].map((h) => <th key={h} style={cs.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {faixas.every((f) => f.qtd === 0) ? (
                <tr><td colSpan={3} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '30px 20px' }}>Sem dados no filtro</td></tr>
              ) : faixas.map((faixa) => {
                const aberta = faixaAberta === faixa.label;
                const subLinhas = aberta ? subLinhasPorVisao(faixa.itens, visao, mapaCategorias) : [];
                return (
                  <Fragment key={faixa.label}>
                    <tr onClick={() => setFaixaAberta(aberta ? '' : faixa.label)} style={{ cursor: faixa.qtd > 0 ? 'pointer' : 'default', background: 'var(--gray-50)' }}>
                      <td style={{ ...cs.td, fontWeight: 700 }}>
                        {faixa.qtd > 0 && <span style={{ display: 'inline-block', width: 18, color: 'var(--ink-muted)' }}>{aberta ? '−' : '+'}</span>}
                        {faixa.label}
                      </td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700 }}>{faixa.qtd}</td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700 }}>{faixa.pct.toFixed(1)}%</td>
                    </tr>
                    {aberta && subLinhas.map((s) => (
                      <tr key={`${faixa.label}-${s.label}`}>
                        <td style={{ ...cs.td, fontSize: 12.5, paddingLeft: 32 }}>{s.label}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{s.qtd}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{s.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr style={{ background: 'var(--gray-50)', borderTop: '2px solid var(--border)' }}>
                <td style={{ ...cs.td, fontWeight: 700 }}>Total geral</td>
                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700 }}>{totalGeral}</td>
                <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700 }}>{totalGeral ? '100.0%' : '0%'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...cs.topbar, alignItems: isCompact ? 'flex-start' : 'center', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : cs.topbar.padding }}>
        <div>
          <div style={cs.title}>Faturamento Geral</div>
          <div style={cs.sub}>Receita total consolidada</div>
        </div>
        <ViewModeSwitch value={modo} onChange={setModo} modes={['grafico', 'relatorio', 'giro', 'valor', 'provisao']} />
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        {modo !== 'giro' && modo !== 'valor' && modo !== 'provisao' && (
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Receita total', value: fmt(totalReceita), color: 'var(--sage)' },
              { label: 'Pecas vendidas', value: totalQtd.toLocaleString('pt-BR'), color: 'var(--ink)' },
              {
                label: 'Mes corrente',
                value: `${MESES[mesAtual - 1]}/${anoCardAtual}`,
                color: 'var(--amber)',
                sub: fmt(Number(mesCorrente?.receitaLiq || mesCorrente?.receita || 0)),
              },
            ].map((card) => (
              <div key={card.label} style={cs.sCard}>
                <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.value, hidden)}</div>
                {card.sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.sub, hidden)}</div>}
              </div>
            ))}
          </div>
        )}

        {modo !== 'giro' && modo !== 'valor' && modo !== 'provisao' && (
          <div style={{ ...cs.card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={filtAno} onChange={(e) => setFiltAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
            </div>
          </div>
        )}

        {(modo === 'giro' || modo === 'valor') && (
          <div style={{ ...cs.card, marginBottom: 20 }}>
            <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(4, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
                <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={giroAno} onChange={(e) => setGiroAno(e.target.value)}>
                  <option value="">Todos os anos</option>
                  {giroAnos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
                </select>
                <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={giroMes} onChange={(e) => setGiroMes(e.target.value)}>
                  <option value="">Todos os meses</option>
                  {MESES.map((mes, index) => <option key={index + 1} value={String(index + 1)}>{mes}</option>)}
                </select>
                <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={giroMarca} onChange={(e) => { setGiroMarca(e.target.value); setGiroMoto(''); }}>
                  <option value="">Todas as marcas</option>
                  {giroMarcas.map((marca) => <option key={marca} value={marca}>{marca}</option>)}
                </select>
                <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={giroMoto} onChange={(e) => setGiroMoto(e.target.value)}>
                  <option value="">Todas as motos</option>
                  {giroMotosFiltradasPorMarca.map((moto) => <option key={moto} value={moto}>{moto}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {modo === 'provisao' && (
          <div style={{ ...cs.card, marginBottom: 20 }}>
            <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Filtros</div>
              <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined, marginTop: 10 }} value={provisaoMarca} onChange={(e) => setProvisaoMarca(e.target.value)}>
                <option value="">Todas as marcas</option>
                {provisaoMarcas.map((marca) => <option key={marca} value={marca}>{marca}</option>)}
              </select>
            </div>
          </div>
        )}

        {modo === 'provisao' ? (
          provisaoLoading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando provisao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Total investido', value: fmt(provisaoTotalInvestido), color: 'var(--ink)' },
                  { label: 'Total recuperado', value: fmt(provisaoTotalRecuperado), color: 'var(--sage)' },
                  { label: 'Saldo restante', value: fmt(Math.max(0, provisaoTotalSaldo)), color: provisaoTotalSaldo > 0 ? '#c2410c' : 'var(--sage)' },
                  { label: '% pago geral', value: `${provisaoPctGeral.toFixed(1)}%`, color: 'var(--ink)' },
                  { label: 'Lucro futuro', value: fmt(provisaoLucroFuturoTotal), color: provisaoLucroFuturoTotal >= 0 ? 'var(--sage)' : '#c2410c' },
                  { label: 'Media % lucro', value: `${provisaoMediaPctLucro.toFixed(1)}%`, color: provisaoMediaPctLucro >= 0 ? 'var(--sage)' : '#c2410c' },
                ].map((card) => (
                  <div key={card.label} style={cs.sCard}>
                    <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                      {card.label}
                    </div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.value, hidden)}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', padding: '0 4px' }}>
                Projecao baseada no ritmo medio de venda (receita liquida e pecas) desde a 1a venda de cada moto. Motos sem venda ainda ou sem preco de compra cadastrado ficam sem projecao.
              </div>

              <div style={cs.card}>
                <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Provisao por Moto</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Ordenado por: pagas primeiro, depois por dias restantes (menor pra maior).</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                      <tr>{['ID', 'Moto', 'Investido', 'Recuperado', '% pago', 'Saldo', 'Ritmo (R$/dia)', 'Dias p/ pagar', 'Previsao', 'Pecas rest.', 'Dias p/ esgotar'].map((h) => (
                        <th key={h} style={cs.th}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {provisaoCalculada.length === 0 ? (
                        <tr><td colSpan={11} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '30px 20px' }}>Sem dados no filtro</td></tr>
                      ) : provisaoCalculada.map((m: any) => {
                        const pctColor = m.jaPago ? '#16a34a' : (m.percentualPago || 0) >= 60 ? '#16a34a' : (m.percentualPago || 0) >= 25 ? '#d97706' : '#6b7280';
                        return (
                          <tr key={m.motoId}>
                            <td style={cs.td}>
                              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>#{m.motoId}</span>
                              {m.skuPrefix && (
                                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 700, color: 'var(--blue-600)', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 4, padding: '1px 5px', marginTop: 3, display: 'inline-block', letterSpacing: '0.5px' }}>
                                  {m.skuPrefix}
                                </div>
                              )}
                            </td>
                            <td style={{ ...cs.td, fontSize: 12.5 }}>{m.moto}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(m.precoCompra), hidden)}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--sage)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(m.receitaLiq), hidden)}</td>
                            <td style={cs.td}>
                              {m.percentualPago == null ? '—' : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, maxWidth: 60, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(m.percentualPago, 100)}%`, height: '100%', background: pctColor, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600, color: pctColor, minWidth: 40 }}>{m.percentualPago.toFixed(0)}%</span>
                                </div>
                              )}
                            </td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>
                              {m.jaPago ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Ja pago</span> : sensitiveText(fmt(Math.max(0, m.saldoRestante)), hidden)}
                            </td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)', ...sensitiveMaskStyle(hidden) }}>{m.receitaPorDia > 0 ? sensitiveText(fmt(m.receitaPorDia), hidden) : '—'}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>
                              {m.jaPago ? '—' : m.semVendas ? <span style={{ color: 'var(--ink-muted)' }}>Sem vendas</span> : m.semCusto ? <span style={{ color: 'var(--ink-muted)' }}>Sem custo</span> : m.diasParaPagar != null ? m.diasParaPagar : '—'}
                            </td>
                            <td style={{ ...cs.td, fontSize: 12, whiteSpace: 'nowrap' as const }}>{m.dataPayback ? m.dataPayback.toLocaleDateString('pt-BR') : '—'}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{m.qtdEstoque}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{m.diasParaEsgotar != null ? m.diasParaEsgotar : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        ) : modo === 'valor' ? (
          giroLoading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando distribuicao por valor...</div>
          ) : (
            renderTabelaFaixas(
              'valor',
              valorDistribuicao,
              valorVisao,
              valorFaixaAberta,
              setValorFaixaAberta,
              valorTotalGeral,
              'Por valor',
              'Quantidade de pecas vendidas por faixa de preco. Clique numa faixa para expandir.',
            )
          )
        ) : modo === 'giro' ? (
          giroLoading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando tempo de giro...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Tempo medio de giro', value: `${giroMediaGeral.toFixed(1)} dias`, color: 'var(--ink)' },
                  { label: 'Mediana de giro', value: `${giroMedianaGeral.toFixed(0)} dias`, color: 'var(--ink)' },
                  { label: 'Pecas analisadas', value: giroFiltrado.length.toLocaleString('pt-BR'), color: 'var(--sage)' },
                ].map((card) => (
                  <div key={card.label} style={cs.sCard}>
                    <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                      {card.label}
                    </div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {renderTabelaFaixas(
                'giro',
                giroDistribuicao,
                giroVisao,
                giroFaixaAberta,
                setGiroFaixaAberta,
                giroFiltrado.length,
                'Tempo de giro',
                'Quantidade de pecas vendidas por faixa de dias entre o cadastro e a venda. Clique numa faixa para expandir.',
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 18 }}>
                <div style={cs.card}>
                  <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Tempo de giro por Moto</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Media de dias ate a venda, por moto.</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                        <tr>{['Moto', 'Qtd. vendida', 'Media (dias)'].map((h) => <th key={h} style={cs.th}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {giroPorMoto.length === 0 ? (
                          <tr><td colSpan={3} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '30px 20px' }}>Sem dados no filtro</td></tr>
                        ) : giroPorMoto.map((m) => (
                          <tr key={m.motoId}>
                            <td style={{ ...cs.td, fontSize: 12 }}>{m.moto}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{m.qtd}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600 }}>{m.media.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={cs.card}>
                  <div style={{ padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Tempo de giro por SKU</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Top 30 SKUs por quantidade vendida no filtro.</div>
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0 }}>
                        <tr>{['SKU', 'Qtd. vendida', 'Media (dias)'].map((h) => <th key={h} style={cs.th}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {giroPorSku.length === 0 ? (
                          <tr><td colSpan={3} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '30px 20px' }}>Sem dados no filtro</td></tr>
                        ) : giroPorSku.map((s) => (
                          <tr key={s.sku}>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{s.sku}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{s.qtd}</td>
                            <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600 }}>{s.media.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : modo === 'grafico' ? (
          loading ? (
            <div style={{ ...cs.card, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <ChartPanel
                title="Painel mensal consolidado"
                subtitle="Matriz compacta com receita, volume e ticket medio ao longo do periodo."
                accent="#16a34a"
              >
                {shouldUseCompactMonthlyPanel ? (
                  monthlySummaryCards.length ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isPhone
                          ? '1fr'
                          : isTabletPortrait
                          ? 'repeat(2, minmax(0, 1fr))'
                          : 'repeat(3, minmax(0, 1fr))',
                        gap: 12,
                      }}
                    >
                      {monthlySummaryCards.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            border: `1px solid ${item.active ? 'var(--sage-mid)' : 'var(--border)'}`,
                            background: item.active ? 'var(--sage-light)' : 'var(--white)',
                            borderRadius: 12,
                            padding: isPhone ? 12 : 14,
                          }}
                        >
                          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                            {item.label}
                          </div>
                          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Receita liquida</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: item.active ? 'var(--sage)' : 'var(--gray-400)', ...sensitiveMaskStyle(hidden) }}>
                                {item.active ? sensitiveText(fmt(item.receita), hidden) : '--'}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Pecas</div>
                                <div style={{ fontSize: 12, color: 'var(--ink)', ...sensitiveMaskStyle(hidden) }}>
                                  {item.active ? sensitiveText(item.qtd.toLocaleString('pt-BR'), hidden) : '--'}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Ticket medio</div>
                                <div style={{ fontSize: 12, color: 'var(--ink)', ...sensitiveMaskStyle(hidden) }}>
                                  {item.qtd > 0 ? sensitiveText(fmt(item.ticket), hidden) : '--'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem periodos para exibir.</div>
                  )
                ) : (
                  <HeatmapChart rows={painelMensalRows} rowHeaderLabel="Indicador" normalizeByRow emptyText="Sem periodos para exibir." />
                )}
              </ChartPanel>

              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : isTabletLandscape ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 18 }}>
                <ChartPanel
                  title="Distribuicao por trimestre"
                  subtitle={filtAno ? 'Resumo trimestral do ano selecionado.' : 'Resumo trimestral considerando o filtro atual.'}
                  accent="#2563eb"
                >
                  <DonutChart items={quarterItems} totalLabel="Receita" totalDisplay={fmt(totalReceita)} valueFormatter={fmt} emptyText="Sem distribuicao trimestral." />
                </ChartPanel>
                <ChartPanel
                  title="Top periodos"
                  subtitle="Os meses com melhor resultado liquido dentro do filtro."
                  accent="#f59e0b"
                >
                  <HorizontalBarChart items={topPeriods} valueFormatter={fmt} emptyText="Sem periodos para ranquear." />
                </ChartPanel>
              </div>
            </div>
          )
        ) : (
          <div style={cs.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isCompact ? '14px 16px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Relatorio mensal</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{filtered.length} linhas no filtro</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'repeat(3, minmax(0, 1fr))' : 'repeat(12, minmax(0, 1fr))', gap: 8, padding: isCompact ? 14 : 18, borderBottom: '1px solid var(--border)' }}>
              {MESES.map((mes, index) => {
                const monthRows = filtered.filter((item) => item.mes === index + 1);
                const receita = monthRows.reduce((sum, item) => sum + Number(item.receitaLiq || item.receita || 0), 0);
                const qtd = monthRows.reduce((sum, item) => sum + Number(item.qtd || 0), 0);
                const active = monthRows.length > 0;
                return (
                  <div
                    key={mes}
                    style={{
                      background: active ? 'var(--sage-light)' : 'var(--white)',
                      border: `1px solid ${active ? 'var(--sage-mid)' : 'var(--border)'}`,
                      borderRadius: 8,
                      padding: '10px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 9, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>{mes}</div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 12, fontWeight: 600, color: active ? 'var(--sage)' : 'var(--gray-300)', ...sensitiveMaskStyle(hidden) }}>
                      {active ? sensitiveText(fmt(receita), hidden) : '--'}
                    </div>
                    {active && <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', marginTop: 2, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(`${qtd} pecas`, hidden)}</div>}
                  </div>
                );
              })}
            </div>

            {isCompact ? (
              <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                {loading ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
                ) : !filtered.length ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Sem dados</div>
                ) : filtered.map((item, index) => (
                  <div key={`${item.ano}-${item.mes}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Mes</div>
                        <div style={{ fontSize: 12 }}>{MESES_FULL[item.mes - 1]}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Ano</div>
                        <div style={{ fontSize: 12 }}>{item.ano}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Receita liquida</div>
                        <div style={{ fontSize: 13, color: 'var(--sage)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaLiq || item.receita || 0)), hidden)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Qtd. pecas</div>
                        <div style={{ fontSize: 12, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(String(item.qtd), hidden)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>{['Mes', 'Ano', 'Receita liquida', 'Qtd. pecas'].map((header) => <th key={header} style={cs.th}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Sem dados</td></tr>
                    ) : filtered.map((item, index) => (
                      <tr key={`${item.ano}-${item.mes}-${index}`}>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{MESES_FULL[item.mes - 1]}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{item.ano}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', color: 'var(--sage)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.receitaLiq || item.receita || 0)), hidden)}</td>
                        <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(String(item.qtd), hidden)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {configFaixasAberto && (
        <div
          onClick={() => setConfigFaixasAberto('')}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...cs.card, width: '100%', maxWidth: 420, padding: 20 }}
          >
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Configurar faixas de {configFaixasAberto === 'giro' ? 'dias' : 'valor'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>
              Informe os limites separados por espaco{configFaixasAberto === 'giro' ? ' (em dias)' : ' (em reais, use virgula ou ponto para centavos)'}. Ex.: {configFaixasAberto === 'giro' ? '7 15 30 60 90 180 365' : '300 600 1000 1500'}
            </div>
            <textarea
              value={configFaixasTexto}
              onChange={(e) => setConfigFaixasTexto(e.target.value)}
              rows={3}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'Geist Mono, monospace', resize: 'vertical' as const }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setConfigFaixasAberto('')}
                style={{ ...cs.sel, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarConfigFaixas}
                style={{ ...cs.sel, cursor: 'pointer', background: 'var(--ink)', color: 'var(--white)', borderColor: 'var(--ink)' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
