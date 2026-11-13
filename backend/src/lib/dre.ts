// DRE de desmonte (estrutura detalhada): receita bruta -> deducoes -> CMV (rateio das motos) -> despesas -> resultado.
//
// FORMULA DO CMV (custo das pecas vendidas):
//   Custo da peca = (valor de venda bruto da peca / soma do valor de venda bruto de TODAS as pecas da moto) x valor pago na moto
//   - valor pago na moto = precoCompra (cadastro da moto); a soma considera TODAS as pecas da moto (vendidas ou em estoque)
//   - se nenhuma peca da moto tem preco, divide igual entre as pecas
//   CMV do mes = soma do custo das pecas VENDIDAS no mes
//                           + custos de aquisicao das motos (grupo cmv_aquisicao: leilao, patio, guincho; pagos no mes)
//                           + insumos diretos (categoria "Insumo", pagos no mes)
//                           + perdas e quebras (tabela Prejuizo, valor + frete, no mes)
//
// calcularDre() monta a demonstracao; lancamentosDre() devolve os lancamentos que compoem cada celula
// (clique no valor, na tela). Os dois usam o mesmo carregarBase(), entao o pop-up sempre soma o valor da celula.
import { prisma } from './prisma';
import { mapaCategoriasDespesa, semAcento, type GrupoDespesa, type TipoCusto } from './despesa-categorias';
import { ativosParaDre, depreciacaoAcumuladaAte, planoDepreciacao } from '../routes/ativos';

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

// Cada categoria de despesa tem um grupo do DRE e um tipo (fixa/variavel), cadastrados em lib/despesa-categorias.ts
// (editaveis na tela de Despesas). Categorias sem cadastro caem em administrativa/variavel.
type InfoCategoria = { nome: string; grupo: GrupoDespesa; tipo: TipoCusto };
// Comissoes de marketplaces e fretes de envio ja vem das proprias vendas (taxas/frete do pedido): despesas lancadas
// nessas duas categorias se somam as mesmas linhas do DRE, em vez de criar linha duplicada.
const MESCLADAS: Record<string, 'comissoes' | 'frete'> = { 'comissoes de marketplaces': 'comissoes', 'fretes de envio': 'frete' };

const zeros = () => Array.from({ length: 12 }, () => 0);

// Depreciacao de um ativo reconhecida em um mes (despesa administrativa e de estrutura, fixa): variacao da depreciacao
// acumulada entre o fim do mes anterior e o fim do mes (limitado a hoje; meses futuros ficam zerados).
function depreciacaoDoMes(a: any, ano: number, mes: number) {
  const hoje = hojeKey();
  const fimDe = (m: number) => { const d = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10); return d < hoje ? d : hoje; };
  return Math.max(0, depreciacaoAcumuladaAte(a, fimDe(mes)) - depreciacaoAcumuladaAte(a, fimDe(mes - 1)));
}
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

  const catalogo = await mapaCategoriasDespesa();
  const infoDe = (categoria: any): InfoCategoria => {
    const c = catalogo.get(semAcento(categoria));
    return c ? { nome: c.nome, grupo: c.grupo, tipo: c.tipo } : { nome: String(categoria || 'Outros').trim() || 'Outros', grupo: 'adm', tipo: 'variavel' };
  };

  const hoje = hojeKey();
  const despesasPagas = despesas.filter((d) => d.statusPagamento === 'pago' && dateKey(d.data) && dateKey(d.data) <= hoje);

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
    const custoCompra = n(m.precoCompra);
    const custoTotal = custoCompra; // valor pago na moto
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
    ano, pecas, despesas, prejuizos, motos, despesasPagas, pecasVendidasAno, infoDe,
    motoDesc, custoPecaVendida, cmvPecasMes, detalhe, motosSemCusto, pecasVendidasSemPreco,
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
  const aquisicao = zeros();
  // categorias das despesas operacionais (adm / pessoal / comercial), uma linha por categoria
  const porCateg = new Map<string, { info: InfoCategoria; valores: number[] }>();
  for (const d of b.despesasPagas) {
    if (anoDe(d.data) !== ano) continue;
    const i = mesDe(d.data) - 1;
    if (i < 0 || i > 11) continue;
    const info = b.infoDe(d.categoria);
    const valor = n(d.valor);
    if (info.grupo === 'deducao') impostos[i] += valor;
    else if (info.grupo === 'cmv_insumo') insumos[i] += valor;
    else if (info.grupo === 'cmv_aquisicao') aquisicao[i] += valor;
    else {
      const mesclada = MESCLADAS[semAcento(info.nome)];
      if (mesclada === 'comissoes') { comissoes[i] += valor; continue; }
      if (mesclada === 'frete') { frete[i] += valor; continue; }
      if (!porCateg.has(info.nome)) porCateg.set(info.nome, { info, valores: zeros() });
      porCateg.get(info.nome)!.valores[i] += valor;
    }
  }

  const perdas = zeros();
  for (const p of b.prejuizos) {
    if (anoDe(p.data) !== ano) continue;
    const i = mesDe(p.data) - 1;
    if (i >= 0 && i <= 11) perdas[i] += n(p.valor) + n(p.frete);
  }

  // depreciacao dos ativos (aba Estrutura da Empresa): despesa administrativa e de estrutura, fixa
  const ativosDep = await ativosParaDre();
  const depreciacao = zeros();
  for (const a of ativosDep) for (let m = 1; m <= 12; m++) depreciacao[m - 1] += depreciacaoDoMes(a, ano, m);

  const catLinhas = Array.from(porCateg.values())
    .map(({ info, valores }) => ({ categoria: info.nome, grupo: info.grupo, tipo: info.tipo, valores: valores.map(r2), total: r2(somar(valores)) }))
    .filter((l) => l.total !== 0)
    .sort((a, b2) => b2.total - a.total);
  const somaCats = (i: number, filtro: (l: (typeof catLinhas)[number]) => boolean) => catLinhas.filter(filtro).reduce((s, l) => s + (l.valores[i] || 0), 0);

  // ---- totais por mes ----
  const montar = (i: number) => {
    const rbruta = receitaPecas[i] + receitaSucata[i];
    const receitaLiquida = rbruta - impostos[i];
    const cmv = b.cmvPecasMes[i] + aquisicao[i] + insumos[i] + perdas[i];
    const lucroBruto = receitaLiquida - cmv;
    const despComercial = comissoes[i] + frete[i] + somaCats(i, (l) => l.grupo === 'comercial');
    const despAdm = somaCats(i, (l) => l.grupo === 'adm') + depreciacao[i];
    const despPessoal = somaCats(i, (l) => l.grupo === 'pessoal');
    const despesasOp = despComercial + despAdm + despPessoal;
    // fixa x variavel (comissoes e fretes vindos das vendas sao sempre variaveis)
    const despFixas = somaCats(i, (l) => l.tipo === 'fixa') + depreciacao[i];
    const despVariaveis = despesasOp - despFixas;
    const ebit = lucroBruto - despesasOp;
    return {
      receitaPecas: receitaPecas[i], receitaSucata: receitaSucata[i], receitaBruta: rbruta,
      impostos: impostos[i], receitaLiquida,
      cmvPecas: b.cmvPecasMes[i], aquisicao: aquisicao[i], insumos: insumos[i], perdas: perdas[i], cmv, lucroBruto,
      comissoes: comissoes[i], frete: frete[i], despComercial, despAdm, depreciacao: depreciacao[i], despPessoal, despesasOp,
      despFixas, despVariaveis, margemContribuicao: receitaLiquida - cmv - despVariaveis,
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
    catLinhas,
    cmvDetalhe: b.detalhe,
    premissas: {
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
    tabelas.push(tabelaDespesas('', despesasDo((d) => b.infoDe(d.categoria).grupo === 'deducao')));
  } else if (linha === 'aquisicao') {
    titulo = 'Custos de aquisição das motos (leilão, pátio, guincho)';
    tabelas.push(tabelaDespesas('', despesasDo((d) => b.infoDe(d.categoria).grupo === 'cmv_aquisicao')));
    notas.push('Custos pagos além do valor da moto. Não entram no rateio por peça: são reconhecidos no mês em que foram pagos.');
  } else if (linha === 'depreciacao') {
    titulo = 'Depreciação de ativos (Estrutura)';
    const ativosDep = await ativosParaDre();
    const meses = mes ? [mes] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const itens = ativosDep
      .map((a) => {
        const p = planoDepreciacao(a as any);
        return {
          codigo: a.codigo, ativo: a.nome,
          valorAtivo: r2(a.valor),
          taxa: p.anos > 0 ? `${(100 / p.anos).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a. · ${p.anos.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} anos` : '',
          valor: r2(meses.reduce((s, m) => s + depreciacaoDoMes(a, ano, m), 0)),
        };
      })
      .filter((x) => x.valor !== 0);
    tabelas.push({
      colunas: [
        { k: 'codigo', rotulo: 'Código', tipo: 'texto' },
        { k: 'ativo', rotulo: 'Ativo', tipo: 'texto' },
        { k: 'valorAtivo', rotulo: 'Valor do ativo', tipo: 'moeda' },
        { k: 'taxa', rotulo: 'Taxa / vida útil', tipo: 'texto' },
        { k: 'valor', rotulo: 'Depreciação no período', tipo: 'moeda' },
      ],
      itens,
      total: r2(itens.reduce((s, x) => s + x.valor, 0)),
    });
    notas.push('Depreciação linear mensal = (valor − residual) ÷ (vida útil × 12), cadastrada em Empresa > Estrutura. O mês de início conta como o 1º mês; ativos baixados deixam de depreciar na data da baixa.');
  } else if (linha === 'insumos') {
    titulo = 'Insumos diretos de desmonte e legalização';
    tabelas.push(tabelaDespesas('', despesasDo((d) => b.infoDe(d.categoria).grupo === 'cmv_insumo')));
  } else if (linha === 'cmvPecas') {
    titulo = 'Custo das peças vendidas (rateio das motos)';
    tabelas.push({
      colunas: [...colsPeca, { k: 'preco', rotulo: 'Preço de venda', tipo: 'moeda' }, { k: 'valor', rotulo: 'Custo rateado', tipo: 'moeda' }],
      itens: vendidas.map((p) => ({ ...itemPeca(p), preco: r2(n(p.precoML)), valor: r2(b.custoPecaVendida.get(p.id) || 0) })).sort(porData),
      total: r2(vendidas.reduce((s, p) => s + (b.custoPecaVendida.get(p.id) || 0), 0)),
    });
    notas.push('Custo da peça = (valor de venda da peça ÷ soma do valor de venda de todas as peças da moto) × valor pago na moto.');
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
    const nomeCat = linha === 'comissoes' ? 'comissoes de marketplaces' : 'fretes de envio';
    const lancadas = despesasDo((d) => semAcento(b.infoDe(d.categoria).nome) === nomeCat);
    if (lancadas.length) {
      tabelas.push(tabelaDespesas('Lançado em Despesas (somado à mesma linha do DRE)', lancadas));
      notas.push('O valor da linha no DRE é a soma das duas tabelas: o que veio das vendas mais o que foi lançado manualmente em Despesas.');
    }
  } else if (linha.startsWith('cat:')) {
    const categoria = linha.slice(4);
    titulo = `Despesas · ${categoria}`;
    tabelas.push(tabelaDespesas('', despesasDo((d) => b.infoDe(d.categoria).nome === categoria)));
  } else {
    return null;
  }

  return { ok: true, linha, titulo, periodo, ano, mes, tabelas, notas };
}
