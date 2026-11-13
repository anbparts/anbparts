// DRE de desmonte (estrutura detalhada): receita bruta -> deducoes -> CMV (rateio das motos) -> despesas -> resultado.
//
// FORMULA DO CMV (custo das pecas vendidas):
//   1) Custo da moto      = precoCompra x (1 + F(anoCompra))
//      F(ano)             = despesas pagas da categoria "Moto" (leiloeiro, patio, guincho...) lancadas no ano
//                           / soma do precoCompra das motos compradas nesse ano   (0 se nao houver compras no ano)
//   2) Peso de cada peca  = precoML da peca (se a soma dos precoML da moto for > 0); senao 1 (divisao igual)
//   3) Custo da peca      = Custo da moto x peso da peca / soma dos pesos de TODAS as pecas da moto
//   4) CMV do mes         = soma do custo das pecas VENDIDAS no mes
//                           + insumos diretos (categoria "Insumo", pagos no mes)
//                           + perdas e quebras (tabela Prejuizo, valor + frete, no mes)
//
// calcularDre() monta a demonstracao; lancamentosDre() devolve os lancamentos que compoem cada celula
// (clique no valor, na tela). Os dois usam o mesmo carregarBase(), entao o pop-up sempre soma o valor da celula.
import { prisma } from './prisma';

const TIMEZONE = 'America/Sao_Paulo';
const n = (v: any) => Number(v) || 0;

function dateKey(date: Date | string | null | undefined) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
}
const anoDe = (d: any) => { const k = dateKey(d); return k ? Number(k.slice(0, 4)) : 0; };
const mesDe = (d: any) => { const k = dateKey(d); return k ? Number(k.slice(5, 7)) : 0; };
const hojeKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());

const semAcento = (v: any) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Categoria da despesa -> bloco do DRE. Para mudar o enquadramento, e' so editar aqui.
type Bloco = 'imposto' | 'moto' | 'insumo' | 'adm';
function blocoDaCategoria(categoria: any): Bloco {
  const c = semAcento(categoria);
  if (c === 'imposto' || c === 'impostos') return 'imposto';
  if (c === 'moto') return 'moto';
  if (c === 'insumo' || c === 'insumos') return 'insumo';
  return 'adm';
}

const zeros = () => Array.from({ length: 12 }, () => 0);
const somar = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

type PecaRow = {
  id: number; idPeca: string; descricao: string; motoId: number; precoML: any; valorFrete: any; valorTaxas: any;
  dataVenda: Date | null; disponivel: boolean; emPrejuizo: boolean; sucata: boolean; blingPedidoNum: string | null;
};

async function carregarBase(anoParam: number | null) {
  const ano = anoParam || new Date().getFullYear();

  const [pecas, despesas, prejuizos, motos] = await Promise.all([
    // "as any": os campos sucata/blingPedidoNum existem no schema, mas o client Prisma gerado localmente pode estar defasado (padrao do projeto)
    prisma.peca.findMany({
      select: { id: true, idPeca: true, descricao: true, motoId: true, precoML: true, valorFrete: true, valorTaxas: true, dataVenda: true, disponivel: true, emPrejuizo: true, sucata: true, blingPedidoNum: true } as any,
    }) as unknown as Promise<PecaRow[]>,
    prisma.despesa.findMany({ select: { id: true, detalhes: true, valor: true, categoria: true, statusPagamento: true, data: true } }),
    prisma.prejuizo.findMany({ select: { id: true, detalhe: true, motivo: true, valor: true, frete: true, data: true } }),
    prisma.moto.findMany({ select: { id: true, marca: true, modelo: true, ano: true, placa: true, precoCompra: true, dataCompra: true } }),
  ]);

  const hoje = hojeKey();
  const despesasPagas = despesas.filter((d) => d.statusPagamento === 'pago' && dateKey(d.data) && dateKey(d.data) <= hoje);

  // ---- F(ano): custos agregados de aquisicao proporcionais ao valor de compra ----
  const agregadoPorAno: Record<number, number> = {};
  for (const d of despesasPagas) {
    if (blocoDaCategoria(d.categoria) !== 'moto') continue;
    const y = anoDe(d.data);
    if (y) agregadoPorAno[y] = (agregadoPorAno[y] || 0) + n(d.valor);
  }
  const compraPorAno: Record<number, number> = {};
  for (const m of motos) {
    const y = anoDe(m.dataCompra);
    if (y) compraPorAno[y] = (compraPorAno[y] || 0) + n(m.precoCompra);
  }
  const fatorAno = (y: number) => (y && compraPorAno[y] > 0 ? (agregadoPorAno[y] || 0) / compraPorAno[y] : 0);

  // ---- rateio por peca ----
  const pecasPorMoto = new Map<number, PecaRow[]>();
  for (const p of pecas) {
    const lista = pecasPorMoto.get(p.motoId);
    if (lista) lista.push(p); else pecasPorMoto.set(p.motoId, [p]);
  }

  const motoDesc = new Map<number, string>();
  const custoPecaVendida = new Map<number, number>(); // id da peca -> custo rateado (so pecas vendidas no ano)
  const cmvPecasMes = zeros();
  const detalhe: any[] = [];
  let motosSemCusto = 0;
  let pecasVendidasSemPreco = 0;

  for (const m of motos) {
    motoDesc.set(m.id, [m.marca, m.modelo, m.ano].filter(Boolean).join(' ') + (m.placa ? ` · ${m.placa}` : ''));
    const lista = pecasPorMoto.get(m.id) || [];
    if (!lista.length) continue;
    const F = fatorAno(anoDe(m.dataCompra));
    const custoCompra = n(m.precoCompra);
    const custoTotal = custoCompra * (1 + F);
    const somaPreco = lista.reduce((s, p) => s + n(p.precoML), 0);
    const peso = (p: PecaRow) => (somaPreco > 0 ? n(p.precoML) : 1);
    const somaPesos = lista.reduce((s, p) => s + peso(p), 0) || 1;

    let vendidasAno = 0;
    let receitaAno = 0;
    let cmvAno = 0;
    for (const p of lista) {
      const vendida = !p.disponivel && !p.emPrejuizo && !!p.dataVenda;
      if (!vendida || anoDe(p.dataVenda) !== ano) continue;
      const custoPeca = custoTotal * (peso(p) / somaPesos);
      custoPecaVendida.set(p.id, custoPeca);
      const mes = mesDe(p.dataVenda);
      if (mes >= 1 && mes <= 12) cmvPecasMes[mes - 1] += custoPeca;
      vendidasAno += 1;
      receitaAno += n(p.precoML);
      cmvAno += custoPeca;
      if (n(p.precoML) <= 0) pecasVendidasSemPreco += 1;
    }
    if (vendidasAno > 0) {
      if (custoCompra <= 0) motosSemCusto += 1;
      detalhe.push({
        motoId: m.id,
        moto: motoDesc.get(m.id),
        custoCompra: r2(custoCompra),
        fatorAgregado: Number(F.toFixed(4)),
        custoTotal: r2(custoTotal),
        pecasTotal: lista.length,
        pecasVendidasAno: vendidasAno,
        receitaVendidaAno: r2(receitaAno),
        cmvAno: r2(cmvAno),
        margemPct: receitaAno > 0 ? Number((((receitaAno - cmvAno) / receitaAno) * 100).toFixed(1)) : null,
      });
    }
  }
  detalhe.sort((a, b) => b.cmvAno - a.cmvAno);

  const pecasVendidasAno = pecas.filter((p) => !p.disponivel && !p.emPrejuizo && !!p.dataVenda && anoDe(p.dataVenda) === ano);

  return {
    ano, pecas, despesas, prejuizos, motos, despesasPagas, pecasVendidasAno,
    agregadoPorAno, compraPorAno, fatorAno, motoDesc, custoPecaVendida, cmvPecasMes, detalhe, motosSemCusto, pecasVendidasSemPreco,
  };
}

export async function calcularDre(anoParam: number | null) {
  const b = await carregarBase(anoParam);
  const { ano } = b;

  // ---- receitas e custos mensais ----
  const receitaPecas = zeros();
  const receitaSucata = zeros();
  const comissoes = zeros();
  const frete = zeros();
  const qtdVendidas = zeros();
  for (const p of b.pecasVendidasAno) {
    const i = mesDe(p.dataVenda) - 1;
    if (i < 0 || i > 11) continue;
    if (p.sucata) receitaSucata[i] += n(p.precoML); else receitaPecas[i] += n(p.precoML);
    comissoes[i] += n(p.valorTaxas);
    frete[i] += n(p.valorFrete);
    qtdVendidas[i] += 1;
  }

  const impostos = zeros();
  const insumos = zeros();
  const admPorCateg = new Map<string, number[]>();
  for (const d of b.despesasPagas) {
    if (anoDe(d.data) !== ano) continue;
    const i = mesDe(d.data) - 1;
    if (i < 0 || i > 11) continue;
    const bloco = blocoDaCategoria(d.categoria);
    if (bloco === 'imposto') impostos[i] += n(d.valor);
    else if (bloco === 'insumo') insumos[i] += n(d.valor);
    else if (bloco === 'adm') {
      const nome = String(d.categoria || 'Outros').trim() || 'Outros';
      if (!admPorCateg.has(nome)) admPorCateg.set(nome, zeros());
      admPorCateg.get(nome)![i] += n(d.valor);
    }
    // bloco 'moto' ja entra no CMV via fator F (nao entra aqui para nao contar duas vezes)
  }

  const perdas = zeros();
  for (const p of b.prejuizos) {
    if (anoDe(p.data) !== ano) continue;
    const i = mesDe(p.data) - 1;
    if (i >= 0 && i <= 11) perdas[i] += n(p.valor) + n(p.frete);
  }

  const admLinhas = Array.from(admPorCateg.entries())
    .map(([categoria, valores]) => ({ categoria, valores: valores.map(r2), total: r2(somar(valores)) }))
    .filter((l) => l.total !== 0)
    .sort((a, b2) => b2.total - a.total);

  // ---- totais por mes ----
  const montar = (i: number) => {
    const rbruta = receitaPecas[i] + receitaSucata[i];
    const receitaLiquida = rbruta - impostos[i];
    const cmv = b.cmvPecasMes[i] + insumos[i] + perdas[i];
    const lucroBruto = receitaLiquida - cmv;
    const despComercial = comissoes[i] + frete[i];
    const despAdm = admLinhas.reduce((s, l) => s + (l.valores[i] || 0), 0);
    const despesasOp = despComercial + despAdm;
    const ebit = lucroBruto - despesasOp;
    return {
      receitaPecas: receitaPecas[i], receitaSucata: receitaSucata[i], receitaBruta: rbruta,
      impostos: impostos[i], receitaLiquida,
      cmvPecas: b.cmvPecasMes[i], insumos: insumos[i], perdas: perdas[i], cmv, lucroBruto,
      comissoes: comissoes[i], frete: frete[i], despComercial, despAdm, despesasOp,
      ebit, lucroLiquido: ebit, qtdVendidas: qtdVendidas[i],
    };
  };
  const meses = Array.from({ length: 12 }, (_, i) => montar(i));
  const chaves = Object.keys(meses[0]) as (keyof ReturnType<typeof montar>)[];
  const total: any = {};
  for (const k of chaves) total[k] = meses.reduce((s, m) => s + (m[k] as number), 0);
  const arred = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'qtdVendidas' ? v : r2(v as number)]));

  const anosDisponiveis = Array.from(new Set([
    ...b.pecas.map((p) => anoDe(p.dataVenda)),
    ...b.despesas.map((d) => anoDe(d.data)),
    ...b.prejuizos.map((p) => anoDe(p.data)),
    ...b.motos.map((m) => anoDe(m.dataCompra)),
  ].filter(Boolean) as number[])).sort((a, b2) => b2 - a);

  return {
    ano,
    anosDisponiveis,
    meses: meses.map(arred),
    total: arred(total),
    admLinhas,
    cmvDetalhe: b.detalhe,
    premissas: {
      fatorAgregadoPorAno: Object.keys(b.compraPorAno).map((y) => ({
        ano: Number(y),
        comprasMotos: r2(b.compraPorAno[Number(y)]),
        custosAgregados: r2(b.agregadoPorAno[Number(y)] || 0),
        fator: Number(b.fatorAno(Number(y)).toFixed(4)),
      })).sort((a, b2) => b2.ano - a.ano),
      motosSemCusto: b.motosSemCusto,
      pecasVendidasSemPreco: b.pecasVendidasSemPreco,
    },
  };
}

// ---- lancamentos que compoem cada linha do DRE (pop-up ao clicar no valor) ----
type Coluna = { k: string; rotulo: string; tipo: 'texto' | 'moeda' | 'data' };
type Tabela = { titulo?: string; colunas: Coluna[]; itens: Record<string, any>[]; total: number | null };

const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function lancamentosDre(anoParam: number | null, mesParam: number, linha: string) {
  const b = await carregarBase(anoParam);
  const { ano } = b;
  const mes = mesParam >= 1 && mesParam <= 12 ? mesParam : 0; // 0 = ano inteiro
  const noPeriodo = (d: any) => anoDe(d) === ano && (!mes || mesDe(d) === mes);
  const periodo = mes ? `${MES_NOME[mes - 1]} de ${ano}` : `ano de ${ano}`;
  const porData = (a: any, c: any) => String(a.data).localeCompare(String(c.data)) || (c.valor || 0) - (a.valor || 0);

  const vendidas = b.pecasVendidasAno.filter((p) => noPeriodo(p.dataVenda));
  const despesasDo = (filtro: (d: any) => boolean) => b.despesasPagas.filter((d) => noPeriodo(d.data) && filtro(d));

  const colsPeca: Coluna[] = [
    { k: 'data', rotulo: 'Data', tipo: 'data' },
    { k: 'sku', rotulo: 'SKU', tipo: 'texto' },
    { k: 'descricao', rotulo: 'Peça', tipo: 'texto' },
    { k: 'moto', rotulo: 'Moto', tipo: 'texto' },
    { k: 'pedido', rotulo: 'Pedido', tipo: 'texto' },
  ];
  const itemPeca = (p: PecaRow) => ({
    data: dateKey(p.dataVenda), sku: p.idPeca, descricao: p.descricao, moto: b.motoDesc.get(p.motoId) || '', pedido: p.blingPedidoNum || '',
  });
  const tabelaDespesas = (titulo: string, lista: any[]): Tabela => ({
    titulo,
    colunas: [
      { k: 'data', rotulo: 'Data', tipo: 'data' },
      { k: 'detalhes', rotulo: 'Detalhes', tipo: 'texto' },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { k: 'valor', rotulo: 'Valor', tipo: 'moeda' },
    ],
    itens: lista.map((d) => ({ data: dateKey(d.data), detalhes: d.detalhes, categoria: d.categoria, valor: r2(n(d.valor)) })).sort(porData),
    total: r2(lista.reduce((s, d) => s + n(d.valor), 0)),
  });

  let titulo = '';
  const tabelas: Tabela[] = [];
  const notas: string[] = [];

  if (linha === 'receitaBruta' || linha === 'receitaPecas' || linha === 'receitaSucata') {
    const lista = vendidas.filter((p) => (linha === 'receitaBruta' ? true : linha === 'receitaSucata' ? p.sucata : !p.sucata));
    titulo = linha === 'receitaSucata' ? 'Venda de sucata / carcaça' : linha === 'receitaPecas' ? 'Venda de peças' : 'Receita operacional bruta';
    tabelas.push({
      colunas: [...colsPeca, { k: 'valor', rotulo: 'Valor de venda', tipo: 'moeda' }],
      itens: lista.map((p) => ({ ...itemPeca(p), valor: r2(n(p.precoML)) })).sort(porData),
      total: r2(lista.reduce((s, p) => s + n(p.precoML), 0)),
    });
  } else if (linha === 'impostos') {
    titulo = 'Impostos sobre vendas (DAS)';
    tabelas.push(tabelaDespesas('', despesasDo((d) => blocoDaCategoria(d.categoria) === 'imposto')));
  } else if (linha === 'insumos') {
    titulo = 'Insumos diretos de desmonte e legalização';
    tabelas.push(tabelaDespesas('', despesasDo((d) => blocoDaCategoria(d.categoria) === 'insumo')));
  } else if (linha === 'cmvPecas') {
    titulo = 'Custo das peças vendidas (rateio das motos)';
    tabelas.push({
      colunas: [...colsPeca, { k: 'preco', rotulo: 'Preço de venda', tipo: 'moeda' }, { k: 'valor', rotulo: 'Custo rateado', tipo: 'moeda' }],
      itens: vendidas.map((p) => ({ ...itemPeca(p), preco: r2(n(p.precoML)), valor: r2(b.custoPecaVendida.get(p.id) || 0) })).sort(porData),
      total: r2(vendidas.reduce((s, p) => s + (b.custoPecaVendida.get(p.id) || 0), 0)),
    });
    const fatorAnoAtual = b.fatorAno(ano);
    notas.push('Custo da peça = (preço de compra da moto + custos agregados) × preço da peça ÷ soma dos preços das peças da moto.');
    notas.push(`Custos agregados de ${ano}: despesas da categoria “Moto” ÷ compras de motos no ano = +${(fatorAnoAtual * 100).toFixed(1)}% sobre o preço de compra. As despesas abaixo compõem esse fator.`);
    tabelas.push(tabelaDespesas(`Custos de aquisição (categoria Moto) pagos em ${ano}`, b.despesasPagas.filter((d) => anoDe(d.data) === ano && blocoDaCategoria(d.categoria) === 'moto')));
  } else if (linha === 'perdas') {
    titulo = 'Perdas e quebras de estoque';
    const lista = b.prejuizos.filter((p) => noPeriodo(p.data));
    tabelas.push({
      colunas: [
        { k: 'data', rotulo: 'Data', tipo: 'data' },
        { k: 'detalhe', rotulo: 'Detalhe', tipo: 'texto' },
        { k: 'motivo', rotulo: 'Motivo', tipo: 'texto' },
        { k: 'frete', rotulo: 'Frete', tipo: 'moeda' },
        { k: 'valor', rotulo: 'Total', tipo: 'moeda' },
      ],
      itens: lista.map((p) => ({ data: dateKey(p.data), detalhe: p.detalhe, motivo: p.motivo || '', frete: r2(n(p.frete)), valor: r2(n(p.valor) + n(p.frete)) })).sort(porData),
      total: r2(lista.reduce((s, p) => s + n(p.valor) + n(p.frete), 0)),
    });
  } else if (linha === 'comissoes' || linha === 'frete') {
    const campo = linha === 'comissoes' ? 'valorTaxas' : 'valorFrete';
    titulo = linha === 'comissoes' ? 'Comissões de marketplaces' : 'Fretes de envio';
    const lista = vendidas.filter((p) => n((p as any)[campo]) !== 0);
    tabelas.push({
      colunas: [...colsPeca, { k: 'valor', rotulo: linha === 'comissoes' ? 'Comissão / taxas' : 'Frete', tipo: 'moeda' }],
      itens: lista.map((p) => ({ ...itemPeca(p), valor: r2(n((p as any)[campo])) })).sort(porData),
      total: r2(lista.reduce((s, p) => s + n((p as any)[campo]), 0)),
    });
  } else if (linha.startsWith('adm:')) {
    const categoria = linha.slice(4);
    titulo = `Despesas administrativas · ${categoria}`;
    tabelas.push(tabelaDespesas('', despesasDo((d) => blocoDaCategoria(d.categoria) === 'adm' && (String(d.categoria || 'Outros').trim() || 'Outros') === categoria)));
  } else {
    return null;
  }

  return { ok: true, linha, titulo, periodo, ano, mes, tabelas, notas };
}
