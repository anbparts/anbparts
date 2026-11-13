// Estrutura (aba da pagina Empresa): cadastro dos ativos da empresa (ferramentas, equipamentos, moveis, infra...).
// Cada ativo tem codigo sequencial INV_0001, INV_0002... gerado ao cadastrar, pode ser ligado a um Investimento e,
// por ele, a Despesa correspondente (a despesa "replicada" pelo Investimentos, ou lancada daqui). Tambem guarda a
// depreciacao (linear por anos ou % ao ano) e alimenta a etiqueta de impressao. Tabela criada sob demanda (sem migration):
//   "Ativo" — um registro por bem.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { mapaCategoriasDespesa, semAcento } from '../lib/despesa-categorias';

export const ativosRouter = Router();

const txt = (v: any) => String(v ?? '').trim();
const num = (v: any) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const dia = (d: any) => {
  if (!d) return '';
  const p = new Date(d);
  return Number.isNaN(p.getTime()) ? '' : p.toISOString().slice(0, 10);
};
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const erro = (status: number, message: string) => Object.assign(new Error(message), { status });

export const ATIVO_STATUS = ['ativo', 'manutencao', 'baixado'] as const;
export const DEP_METODOS = ['nenhuma', 'linear_anos', 'linear_pct'] as const;

let tabelaPronta: Promise<void> | null = null;
function garantirTabela(): Promise<void> {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Ativo" (
        "id" SERIAL PRIMARY KEY,
        "codigo" TEXT NOT NULL UNIQUE,
        "nome" TEXT NOT NULL,
        "categoria" TEXT,
        "descricao" TEXT,
        "localizacao" TEXT,
        "responsavel" TEXT,
        "fornecedor" TEXT,
        "marcaModelo" TEXT,
        "numeroSerie" TEXT,
        "notaFiscal" TEXT,
        "dataAquisicao" DATE,
        "valor" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'ativo',
        "dataBaixa" DATE,
        "observacao" TEXT,
        "depMetodo" TEXT NOT NULL DEFAULT 'nenhuma',
        "depAnos" NUMERIC(6,2),
        "depPct" NUMERIC(6,2),
        "valorResidual" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "depInicio" DATE,
        "investimentoId" INTEGER,
        "despesaId" INTEGER,
        "criadoPor" TEXT,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ativo_investimentoId_idx" ON "Ativo" ("investimentoId")`);
    })().catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

// ---- depreciacao linear ----
// Vida util em anos (informada, ou 100 / % ao ano). Base depreciavel = valor - valor residual.
// Meses decorridos = meses completos entre o inicio da depreciacao e hoje (ou a data da baixa).
function mesesEntre(inicio: string, fim: string) {
  if (!inicio || !fim || fim < inicio) return 0;
  const [a1, m1, d1] = inicio.split('-').map(Number);
  const [a2, m2, d2] = fim.split('-').map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  return Math.max(0, meses);
}
function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + meses, d));
  return dt.toISOString().slice(0, 10);
}

function calcularDepreciacao(a: { valor: number; valorResidual: number; depMetodo: string; depAnos: number | null; depPct: number | null; depInicio: string; dataAquisicao: string; status: string; dataBaixa: string }) {
  const valor = a.valor;
  const base = { metodo: a.depMetodo, vidaUtilAnos: null as number | null, taxaAnualPct: null as number | null, mensal: 0, acumulada: 0, valorAtual: valor, pctDepreciado: 0, mesesDecorridos: 0, fimPrevisto: '', totalmenteDepreciado: false };
  if (a.depMetodo === 'nenhuma') return base;

  let anos = 0;
  if (a.depMetodo === 'linear_anos') anos = a.depAnos || 0;
  else if (a.depMetodo === 'linear_pct') anos = a.depPct && a.depPct > 0 ? 100 / a.depPct : 0;
  if (!(anos > 0)) return base;

  const inicio = a.depInicio || a.dataAquisicao;
  if (!inicio) return { ...base, vidaUtilAnos: Number(anos.toFixed(2)), taxaAnualPct: Number((100 / anos).toFixed(2)) };

  const depreciavel = Math.max(0, valor - Math.min(a.valorResidual, valor));
  const mensal = depreciavel / (anos * 12);
  const fimCalculo = a.status === 'baixado' && a.dataBaixa ? a.dataBaixa : hojeISO();
  const meses = mesesEntre(inicio, fimCalculo);
  const acumulada = Math.min(depreciavel, mensal * meses);
  return {
    metodo: a.depMetodo,
    vidaUtilAnos: Number(anos.toFixed(2)),
    taxaAnualPct: Number((100 / anos).toFixed(2)),
    mensal: r2(mensal),
    acumulada: r2(acumulada),
    valorAtual: r2(valor - acumulada),
    pctDepreciado: depreciavel > 0 ? Number(((acumulada / depreciavel) * 100).toFixed(1)) : 0,
    mesesDecorridos: meses,
    fimPrevisto: somarMeses(inicio, Math.round(anos * 12)),
    totalmenteDepreciado: depreciavel > 0 && acumulada >= depreciavel - 0.005,
  };
}

function paraRegistro(r: any) {
  const valor = num(r.valor);
  const base = {
    id: Number(r.id),
    codigo: txt(r.codigo),
    nome: txt(r.nome),
    categoria: txt(r.categoria),
    descricao: txt(r.descricao),
    localizacao: txt(r.localizacao),
    responsavel: txt(r.responsavel),
    fornecedor: txt(r.fornecedor),
    marcaModelo: txt(r.marcaModelo),
    numeroSerie: txt(r.numeroSerie),
    notaFiscal: txt(r.notaFiscal),
    dataAquisicao: dia(r.dataAquisicao),
    valor,
    status: (ATIVO_STATUS as readonly string[]).includes(txt(r.status)) ? txt(r.status) : 'ativo',
    dataBaixa: dia(r.dataBaixa),
    observacao: txt(r.observacao),
    depMetodo: (DEP_METODOS as readonly string[]).includes(txt(r.depMetodo)) ? txt(r.depMetodo) : 'nenhuma',
    depAnos: r.depAnos == null ? null : num(r.depAnos),
    depPct: r.depPct == null ? null : num(r.depPct),
    valorResidual: num(r.valorResidual),
    depInicio: dia(r.depInicio),
    investimentoId: r.investimentoId == null ? null : Number(r.investimentoId),
    despesaId: r.despesaId == null ? null : Number(r.despesaId),
    criadoPor: txt(r.criadoPor),
    criadoEm: r.criadoEm,
  };
  return { ...base, depreciacao: calcularDepreciacao(base) };
}

// Investimento + despesa de cada investimento. A despesa de um investimento e': a ligada explicitamente a algum ativo
// (despesaId) ou, na falta, a despesa PAGA de mesma data e mesmo valor (e' assim que o "Replicar Despesa" do
// Investimentos cria a despesa — nao ha vinculo direto no banco). Cada despesa cobre um unico investimento.
async function carregarVinculos(ativos: any[]) {
  const [investimentos, despesas] = await Promise.all([
    prisma.investimento.findMany({ orderBy: [{ data: 'desc' }, { id: 'desc' }] }),
    prisma.despesa.findMany({ select: { id: true, data: true, detalhes: true, categoria: true, valor: true, statusPagamento: true } }),
  ]);
  const despesaPorId = new Map(despesas.map((d) => [d.id, d]));

  // despesas ja ligadas explicitamente por ativos (por investimento)
  const explicitaPorInv = new Map<number, number>();
  const usadas = new Set<number>();
  for (const a of ativos) {
    if (a.investimentoId != null && a.despesaId != null && despesaPorId.has(a.despesaId) && !explicitaPorInv.has(a.investimentoId)) {
      explicitaPorInv.set(a.investimentoId, a.despesaId);
      usadas.add(a.despesaId);
    }
  }

  // despesas livres para casar por data+valor (uma por investimento, na ordem dos investimentos mais antigos)
  const livres = new Map<string, number[]>();
  for (const d of despesas) {
    if (d.statusPagamento !== 'pago' || usadas.has(d.id)) continue;
    const chave = `${dia(d.data)}::${num(d.valor).toFixed(2)}`;
    const lista = livres.get(chave);
    if (lista) lista.push(d.id); else livres.set(chave, [d.id]);
  }

  const despesaDoInv = new Map<number, { despesa: any; origem: 'ligada' | 'automatica' }>();
  const ordenados = [...investimentos].sort((x, y) => dia(x.data).localeCompare(dia(y.data)) || x.id - y.id);
  for (const inv of ordenados) {
    const explicita = explicitaPorInv.get(inv.id);
    if (explicita != null) { despesaDoInv.set(inv.id, { despesa: despesaPorId.get(explicita), origem: 'ligada' }); continue; }
    const lista = livres.get(`${dia(inv.data)}::${num(inv.valor).toFixed(2)}`);
    if (lista && lista.length) {
      const id = lista.shift() as number;
      despesaDoInv.set(inv.id, { despesa: despesaPorId.get(id), origem: 'automatica' });
    }
  }

  const formatarDespesa = (x: { despesa: any; origem: string } | undefined) => x ? {
    id: x.despesa.id, data: dia(x.despesa.data), detalhes: x.despesa.detalhes, categoria: x.despesa.categoria,
    valor: num(x.despesa.valor), statusPagamento: x.despesa.statusPagamento, origem: x.origem,
  } : null;

  const invMap = new Map(investimentos.map((i) => [i.id, i]));
  return { investimentos, invMap, despesaDoInv, formatarDespesa };
}

async function listarCompleto() {
  await garantirTabela();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo" ORDER BY "codigo" ASC`);
  const ativos = rows.map(paraRegistro);
  const { invMap, despesaDoInv, formatarDespesa } = await carregarVinculos(ativos);
  return ativos.map((a) => {
    const inv = a.investimentoId != null ? invMap.get(a.investimentoId) : null;
    return {
      ...a,
      investimento: inv ? { id: inv.id, data: dia(inv.data), socio: inv.socio, tipo: inv.tipo, moto: inv.moto || '', valor: num(inv.valor) } : null,
      despesa: inv ? formatarDespesa(despesaDoInv.get(inv.id)) : null,
    };
  });
}

function lerCorpo(b: any) {
  const nome = txt(b?.nome);
  if (!nome) throw erro(400, 'Informe o nome do ativo.');
  const data = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(v)) ? txt(v) : null);
  const status = (ATIVO_STATUS as readonly string[]).includes(txt(b?.status)) ? txt(b.status) : 'ativo';
  const depMetodo = (DEP_METODOS as readonly string[]).includes(txt(b?.depMetodo)) ? txt(b.depMetodo) : 'nenhuma';
  const depAnos = txt(b?.depAnos) ? num(b.depAnos) : null;
  const depPct = txt(b?.depPct) ? num(b.depPct) : null;
  if (depMetodo === 'linear_anos' && !(depAnos && depAnos > 0)) throw erro(400, 'Informe a vida útil em anos para depreciar.');
  if (depMetodo === 'linear_pct' && !(depPct && depPct > 0 && depPct <= 100)) throw erro(400, 'Informe a taxa de depreciação ao ano (entre 0 e 100%).');
  const investimentoId = txt(b?.investimentoId) ? Math.trunc(num(b.investimentoId)) : null;
  return {
    nome,
    categoria: txt(b?.categoria) || null,
    descricao: txt(b?.descricao) || null,
    localizacao: txt(b?.localizacao) || null,
    responsavel: txt(b?.responsavel) || null,
    fornecedor: txt(b?.fornecedor) || null,
    marcaModelo: txt(b?.marcaModelo) || null,
    numeroSerie: txt(b?.numeroSerie) || null,
    notaFiscal: txt(b?.notaFiscal) || null,
    dataAquisicao: data(b?.dataAquisicao),
    valor: Math.max(0, num(b?.valor)),
    status,
    dataBaixa: status === 'baixado' ? data(b?.dataBaixa) : null,
    observacao: txt(b?.observacao) || null,
    depMetodo,
    depAnos: depMetodo === 'linear_anos' ? depAnos : null,
    depPct: depMetodo === 'linear_pct' ? depPct : null,
    valorResidual: depMetodo === 'nenhuma' ? 0 : Math.max(0, num(b?.valorResidual)),
    depInicio: depMetodo === 'nenhuma' ? null : data(b?.depInicio),
    investimentoId: investimentoId && investimentoId > 0 ? investimentoId : null,
  };
}

async function validarInvestimento(id: number | null) {
  if (id == null) return;
  const inv = await prisma.investimento.findUnique({ where: { id } });
  if (!inv) throw erro(400, 'Investimento não encontrado.');
}

const COLUNAS_ESCRITA = ['nome', 'categoria', 'descricao', 'localizacao', 'responsavel', 'fornecedor', 'marcaModelo', 'numeroSerie', 'notaFiscal', 'dataAquisicao', 'valor', 'status', 'dataBaixa', 'observacao', 'depMetodo', 'depAnos', 'depPct', 'valorResidual', 'depInicio', 'investimentoId'] as const;
const CASTS: Record<string, string> = {
  dataAquisicao: '::date', dataBaixa: '::date', depInicio: '::date',
  valor: '::numeric', valorResidual: '::numeric', depAnos: '::numeric', depPct: '::numeric', investimentoId: '::int',
};

// GET /ativos — lista completa (com investimento, despesa e depreciacao de cada ativo)
ativosRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ ok: true, itens: await listarCompleto() });
  } catch (e) { next(e); }
});

// GET /ativos/investimentos — investimentos disponiveis para ligar a um ativo, com a despesa de cada um e os ativos ja ligados
ativosRouter.get('/investimentos', async (_req, res, next) => {
  try {
    await garantirTabela();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo"`);
    const ativos = rows.map(paraRegistro);
    const { investimentos, despesaDoInv, formatarDespesa } = await carregarVinculos(ativos);
    res.json({
      ok: true,
      itens: investimentos.map((inv) => ({
        id: inv.id, data: dia(inv.data), socio: inv.socio, tipo: inv.tipo, moto: inv.moto || '', valor: num(inv.valor),
        despesa: formatarDespesa(despesaDoInv.get(inv.id)),
        ativos: ativos.filter((a) => a.investimentoId === inv.id).map((a) => a.codigo),
      })),
    });
  } catch (e) { next(e); }
});

async function inserir(corpo: ReturnType<typeof lerCorpo>, criadoPor: string) {
  // codigo sequencial INV_0001...: maior numero ja usado + 1; a UNIQUE do codigo + nova tentativa cobrem cadastros simultaneos
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const prox = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace("codigo", '\\D', '', 'g'), '')::int), 0) + 1 AS n FROM "Ativo" WHERE "codigo" LIKE 'INV\\_%'`,
    );
    const codigo = `INV_${String(Number(prox[0]?.n) || 1).padStart(4, '0')}`;
    try {
      const cols = COLUNAS_ESCRITA.map((c) => `"${c}"`).join(',');
      const vals = COLUNAS_ESCRITA.map((c, i) => `$${i + 3}${CASTS[c] || ''}`).join(',');
      const out = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "Ativo" ("codigo","criadoPor",${cols}) VALUES ($1,$2,${vals}) RETURNING *`,
        codigo, criadoPor || null, ...COLUNAS_ESCRITA.map((c) => (corpo as any)[c]),
      );
      return out[0];
    } catch (e: any) {
      const duplicado = /duplicate key|unique constraint|23505/i.test(String(e?.message || e?.code || ''));
      if (!duplicado || tentativa === 5) throw e;
    }
  }
  throw erro(500, 'Não foi possível gerar o código do ativo.');
}

// POST /ativos — cadastra e gera o codigo INV_XXXX
ativosRouter.post('/', async (req, res, next) => {
  try {
    await garantirTabela();
    const corpo = lerCorpo(req.body);
    await validarInvestimento(corpo.investimentoId);
    const criadoPor = txt((req as any).user?.login || (req as any).user?.name || (req as any).user?.nome);
    const criado = await inserir(corpo, criadoPor);
    res.json({ ok: true, item: paraRegistro(criado) });
  } catch (e) { next(e); }
});

// PUT /ativos/:id — edita (o codigo nunca muda)
ativosRouter.put('/:id', async (req, res, next) => {
  try {
    await garantirTabela();
    const id = Number(req.params.id);
    const atual = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo" WHERE "id" = $1`, id);
    if (!atual.length) throw erro(404, 'Ativo não encontrado.');
    const corpo = lerCorpo(req.body);
    await validarInvestimento(corpo.investimentoId);
    const sets = COLUNAS_ESCRITA.map((c, i) => `"${c}" = $${i + 2}${CASTS[c] || ''}`).join(', ');
    // trocou de investimento: a despesa ligada era do investimento anterior
    const trocouInv = (atual[0].investimentoId ?? null) !== corpo.investimentoId;
    await prisma.$executeRawUnsafe(
      `UPDATE "Ativo" SET ${sets}, "atualizadoEm" = now()${trocouInv ? ', "despesaId" = NULL' : ''} WHERE "id" = $1`,
      id, ...COLUNAS_ESCRITA.map((c) => (corpo as any)[c]),
    );
    const out = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo" WHERE "id" = $1`, id);
    res.json({ ok: true, item: paraRegistro(out[0]) });
  } catch (e) { next(e); }
});

// DELETE /ativos/:id — remove so o ativo (investimento e despesa continuam intactos)
ativosRouter.delete('/:id', async (req, res, next) => {
  try {
    await garantirTabela();
    await prisma.$executeRawUnsafe(`DELETE FROM "Ativo" WHERE "id" = $1`, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /ativos/:id/lancar-despesa { categoria, detalhes? } — cria a despesa (paga) do investimento ligado a este ativo.
// Mesma data e mesmo valor do investimento (igual ao "Replicar Despesa"), e liga a despesa a todos os ativos do mesmo investimento.
ativosRouter.post('/:id/lancar-despesa', async (req, res, next) => {
  try {
    await garantirTabela();
    const id = Number(req.params.id);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo" WHERE "id" = $1`, id);
    if (!rows.length) throw erro(404, 'Ativo não encontrado.');
    const ativo = paraRegistro(rows[0]);
    if (ativo.investimentoId == null) throw erro(400, 'Ligue o ativo a um investimento antes de lançar a despesa.');

    const todos = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Ativo"`)).map(paraRegistro);
    const { invMap, despesaDoInv } = await carregarVinculos(todos);
    const inv = invMap.get(ativo.investimentoId);
    if (!inv) throw erro(400, 'Investimento não encontrado.');
    const existente = despesaDoInv.get(inv.id);
    if (existente) throw erro(409, `Esse investimento já tem a despesa #${existente.despesa.id} (${existente.origem === 'automatica' ? 'lançada pelo Investimentos' : 'lançada pelo ativo'}).`);

    const catalogo = await mapaCategoriasDespesa();
    const cat = catalogo.get(semAcento(req.body?.categoria));
    if (!cat) throw erro(400, 'Escolha uma categoria de despesa válida.');

    const irmaos = todos.filter((a) => a.investimentoId === inv.id).map((a) => a.codigo);
    const detalhes = txt(req.body?.detalhes) || `Investimento · ${irmaos.join(', ')}${ativo.nome && irmaos.length === 1 ? ` · ${ativo.nome}` : ''}`;
    const despesa = await prisma.despesa.create({
      data: {
        data: inv.data,
        detalhes,
        categoria: cat.nome,
        valor: inv.valor,
        statusPagamento: 'pago',
        dataPagamento: inv.data,
        observacao: `Lançada pela Estrutura (${irmaos.join(', ')})`,
      },
    });
    await prisma.$executeRawUnsafe(`UPDATE "Ativo" SET "despesaId" = $1, "atualizadoEm" = now() WHERE "investimentoId" = $2`, despesa.id, inv.id);
    res.json({ ok: true, despesa: { id: despesa.id, data: dia(despesa.data), detalhes: despesa.detalhes, categoria: despesa.categoria, valor: num(despesa.valor), statusPagamento: despesa.statusPagamento } });
  } catch (e) { next(e); }
});
