// Despesas x Receita (FLUXO DE CAIXA), conforme especificacao do Nelson:
//   Receita  = todas as fontes de entrada financeira (vendas de pecas, incluindo sucata), independente de categoria.
//   Despesas = todos os gastos efetuados:
//                - despesas pagas (qualquer categoria, inclusive Moto e investimento em ativos), no mes do pagamento;
//                - comissoes e fretes dos pedidos (descontados pelos marketplaces nas vendas);
//                - compras de motos e de ativos que NAO estao lancadas em Despesas, no mes da compra.
//   Saldo    = Receita - Despesas; visao do ano escolhido (12 meses) com saldo acumulado.
// Compra de moto/ativo "ja lancada em Despesas": ativo ligado a uma despesa (aba Estrutura) ou despesa paga com o
// mesmo valor no mesmo mes (um-pra-um) — nesse caso conta so a despesa, para nao contar duas vezes.
// calcularFluxoCaixa() monta o consolidado; lancamentosFluxo() devolve os registros de um mes (clique no mes).
import { prisma } from './prisma';
import { listarAtivosComVinculos } from '../routes/ativos';
import { getSaldoMercadoPagoPersistido } from '../routes/mercado-livre';

// PREVISTO (lancamentos futuros, pedido do Nelson): ficam separados do realizado.
//   Despesas futuras  = despesas NAO pagas (pendentes e recorrentes ja geradas), pelo vencimento; as vencidas e ainda nao pagas caem no mes atual.
//   Recebiveis futuros = saldo "a liberar" do Mercado Pago (persistido pelo job diario), lancado no mes atual.

const TIMEZONE = 'America/Sao_Paulo';
const n = (v: any) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const zeros = () => Array.from({ length: 12 }, () => 0);

function dateKey(date: Date | string | null | undefined) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
}
const anoDe = (d: any) => { const k = dateKey(d); return k ? Number(k.slice(0, 4)) : 0; };
const mesDe = (d: any) => { const k = dateKey(d); return k ? Number(k.slice(5, 7)) : 0; };
const hojeKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const mesKey = (d: any) => dateKey(d).slice(0, 7);
const valorKey = (d: any, valor: number) => `${mesKey(d)}::${valor.toFixed(2)}`;

type PecaRow = {
  id: number; idPeca: string; descricao: string; motoId: number; precoML: any; valorFrete: any; valorTaxas: any;
  dataVenda: Date | null; disponivel: boolean; emPrejuizo: boolean; blingPedidoNum: string | null;
};

async function carregarBase() {
  const [pecas, despesas, motos, ativos] = await Promise.all([
    // "as any": blingPedidoNum existe no schema, mas o client Prisma gerado localmente pode estar defasado (padrao do projeto)
    prisma.peca.findMany({
      select: { id: true, idPeca: true, descricao: true, motoId: true, precoML: true, valorFrete: true, valorTaxas: true, dataVenda: true, disponivel: true, emPrejuizo: true, blingPedidoNum: true } as any,
    }) as unknown as Promise<PecaRow[]>,
    prisma.despesa.findMany({ select: { id: true, detalhes: true, valor: true, categoria: true, statusPagamento: true, data: true, dataPagamento: true } }),
    prisma.moto.findMany({ select: { id: true, marca: true, modelo: true, ano: true, placa: true, precoCompra: true, dataCompra: true } }),
    listarAtivosComVinculos(),
  ]);

  const hoje = hojeKey();
  const motoDesc = new Map<number, string>();
  for (const m of motos) motoDesc.set(m.id, [m.marca, m.modelo, m.ano].filter(Boolean).join(' ') + (m.placa ? ` · ${m.placa}` : ''));

  const vendidas = pecas.filter((p) => !p.disponivel && !p.emPrejuizo && !!p.dataVenda && dateKey(p.dataVenda) <= hoje);

  // despesas pagas (gasto efetuado): data efetiva = data do pagamento, ou a data da despesa quando nao ha pagamento registrado
  const dataEfetiva = (d: any) => dateKey(d.dataPagamento) || dateKey(d.data);
  const despesasPagas = despesas
    .filter((d) => d.statusPagamento === 'pago' && dataEfetiva(d) && dataEfetiva(d) <= hoje)
    .map((d) => ({ ...d, dataEfetiva: dataEfetiva(d) }));

  // despesas disponiveis para "cobrir" compras de moto/ativo (mesmo valor, mesmo mes, uma por compra)
  const ativosLigados = new Set<number>();
  for (const a of ativos) if (a.despesa) ativosLigados.add(a.despesa.id);
  const pool = new Map<string, number[]>();
  for (const d of despesasPagas) {
    if (ativosLigados.has(d.id) || n(d.valor) <= 0) continue;
    const k = valorKey(d.dataEfetiva, n(d.valor));
    const lista = pool.get(k);
    if (lista) lista.push(d.id); else pool.set(k, [d.id]);
  }
  const cobrirPorDespesa = (data: string, valor: number) => {
    const lista = pool.get(valorKey(data, valor));
    if (lista && lista.length) { lista.shift(); return true; }
    return false;
  };

  const ativosFora: { data: string; codigo: string; nome: string; valor: number }[] = [];
  for (const a of ativos) {
    if (!(a.valor > 0) || !a.dataAquisicao || a.dataAquisicao > hoje) continue;
    if (a.despesa) continue; // a despesa ligada ao ativo ja entra em "despesas pagas"
    if (cobrirPorDespesa(a.dataAquisicao, a.valor)) continue;
    ativosFora.push({ data: a.dataAquisicao, codigo: a.codigo, nome: a.nome, valor: a.valor });
  }

  const motosFora: { data: string; moto: string; valor: number }[] = [];
  for (const m of motos) {
    const data = dateKey(m.dataCompra);
    const valor = n(m.precoCompra);
    if (!(valor > 0) || !data || data > hoje) continue;
    if (cobrirPorDespesa(data, valor)) continue;
    motosFora.push({ data, moto: motoDesc.get(m.id) || '', valor });
  }

  // previsto: despesas ainda nao pagas (vencidas contam no mes atual) + saldo a liberar do Mercado Pago (mes atual)
  const despesasPrevistas = despesas
    .filter((d) => d.statusPagamento !== 'pago' && dateKey(d.data) && n(d.valor) > 0)
    .map((d) => ({ id: d.id, detalhes: d.detalhes, categoria: d.categoria, valor: n(d.valor), vencimento: dateKey(d.data), dataPrevista: dateKey(d.data) > hoje ? dateKey(d.data) : hoje }));
  let recebivelMP = { valor: 0, atualizadoEm: '' };
  try {
    const mp = await getSaldoMercadoPagoPersistido();
    const v = n(mp?.resumo?.saldoALiberar);
    if (v > 0) recebivelMP = { valor: v, atualizadoEm: mp?.atualizadoEm ? new Date(mp.atualizadoEm).toISOString() : '' };
  } catch { /* sem saldo persistido: sem recebivel previsto */ }

  return { pecas, vendidas, despesas, despesasPagas, motos, ativos, motoDesc, motosFora, ativosFora, despesasPrevistas, recebivelMP, hoje };
}

export async function calcularFluxoCaixa(anoParam: number | null) {
  const b = await carregarBase();
  const ano = anoParam || new Date().getFullYear();

  const receita = zeros();
  const comissoes = zeros();
  const frete = zeros();
  const qtdVendas = zeros();
  for (const p of b.vendidas) {
    if (anoDe(p.dataVenda) !== ano) continue;
    const i = mesDe(p.dataVenda) - 1;
    receita[i] += n(p.precoML);
    comissoes[i] += n(p.valorTaxas);
    frete[i] += n(p.valorFrete);
    qtdVendas[i] += 1;
  }

  const despLancadas = zeros();
  for (const d of b.despesasPagas) {
    if (anoDe(d.dataEfetiva) !== ano) continue;
    despLancadas[mesDe(d.dataEfetiva) - 1] += n(d.valor);
  }
  const motos = zeros();
  for (const m of b.motosFora) if (anoDe(m.data) === ano) motos[mesDe(m.data) - 1] += m.valor;
  const ativos = zeros();
  for (const a of b.ativosFora) if (anoDe(a.data) === ano) ativos[mesDe(a.data) - 1] += a.valor;

  const despPrevista = zeros();
  for (const d of b.despesasPrevistas) if (anoDe(d.dataPrevista) === ano) despPrevista[mesDe(d.dataPrevista) - 1] += d.valor;
  const recPrevista = zeros();
  if (b.recebivelMP.valor > 0 && anoDe(b.hoje) === ano) recPrevista[mesDe(b.hoje) - 1] += b.recebivelMP.valor;

  let acumulado = 0;
  let acumuladoProj = 0;
  const meses = Array.from({ length: 12 }, (_, i) => {
    const despesas = despLancadas[i] + comissoes[i] + frete[i] + motos[i] + ativos[i];
    const saldo = receita[i] - despesas;
    acumulado += saldo;
    const saldoProjetado = saldo + recPrevista[i] - despPrevista[i];
    acumuladoProj += saldoProjetado;
    return {
      recPrevista: r2(recPrevista[i]),
      despPrevista: r2(despPrevista[i]),
      receitaProjetada: r2(receita[i] + recPrevista[i]),
      despesasProjetadas: r2(despesas + despPrevista[i]),
      saldoProjetado: r2(saldoProjetado),
      acumuladoProjetado: r2(acumuladoProj),
      mes: i + 1,
      receita: r2(receita[i]),
      despLancadas: r2(despLancadas[i]),
      comissoes: r2(comissoes[i]),
      frete: r2(frete[i]),
      motos: r2(motos[i]),
      ativos: r2(ativos[i]),
      despesas: r2(despesas),
      saldo: r2(saldo),
      acumulado: r2(acumulado),
      qtdVendas: qtdVendas[i],
    };
  });
  const soma = (k: 'receita' | 'despLancadas' | 'comissoes' | 'frete' | 'motos' | 'ativos' | 'despesas' | 'saldo') => r2(meses.reduce((s, m) => s + m[k], 0));
  const total = {
    receita: soma('receita'), despLancadas: soma('despLancadas'), comissoes: soma('comissoes'), frete: soma('frete'),
    motos: soma('motos'), ativos: soma('ativos'), despesas: soma('despesas'), saldo: soma('saldo'),
    qtdVendas: meses.reduce((s, m) => s + m.qtdVendas, 0),
    recPrevista: r2(recPrevista.reduce((s, v) => s + v, 0)),
    despPrevista: r2(despPrevista.reduce((s, v) => s + v, 0)),
    saldoProjetado: r2(acumuladoProj),
  };

  const anosDisponiveis = Array.from(new Set([
    ...b.vendidas.map((p) => anoDe(p.dataVenda)),
    ...b.despesasPagas.map((d) => anoDe(d.dataEfetiva)),
    ...b.motosFora.map((m) => anoDe(m.data)),
    ...b.ativosFora.map((a) => anoDe(a.data)),
    ...b.despesasPrevistas.map((d) => anoDe(d.dataPrevista)),
    new Date().getFullYear(),
  ].filter(Boolean) as number[])).sort((x, y) => y - x);

  return { ano, anosDisponiveis, meses, total };
}

// ---- registros que compoem um mes (mes = 0: ano inteiro) ----
type Coluna = { k: string; rotulo: string; tipo: 'texto' | 'moeda' | 'data' };
type Tabela = { titulo: string; colunas: Coluna[]; itens: Record<string, any>[]; total: number | null };
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function lancamentosFluxo(anoParam: number | null, mesParam: number) {
  const b = await carregarBase();
  const ano = anoParam || new Date().getFullYear();
  const mes = mesParam >= 1 && mesParam <= 12 ? mesParam : 0;
  const noPeriodo = (d: any) => anoDe(d) === ano && (!mes || mesDe(d) === mes);
  const periodo = mes ? `${MES_NOME[mes - 1]} de ${ano}` : `ano de ${ano}`;
  const porData = (x: any, y: any) => String(x.data).localeCompare(String(y.data)) || (y.valor || 0) - (x.valor || 0);
  const soma = (lista: { valor: number }[]) => r2(lista.reduce((s, x) => s + x.valor, 0));

  const vendas = b.vendidas.filter((p) => noPeriodo(p.dataVenda));
  const colsPeca: Coluna[] = [
    { k: 'data', rotulo: 'Data', tipo: 'data' },
    { k: 'sku', rotulo: 'SKU', tipo: 'texto' },
    { k: 'descricao', rotulo: 'Peça', tipo: 'texto' },
    { k: 'moto', rotulo: 'Moto', tipo: 'texto' },
    { k: 'pedido', rotulo: 'Pedido', tipo: 'texto' },
  ];
  const basePeca = (p: PecaRow) => ({ data: dateKey(p.dataVenda), sku: p.idPeca, descricao: p.descricao, moto: b.motoDesc.get(p.motoId) || '', pedido: p.blingPedidoNum || '' });

  const tabelas: Tabela[] = [];

  const itensReceita = vendas.map((p) => ({ ...basePeca(p), valor: r2(n(p.precoML)) })).sort(porData);
  tabelas.push({ titulo: 'Receita · vendas do período', colunas: [...colsPeca, { k: 'valor', rotulo: 'Valor de venda', tipo: 'moeda' }], itens: itensReceita, total: soma(itensReceita) });

  const lancadas = b.despesasPagas.filter((d) => noPeriodo(d.dataEfetiva))
    .map((d) => ({ data: d.dataEfetiva, detalhes: d.detalhes, categoria: d.categoria, valor: r2(n(d.valor)) })).sort(porData);
  tabelas.push({
    titulo: 'Despesas · lançadas e pagas no período',
    colunas: [{ k: 'data', rotulo: 'Pagamento', tipo: 'data' }, { k: 'detalhes', rotulo: 'Detalhes', tipo: 'texto' }, { k: 'categoria', rotulo: 'Categoria', tipo: 'texto' }, { k: 'valor', rotulo: 'Valor', tipo: 'moeda' }],
    itens: lancadas, total: soma(lancadas),
  });

  const taxasFrete = vendas.filter((p) => n(p.valorTaxas) !== 0 || n(p.valorFrete) !== 0)
    .map((p) => ({ ...basePeca(p), comissao: r2(n(p.valorTaxas)), frete: r2(n(p.valorFrete)), valor: r2(n(p.valorTaxas) + n(p.valorFrete)) })).sort(porData);
  tabelas.push({
    titulo: 'Despesas · comissões e fretes dos pedidos',
    colunas: [...colsPeca, { k: 'comissao', rotulo: 'Comissão / taxas', tipo: 'moeda' }, { k: 'frete', rotulo: 'Frete', tipo: 'moeda' }, { k: 'valor', rotulo: 'Total', tipo: 'moeda' }],
    itens: taxasFrete, total: soma(taxasFrete),
  });

  const motos = b.motosFora.filter((m) => noPeriodo(m.data)).map((m) => ({ data: m.data, moto: m.moto, valor: r2(m.valor) })).sort(porData);
  tabelas.push({
    titulo: 'Despesas · compras de motos que não estão lançadas em Despesas',
    colunas: [{ k: 'data', rotulo: 'Data da compra', tipo: 'data' }, { k: 'moto', rotulo: 'Moto', tipo: 'texto' }, { k: 'valor', rotulo: 'Valor pago', tipo: 'moeda' }],
    itens: motos, total: soma(motos),
  });

  const ativos = b.ativosFora.filter((a) => noPeriodo(a.data)).map((a) => ({ data: a.data, codigo: a.codigo, ativo: a.nome, valor: r2(a.valor) })).sort(porData);
  tabelas.push({
    titulo: 'Despesas · compras de ativos que não estão lançadas em Despesas',
    colunas: [{ k: 'data', rotulo: 'Data da compra', tipo: 'data' }, { k: 'codigo', rotulo: 'Código', tipo: 'texto' }, { k: 'ativo', rotulo: 'Ativo', tipo: 'texto' }, { k: 'valor', rotulo: 'Valor pago', tipo: 'moeda' }],
    itens: ativos, total: soma(ativos),
  });

  // previsto (futuro): despesas a pagar e recebivel do Mercado Pago
  const aPagar = b.despesasPrevistas.filter((d) => noPeriodo(d.dataPrevista))
    .map((d) => ({ data: d.vencimento, detalhes: d.detalhes, categoria: d.categoria, previsao: d.dataPrevista, valor: r2(d.valor) }))
    .sort(porData);
  tabelas.push({
    titulo: 'Previsto · despesas a pagar (pendentes e recorrentes; vencidas contam no mês atual)',
    colunas: [{ k: 'data', rotulo: 'Vencimento', tipo: 'data' }, { k: 'detalhes', rotulo: 'Detalhes', tipo: 'texto' }, { k: 'categoria', rotulo: 'Categoria', tipo: 'texto' }, { k: 'valor', rotulo: 'Valor', tipo: 'moeda' }],
    itens: aPagar, total: soma(aPagar),
  });
  const recebiveis = b.recebivelMP.valor > 0 && anoDe(b.hoje) === ano && (!mes || mesDe(b.hoje) === mes)
    ? [{ data: b.hoje, descricao: 'Saldo a liberar do Mercado Pago', atualizado: b.recebivelMP.atualizadoEm ? dateKey(b.recebivelMP.atualizadoEm) : '', valor: r2(b.recebivelMP.valor) }]
    : [];
  tabelas.push({
    titulo: 'Previsto · recebíveis (saldo a liberar do Mercado Pago)',
    colunas: [{ k: 'data', rotulo: 'Mês de referência', tipo: 'data' }, { k: 'descricao', rotulo: 'Descrição', tipo: 'texto' }, { k: 'atualizado', rotulo: 'Saldo atualizado em', tipo: 'data' }, { k: 'valor', rotulo: 'Valor', tipo: 'moeda' }],
    itens: recebiveis, total: soma(recebiveis),
  });
  const totalReceitaPrevista = soma(recebiveis);
  const totalDespesasPrevistas = soma(aPagar);

  const totalReceita = soma(itensReceita);
  const totalDespesas = r2(soma(lancadas) + soma(taxasFrete) + soma(motos) + soma(ativos));
  const notas = [
    'Os itens "Previsto" não entram em Receita, Despesas nem Saldo do período: formam a previsão. O saldo a liberar do Mercado Pago vem de vendas que já estão na Receita (contadas na data da venda); por isso, some-o ao saldo projetado só como referência de caixa a entrar.',
    `Saldo do período = receita ${totalReceita.toFixed(2)} − despesas ${totalDespesas.toFixed(2)} = ${r2(totalReceita - totalDespesas).toFixed(2)}.`,
    'Compras de motos e de ativos só aparecem nas tabelas acima quando ainda não estão em Despesas (ativo ligado a uma despesa, ou despesa paga com o mesmo valor no mesmo mês); nesse caso entram pelo mês da compra.',
  ];

  return { ok: true, titulo: 'Fluxo de caixa', periodo, ano, mes, totalReceita, totalDespesas, saldo: r2(totalReceita - totalDespesas), totalReceitaPrevista, totalDespesasPrevistas, tabelas, notas };
}
