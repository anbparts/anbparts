// Propostas Comerciais: espelho local das propostas do Bling (/propostas-comerciais) + criacao pelo sistema (grava no Bling).
// A numeracao e' SEMPRE a do Bling (campo "numero" devolvido por ele). Tabelas criadas sob demanda (sem migration):
//   "PropostaComercial", "PropostaComercialItem". Clientes usam a base interna "BlingCliente".
import { prisma } from './prisma';
import { blingReq } from '../routes/bling';

const txt = (v: any) => String(v ?? '').trim();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dataIso = (v: any) => (txt(v).slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? txt(v).slice(0, 10) : null);

export const SITUACOES_PROPOSTA = ['Rascunho', 'Pendente', 'Aguardando', 'Aprovado', 'Não aprovado', 'Concluído'];

let tabelasProntas: Promise<void> | null = null;
export function garantirTabelasPropostas(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PropostaComercial" (
        "id" BIGINT PRIMARY KEY, "numero" INTEGER, "data" DATE, "situacao" TEXT,
        "clienteId" BIGINT, "clienteNome" TEXT, "aosCuidadosDe" TEXT,
        "totalProdutos" NUMERIC(14,2), "total" NUMERIC(14,2), "desconto" NUMERIC(14,2), "outrasDespesas" NUMERIC(14,2), "frete" NUMERIC(14,2),
        "introducao" TEXT, "observacoes" TEXT, "observacaoInterna" TEXT, "prazoEntrega" TEXT,
        "criadoAqui" BOOLEAN NOT NULL DEFAULT false, "criadoPor" TEXT,
        "sincronizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PropostaComercial_numero_idx" ON "PropostaComercial" ("numero")`);
      // versao 2 = itens gravados com o preco de lista correto (o "valor" do Bling e' o unitario JA com desconto)
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "itensVersao" INTEGER NOT NULL DEFAULT 1`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PropostaComercialItem" (
        "id" SERIAL PRIMARY KEY, "propostaId" BIGINT NOT NULL, "ordem" INTEGER, "produtoId" BIGINT, "codigo" TEXT, "descricao" TEXT, "descricaoDetalhada" TEXT,
        "unidade" TEXT, "quantidade" NUMERIC(14,3), "valorLista" NUMERIC(14,2), "descontoPct" NUMERIC(8,3))`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PropostaComercialItem_prop_idx" ON "PropostaComercialItem" ("propostaId")`);
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

// ───────────── Cliente ─────────────
async function nomeDoContato(contatoId: string, nomeNoDetalhe: string): Promise<string> {
  if (nomeNoDetalhe) return nomeNoDetalhe;
  const [c] = await prisma.$queryRawUnsafe<any[]>(`SELECT "nome" FROM "BlingCliente" WHERE "id" = $1::bigint`, contatoId).catch(() => [] as any[]);
  if (txt(c?.nome)) return txt(c.nome);
  try {
    const r: any = await blingReq(`/contatos/${contatoId}`);
    const nome = txt(r?.data?.nome);
    if (nome) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "BlingCliente" ("id","nome") VALUES ($1::bigint,$2) ON CONFLICT ("id") DO NOTHING`, contatoId, nome).catch(() => null);
      return nome;
    }
  } catch { /* sem nome: mostra so o id */ }
  return '';
}

// ───────────── Sincronizacao (Bling -> local) ─────────────
export async function gravarPropostaDoBling(d: any, extra?: { criadoAqui?: boolean; criadoPor?: string }) {
  await garantirTabelasPropostas();
  const id = txt(d?.id);
  if (!id) throw new Error('Proposta sem id');
  const contatoId = txt(d?.contato?.id);
  const clienteNome = contatoId ? await nomeDoContato(contatoId, txt(d?.contato?.nome)) : '';
  const situacao = txt(typeof d?.situacao === 'object' ? (d.situacao?.valor ?? d.situacao?.nome ?? d.situacao?.descricao) : d?.situacao);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PropostaComercial" ("id","numero","data","situacao","clienteId","clienteNome","aosCuidadosDe","totalProdutos","total","desconto","outrasDespesas","frete",
        "introducao","observacoes","observacaoInterna","prazoEntrega","criadoAqui","criadoPor","sincronizadoEm")
     VALUES ($1::bigint,$2,$3::date,$4,$5::bigint,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
     ON CONFLICT ("id") DO UPDATE SET "numero"=EXCLUDED."numero","data"=EXCLUDED."data","situacao"=EXCLUDED."situacao","clienteId"=EXCLUDED."clienteId",
       "clienteNome"=COALESCE(NULLIF(EXCLUDED."clienteNome",''),"PropostaComercial"."clienteNome"),"aosCuidadosDe"=EXCLUDED."aosCuidadosDe",
       "totalProdutos"=EXCLUDED."totalProdutos","total"=EXCLUDED."total","desconto"=EXCLUDED."desconto","outrasDespesas"=EXCLUDED."outrasDespesas","frete"=EXCLUDED."frete",
       "introducao"=EXCLUDED."introducao","observacoes"=EXCLUDED."observacoes","observacaoInterna"=EXCLUDED."observacaoInterna","prazoEntrega"=EXCLUDED."prazoEntrega",
       "criadoAqui"="PropostaComercial"."criadoAqui" OR EXCLUDED."criadoAqui","criadoPor"=COALESCE("PropostaComercial"."criadoPor",EXCLUDED."criadoPor"),"sincronizadoEm"=now()`,
    id, d?.numero ? Math.round(num(d.numero)) : null, dataIso(d?.data), situacao || null, contatoId || null, clienteNome || null, txt(d?.aosCuidadosDe) || null,
    num(d?.totalProdutos), num(d?.total), num(d?.desconto), num(d?.outrasDespesas), num(d?.transporte?.frete),
    txt(d?.introducao) || null, txt(d?.observacoes) || null, txt(d?.observacaoInterna) || null, txt(d?.prazoEntrega) || null,
    !!extra?.criadoAqui, extra?.criadoPor || null,
  );
  // itens (so se o detalhe trouxe a lista)
  if (Array.isArray(d?.itens)) {
    await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "itensVersao" = 2 WHERE "id" = $1::bigint`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint`, id);
    let ordem = 0;
    for (const it of d.itens) {
      ordem += 1;
      // O "valor" que o Bling guarda no item e' o preco unitario JA com desconto (ex.: lista 2.800, 5% -> valor 2.660).
      const pct = num(it?.desconto);
      const unit = num(it?.valor);
      const lista = pct > 0 && pct < 100 ? r2(unit / (1 - pct / 100)) : unit;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PropostaComercialItem" ("propostaId","ordem","produtoId","codigo","descricao","descricaoDetalhada","unidade","quantidade","valorLista","descontoPct")
         VALUES ($1::bigint,$2,$3::bigint,$4,$5,$6,$7,$8,$9,$10)`,
        id, ordem, it?.produto?.id ? txt(it.produto.id) : null, txt(it?.codigo) || null, txt(it?.produto?.descricao || it?.descricao) || null,
        txt(it?.descricaoDetalhada) || null, txt(it?.unidade) || 'UN', num(it?.quantidade), lista, pct,
      );
    }
  }
  return id;
}

export const jobPropostas: any = { rodando: false, total: 0, feitos: 0, erros: 0, ultimoErro: '', finalizadoEm: null as string | null };

// Traz TODAS as propostas do Bling (lista paginada) e le o detalhe das novas ou que mudaram de situacao/total.
export async function sincronizarPropostas(opcoes: { tudo?: boolean } = {}) {
  await garantirTabelasPropostas();
  if (jobPropostas.rodando) return { ok: false, motivo: 'Ja existe uma sincronizacao em andamento.' };
  jobPropostas.rodando = true; Object.assign(jobPropostas, { total: 0, feitos: 0, erros: 0, ultimoErro: '' });
  try {
    const lista: any[] = [];
    for (let pagina = 1; pagina <= 200; pagina++) {
      const r: any = await blingReq(`/propostas-comerciais?pagina=${pagina}&limite=100`);
      const itens: any[] = Array.isArray(r?.data) ? r.data : [];
      lista.push(...itens);
      if (itens.length < 100) break;
    }
    const existentes = new Map<string, { situacao: string; total: number; versao: number }>(
      (await prisma.$queryRawUnsafe<any[]>(`SELECT "id"::text AS id, "situacao", "total", "itensVersao" FROM "PropostaComercial"`)).map((r) => [String(r.id), { situacao: txt(r.situacao), total: num(r.total), versao: num(r.itensVersao) }]));
    const alvo = lista.filter((p) => {
      const e = existentes.get(txt(p.id));
      const sit = txt(typeof p?.situacao === 'object' ? (p.situacao?.valor ?? p.situacao?.nome) : p?.situacao);
      return opcoes.tudo || !e || e.versao < 2 || (sit && e.situacao !== sit) || Math.abs(e.total - num(p.total)) > 0.009;
    });
    jobPropostas.total = alvo.length;
    for (const p of alvo) {
      try {
        const det: any = await blingReq(`/propostas-comerciais/${p.id}`);
        await gravarPropostaDoBling(det?.data || p);
      } catch (e: any) { jobPropostas.erros += 1; jobPropostas.ultimoErro = String(e?.message || e); }
      jobPropostas.feitos += 1;
      await sleep(150);
    }
    jobPropostas.finalizadoEm = new Date().toISOString();
    return { ok: true, encontradas: lista.length, atualizadas: alvo.length, erros: jobPropostas.erros };
  } finally { jobPropostas.rodando = false; }
}

let agendadorLigado = false;
export function startPropostasScheduler() {
  if (agendadorLigado) return;
  agendadorLigado = true;
  const tick = async () => { try { await sincronizarPropostas(); } catch (e: any) { console.error('[propostas] sincronizacao periodica falhou:', e?.message || e); } };
  setTimeout(() => { void tick(); }, 6 * 60 * 1000);
  setInterval(() => { void tick(); }, 30 * 60 * 1000);
}

// ───────────── Consultas ─────────────
export async function listarPropostas(f: { busca?: string; situacao?: string; de?: string; ate?: string; pagina?: number; limite?: number }) {
  await garantirTabelasPropostas();
  const cond: string[] = []; const par: any[] = [];
  const add = (v: any) => { par.push(v); return `$${par.length}`; };
  if (txt(f.busca)) { const p = add(`%${txt(f.busca)}%`); cond.push(`(p."numero"::text ILIKE ${p} OR p."clienteNome" ILIKE ${p} OR EXISTS (SELECT 1 FROM "PropostaComercialItem" i WHERE i."propostaId"=p."id" AND (i."codigo" ILIKE ${p} OR i."descricao" ILIKE ${p})))`); }
  if (txt(f.situacao) && f.situacao !== 'todas') cond.push(`p."situacao" = ${add(txt(f.situacao))}`);
  if (dataIso(f.de)) cond.push(`p."data" >= ${add(dataIso(f.de))}::date`);
  if (dataIso(f.ate)) cond.push(`p."data" <= ${add(dataIso(f.ate))}::date`);
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limite = Math.min(200, Math.max(1, Math.floor(f.limite || 50)));
  const pagina = Math.max(1, Math.floor(f.pagina || 1));
  const [tot] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n, COALESCE(SUM(p."total"),0)::float AS soma FROM "PropostaComercial" p ${where}`, ...par);
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."data"::text AS data, p."situacao", p."clienteNome", p."total"::float AS total, p."criadoAqui",
            (SELECT COUNT(*)::int FROM "PropostaComercialItem" i WHERE i."propostaId"=p."id") AS "qtdItens"
       FROM "PropostaComercial" p ${where} ORDER BY p."numero" DESC NULLS LAST, p."id" DESC
       OFFSET ${(pagina - 1) * limite} LIMIT ${limite}`, ...par);
  const sit = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE("situacao",'—') AS situacao, COUNT(*)::int AS n FROM "PropostaComercial" GROUP BY 1 ORDER BY 2 DESC`);
  return { itens, total: Number(tot?.n || 0), somaTotal: Number(tot?.soma || 0), pagina, limite, situacoes: sit };
}

export async function lerProposta(id: string) {
  await garantirTabelasPropostas();
  const [p] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."data"::text AS data, p."situacao", p."clienteId"::text AS "clienteId", p."clienteNome", p."aosCuidadosDe",
            p."totalProdutos"::float AS "totalProdutos", p."total"::float AS total, p."desconto"::float AS desconto, p."outrasDespesas"::float AS "outrasDespesas", p."frete"::float AS frete,
            p."introducao", p."observacoes", p."observacaoInterna", p."prazoEntrega", p."criadoAqui", p."sincronizadoEm"
       FROM "PropostaComercial" p WHERE p."id" = $1::bigint`, id);
  if (!p) return null;
  if (!txt(p.clienteNome) && txt(p.clienteId)) {
    p.clienteNome = await nomeDoContato(txt(p.clienteId), '');
    if (p.clienteNome) await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "clienteNome" = $2 WHERE "id" = $1::bigint`, id, p.clienteNome).catch(() => null);
  }
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "ordem","produtoId"::text AS "produtoId","codigo","descricao","descricaoDetalhada","unidade","quantidade"::float AS quantidade,"valorLista"::float AS "valorLista","descontoPct"::float AS "descontoPct"
       FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint ORDER BY "ordem"`, id);
  return { ...p, itens };
}

// ───────────── Item: valida na NOSSA base e depois no Bling (considera variacoes de SKU: SKU, SKU-1, SKU-2...) ─────────────
const baseSku = (v: any) => txt(v).toUpperCase().replace(/-\d+$/, '');

export async function validarItemProposta(skuEntrada: string) {
  const sku = baseSku(skuEntrada);
  if (!sku) return { ok: false as const, erro: 'Informe o SKU.' };
  const [peca] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","idPeca","descricao","precoML"::float AS preco,"disponivel","emPrejuizo","sucata","dataVenda","fotoCapaArquivo" IS NOT NULL AS "temFoto"
       FROM "Peca" WHERE UPPER("idPeca") = $1`, sku);
  if (!peca) return { ok: false as const, erro: `SKU ${sku} nao existe na base.` };
  if (peca.sucata) return { ok: false as const, erro: `${sku} e sucata (nao entra em proposta).` };
  if (peca.emPrejuizo) return { ok: false as const, erro: `${sku} esta em prejuizo.` };
  if (peca.dataVenda) return { ok: false as const, erro: `${sku} ja foi vendida.` };
  if (!peca.disponivel) return { ok: false as const, erro: `${sku} sem estoque na base (indisponivel/em revisao/pendencia).` };

  // Bling: o SKU e suas variacoes (SKU-1, SKU-2...). Soma o saldo virtual de todas e usa como referencia o produto exato (ou o 1o com saldo).
  const codigos = [sku, ...[1, 2, 3, 4, 5].map((n) => `${sku}-${n}`)];
  let produtos: any[] = [];
  try {
    const r: any = await blingReq(`/produtos?pagina=1&limite=100&criterio=2${codigos.map((c) => `&codigos[]=${encodeURIComponent(c)}`).join('')}`);
    produtos = (Array.isArray(r?.data) ? r.data : []).filter((p: any) => baseSku(p?.codigo) === sku);
  } catch (e: any) { return { ok: false as const, erro: `Nao foi possivel conferir o estoque no Bling: ${e?.message || e}` }; }
  if (!produtos.length) return { ok: false as const, erro: `${sku} nao foi encontrado no Bling.` };
  const saldo = (p: any) => num(p?.estoque?.saldoVirtualTotal ?? p?.estoque?.saldo ?? 0);
  const saldoTotal = produtos.reduce((t, p) => t + saldo(p), 0);
  if (saldoTotal <= 0) return { ok: false as const, erro: `${sku} sem saldo no Bling (saldo ${saldoTotal}).` };
  const ref = produtos.find((p) => txt(p.codigo).toUpperCase() === sku && saldo(p) > 0) || produtos.find((p) => saldo(p) > 0) || produtos[0];
  const avisos: string[] = [];
  if (!(peca.preco > 0)) avisos.push('Peca sem preco cadastrado na base: informe o valor.');
  return {
    ok: true as const,
    item: {
      idPeca: peca.idPeca, codigo: txt(ref.codigo) || peca.idPeca, produtoId: txt(ref.id), descricao: txt(peca.descricao), unidade: 'UN',
      valorLista: r2(num(peca.preco)), saldoBling: saldoTotal, temFoto: !!peca.temFoto,
    },
    avisos,
  };
}

// ───────────── Cliente: busca na base interna ─────────────
export async function buscarClientes(q: string) {
  await garantirTabelasPedidos2();
  const t = txt(q);
  if (t.length < 2) return [];
  const digitos = t.replace(/\D/g, '');
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT "id"::text AS id, "nome", "documento", "cidade", "uf" FROM "BlingCliente"
      WHERE "nome" ILIKE $1 ${digitos.length >= 3 ? `OR "documento" LIKE $2` : ''}
      ORDER BY "nome" LIMIT 15`, ...(digitos.length >= 3 ? [`%${t}%`, `%${digitos}%`] : [`%${t}%`]));
}
async function garantirTabelasPedidos2() { await (await import('./bling-pedidos')).garantirTabelasPedidos(); }

// Cliente nao cadastrado: o Bling exige um contato (so aceita o id), entao cria um contato minimo so com o nome.
async function criarContatoMinimo(nome: string): Promise<string> {
  const r: any = await blingReq('/contatos', { method: 'POST', body: JSON.stringify({ nome, tipo: 'F', situacao: 'A' }) });
  const id = txt(r?.data?.id);
  if (!id) throw new Error('O Bling nao devolveu o id do contato criado.');
  await garantirTabelasPedidos2();
  await prisma.$executeRawUnsafe(`INSERT INTO "BlingCliente" ("id","nome") VALUES ($1::bigint,$2) ON CONFLICT ("id") DO NOTHING`, id, nome).catch(() => null);
  return id;
}

// ───────────── Criar proposta (valida tudo, cria no Bling, le de volta o numero e grava local) ─────────────
export type NovaProposta = {
  clienteId?: string; clienteNome?: string; data?: string; aosCuidadosDe?: string;
  introducao?: string; observacoes?: string; observacaoInterna?: string; prazoEntrega?: string;
  desconto?: number; outrasDespesas?: number; frete?: number;
  itens: Array<{ codigo: string; quantidade?: number; descontoPct?: number; valorLista?: number }>;
};

export async function criarProposta(dados: NovaProposta, usuario?: string) {
  if (!Array.isArray(dados.itens) || !dados.itens.length) throw new Error('Inclua ao menos um item.');
  // valida de novo no servidor (estoque pode ter mudado desde que o item foi adicionado na tela)
  const itensBling: any[] = [];
  const vistos = new Set<string>();
  for (const it of dados.itens) {
    const sku = baseSku(it.codigo);
    if (vistos.has(sku)) throw new Error(`SKU ${sku} repetido na proposta.`);
    vistos.add(sku);
    const v = await validarItemProposta(sku);
    if (!v.ok) throw new Error(v.erro);
    const qtd = Math.max(1, num(it.quantidade) || 1);
    if (qtd > v.item.saldoBling) throw new Error(`${sku}: quantidade ${qtd} maior que o saldo do Bling (${v.item.saldoBling}).`);
    const lista = num(it.valorLista) > 0 ? num(it.valorLista) : v.item.valorLista;
    if (!(lista > 0)) throw new Error(`${sku}: informe o valor da peca.`);
    const pct = Math.min(100, Math.max(0, num(it.descontoPct)));
    itensBling.push({
      produto: { id: Number(v.item.produtoId), descricao: v.item.descricao }, codigo: v.item.codigo, unidade: 'UN',
      // mesmo formato que o Bling devolve na leitura: "valor" = unitario JA com desconto; "desconto" = percentual aplicado
      quantidade: qtd, valor: r2(lista * (1 - pct / 100)), desconto: pct,
    });
  }

  let contatoId = txt(dados.clienteId);
  if (!contatoId) {
    const nome = txt(dados.clienteNome);
    if (!nome) throw new Error('Informe o cliente (da base ou digite o nome).');
    contatoId = await criarContatoMinimo(nome);
  }

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const base: any = {
    data: dataIso(dados.data) || hoje,
    contato: { id: Number(contatoId) },
    itens: itensBling,
    parcelas: [],
    desconto: num(dados.desconto), outrasDespesas: num(dados.outrasDespesas),
    transporte: { freteModalidade: 0, frete: num(dados.frete) },
  };
  if (txt(dados.aosCuidadosDe)) base.aosCuidadosDe = txt(dados.aosCuidadosDe);
  if (txt(dados.introducao)) base.introducao = txt(dados.introducao);
  if (txt(dados.observacoes)) base.observacoes = txt(dados.observacoes);
  if (txt(dados.observacaoInterna)) base.observacaoInterna = txt(dados.observacaoInterna);
  if (txt(dados.prazoEntrega)) base.prazoEntrega = txt(dados.prazoEntrega);

  let criado: any;
  try {
    criado = await blingReq('/propostas-comerciais', { method: 'POST', body: JSON.stringify(base) });
  } catch (e: any) {
    // O schema do Bling marca "parcelas" como obrigatorio: se recusar a lista vazia, manda 1 parcela unica (a vista) com o total.
    if (!/parcela/i.test(String(e?.message || ''))) throw e;
    const totalItens = itensBling.reduce((t, i) => t + i.quantidade * i.valor, 0);
    const total = r2(totalItens - num(dados.desconto) + num(dados.outrasDespesas) + num(dados.frete));
    criado = await blingReq('/propostas-comerciais', { method: 'POST', body: JSON.stringify({ ...base, parcelas: [{ numeroDias: 0, valor: total }] }) });
  }
  const id = txt(criado?.data?.id);
  if (!id) throw new Error('O Bling nao devolveu o id da proposta criada.');

  // Rascunho (padrao pedido pelo usuario) e leitura de volta: numero e total oficiais do Bling
  try { await blingReq(`/propostas-comerciais/${id}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao: 'Rascunho' }) }); } catch { /* ja nasce nessa situacao ou o Bling recusou: segue */ }
  const det: any = await blingReq(`/propostas-comerciais/${id}`);
  await gravarPropostaDoBling(det?.data || { id, ...base }, { criadoAqui: true, criadoPor: usuario });

  // confere se o total do Bling bate com o nosso calculo (descontos por item em %)
  const totalItensNosso = itensBling.reduce((t, i) => t + i.quantidade * i.valor, 0);
  const totalNosso = r2(totalItensNosso - num(dados.desconto) + num(dados.outrasDespesas) + num(dados.frete));
  const totalBling = num(det?.data?.total);
  const avisos: string[] = [];
  if (totalBling && Math.abs(totalBling - totalNosso) > 0.05) avisos.push(`O total no Bling (${totalBling.toFixed(2)}) difere do calculado aqui (${totalNosso.toFixed(2)}). Confira a proposta no Bling.`);
  return { id, numero: det?.data?.numero ?? null, total: totalBling || totalNosso, avisos };
}

export async function alterarSituacaoProposta(id: string, situacao: string) {
  if (!SITUACOES_PROPOSTA.includes(situacao)) throw new Error('Situacao invalida.');
  await blingReq(`/propostas-comerciais/${id}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao }) });
  await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "situacao" = $2, "sincronizadoEm" = now() WHERE "id" = $1::bigint`, id, situacao);
}
