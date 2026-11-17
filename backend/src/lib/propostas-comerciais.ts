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
      // JSON do detalhe como o Bling devolveu (diagnostico: ver quais campos de cliente existem)
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "raw" TEXT`);
      // nome do cliente digitado/corrigido aqui na proposta: tem prioridade sobre o que vier do Bling
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "clienteNomeManual" TEXT`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PropostaComercialItem" (
        "id" SERIAL PRIMARY KEY, "propostaId" BIGINT NOT NULL, "ordem" INTEGER, "produtoId" BIGINT, "codigo" TEXT, "descricao" TEXT, "descricaoDetalhada" TEXT,
        "unidade" TEXT, "quantidade" NUMERIC(14,3), "valorLista" NUMERIC(14,2), "descontoPct" NUMERIC(8,3))`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PropostaComercialItem_prop_idx" ON "PropostaComercialItem" ("propostaId")`);
      // integracao: 'ok' (existe no Bling) | 'pendente' (so aqui, aguardando envio ao Bling)
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "integracao" TEXT NOT NULL DEFAULT 'ok'`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "integracaoMotivo" TEXT`);
      // "numero" e' a NOSSA numeracao; "blingNumero" e' o numero que o Bling deu (so referencia, pode ser diferente)
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "blingNumero" INTEGER`);
      await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "blingNumero" = "numero" WHERE "blingNumero" IS NULL AND "integracao" = 'ok' AND "id" < 8000000000000000 AND "numero" IS NOT NULL`);
      // contador da numeracao sequencial (nunca reutiliza numero reservado)
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PropostaComercialNumeracao" ("id" INTEGER PRIMARY KEY, "ultimo" INTEGER NOT NULL)`);
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS proposta_local_seq`);
      // propostas excluidas SO daqui: a sincronizacao nao deve traze-las de volta
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PropostaComercialIgnorada" ("id" BIGINT PRIMARY KEY, "excluidoEm" TIMESTAMPTZ NOT NULL DEFAULT now(), "excluidoPor" TEXT)`);
      // venda (pedido do Bling) gerada a partir da proposta: preenchido na importacao do pedido (ou por UPDATE manual)
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "pedidoNumero" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "PropostaComercial" ADD COLUMN IF NOT EXISTS "pedidoId" BIGINT`);
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
  } catch (e: any) { jobPropostas.ultimoErroCliente = `contato ${contatoId}: ${String(e?.message || e)}`; console.error(`[propostas] nao foi possivel ler o contato ${contatoId} no Bling:`, e?.message || e); }
  jobPropostas.semNomeCliente += 1;
  return '';
}

// ───────────── Sincronizacao (Bling -> local) ─────────────
export async function gravarPropostaDoBling(d: any, extra?: { criadoAqui?: boolean; criadoPor?: string; numeroNosso?: number }) {
  await garantirTabelasPropostas();
  const id = txt(d?.id);
  if (!id) throw new Error('Proposta sem id');
  // Numeracao: "numero" e' o NOSSO (independente); o do Bling vai em "blingNumero". Proposta nova vinda do Bling mantem o numero dele se estiver livre
  // na nossa sequencia (assim a importacao inicial fica igual); se ja existe aqui, recebe o proximo numero nosso. Nunca sobrescreve o nosso numero.
  const numeroBling = Math.round(num(d?.numero)) || null;
  const [existente] = await prisma.$queryRawUnsafe<any[]>(`SELECT "numero" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  let numeroNosso: number | null = existente ? (existente.numero != null ? Math.round(num(existente.numero)) : numeroBling) : (extra?.numeroNosso ?? null);
  if (!existente && numeroNosso == null) {
    const [ocupado] = numeroBling ? await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "PropostaComercial" WHERE "numero" = $1`, numeroBling) : [null];
    numeroNosso = numeroBling && !ocupado ? numeroBling : await reservarNumero();
  }
  const contatoId = txt(d?.contato?.id ?? d?.cliente?.id);
  const nomeNoDetalhe = txt(d?.contato?.nome || d?.contato?.fantasia || d?.cliente?.nome || d?.nomeContato || d?.nomeCliente);
  const clienteNome = contatoId ? await nomeDoContato(contatoId, nomeNoDetalhe) : nomeNoDetalhe;
  const situacao = txt(typeof d?.situacao === 'object' ? (d.situacao?.valor ?? d.situacao?.nome ?? d.situacao?.descricao) : d?.situacao);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PropostaComercial" ("id","numero","data","situacao","clienteId","clienteNome","aosCuidadosDe","totalProdutos","total","desconto","outrasDespesas","frete",
        "introducao","observacoes","observacaoInterna","prazoEntrega","criadoAqui","criadoPor","raw","sincronizadoEm")
     VALUES ($1::bigint,$2,$3::date,$4,$5::bigint,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
     ON CONFLICT ("id") DO UPDATE SET "numero"=COALESCE("PropostaComercial"."numero",EXCLUDED."numero"),"data"=EXCLUDED."data","situacao"=CASE WHEN "PropostaComercial"."pedidoNumero" IS NOT NULL THEN 'Concluído' ELSE EXCLUDED."situacao" END,"clienteId"=EXCLUDED."clienteId",
       "clienteNome"=COALESCE(NULLIF(EXCLUDED."clienteNome",''),"PropostaComercial"."clienteNome"),"aosCuidadosDe"=EXCLUDED."aosCuidadosDe",
       "totalProdutos"=EXCLUDED."totalProdutos","total"=EXCLUDED."total","desconto"=EXCLUDED."desconto","outrasDespesas"=EXCLUDED."outrasDespesas","frete"=EXCLUDED."frete",
       "introducao"=EXCLUDED."introducao","observacoes"=EXCLUDED."observacoes","observacaoInterna"=EXCLUDED."observacaoInterna","prazoEntrega"=EXCLUDED."prazoEntrega",
       "criadoAqui"="PropostaComercial"."criadoAqui" OR EXCLUDED."criadoAqui","criadoPor"=COALESCE("PropostaComercial"."criadoPor",EXCLUDED."criadoPor"),
       "raw"=COALESCE(EXCLUDED."raw","PropostaComercial"."raw"),"sincronizadoEm"=now()`,
    id, numeroNosso, dataIso(d?.data), situacao || null, contatoId || null, clienteNome || null, txt(d?.aosCuidadosDe) || null,
    num(d?.totalProdutos), num(d?.total), num(d?.desconto), num(d?.outrasDespesas), num(d?.transporte?.frete),
    txt(d?.introducao) || null, txt(d?.observacoes) || null, txt(d?.observacaoInterna) || null, txt(d?.prazoEntrega) || null,
    !!extra?.criadoAqui, extra?.criadoPor || null, JSON.stringify(d).slice(0, 60000),
  );
  await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "blingNumero" = $2 WHERE "id" = $1::bigint`, id, numeroBling);
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

export const jobPropostas: any = { rodando: false, total: 0, feitos: 0, erros: 0, ultimoErro: '', ultimoErroCliente: '', semNomeCliente: 0, finalizadoEm: null as string | null };

// Traz TODAS as propostas do Bling (lista paginada) e le o detalhe das novas ou que mudaram de situacao/total.
export async function sincronizarPropostas(opcoes: { tudo?: boolean } = {}) {
  await garantirTabelasPropostas();
  if (jobPropostas.rodando) return { ok: false, motivo: 'Ja existe uma sincronizacao em andamento.' };
  jobPropostas.rodando = true; Object.assign(jobPropostas, { total: 0, feitos: 0, erros: 0, ultimoErro: '', ultimoErroCliente: '', semNomeCliente: 0 });
  try {
    const lista: any[] = [];
    for (let pagina = 1; pagina <= 200; pagina++) {
      const r: any = await blingReq(`/propostas-comerciais?pagina=${pagina}&limite=100`);
      const itens: any[] = Array.isArray(r?.data) ? r.data : [];
      lista.push(...itens);
      if (itens.length < 100) break;
    }
    const ignoradas = new Set<string>((await prisma.$queryRawUnsafe<any[]>(`SELECT "id"::text AS id FROM "PropostaComercialIgnorada"`)).map((r) => String(r.id)));
    // proposta ja ligada a uma venda fica "Concluído" aqui mesmo que o Bling ainda mostre outra situacao: nao conta como mudanca
    const existentes = new Map<string, { situacao: string; total: number; versao: number; semCliente: boolean; temPedido: boolean }>(
      (await prisma.$queryRawUnsafe<any[]>(`SELECT "id"::text AS id, "situacao", "total", "itensVersao", ("clienteNome" IS NULL OR "clienteNome" = '') AS "semCliente", ("pedidoNumero" IS NOT NULL) AS "temPedido" FROM "PropostaComercial"`)).map((r) => [String(r.id), { situacao: txt(r.situacao), total: num(r.total), versao: num(r.itensVersao), semCliente: !!r.semCliente, temPedido: !!r.temPedido }]));
    const alvo = lista.filter((p) => {
      if (ignoradas.has(txt(p.id))) return false;
      const e = existentes.get(txt(p.id));
      const sit = txt(typeof p?.situacao === 'object' ? (p.situacao?.valor ?? p.situacao?.nome) : p?.situacao);
      return opcoes.tudo || !e || e.versao < 2 || e.semCliente || (sit && !e.temPedido && e.situacao !== sit) || Math.abs(e.total - num(p.total)) > 0.009;
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

// ───────────── Numeracao propria + propostas locais (pendentes de envio ao Bling) ─────────────
// Propostas que ainda nao existem no Bling recebem um id local fixo (>= 8e15, fora da faixa dos ids do Bling).
const ID_LOCAL_BASE = 8_000_000_000_000_000;
export const ehIdLocal = (id: string | number) => Number(id) >= ID_LOCAL_BASE;

// Reserva o proximo numero da sequencia (atomico): maior numero conhecido (Bling + locais) + 1, e nunca reutiliza um reservado.
async function reservarNumero(): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "PropostaComercialNumeracao" ("id","ultimo") VALUES (1, (SELECT COALESCE(MAX("numero"),0) + 1 FROM "PropostaComercial"))
     ON CONFLICT ("id") DO UPDATE SET "ultimo" = GREATEST("PropostaComercialNumeracao"."ultimo", (SELECT COALESCE(MAX("numero"),0) FROM "PropostaComercial")) + 1
     RETURNING "ultimo"`);
  return Number(r.ultimo);
}

// Propostas que ainda nao existem no Bling (aguardando envio). Sem ordem obrigatoria: o numero e' nosso, o do Bling so e' gravado ao lado.
export async function filaIntegracao() {
  await garantirTabelasPropostas();
  const pendentes = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id"::text AS id, "numero", "integracaoMotivo" AS motivo FROM "PropostaComercial" WHERE "integracao" = 'pendente' ORDER BY "numero" ASC, "id" ASC`);
  return { pendentes };
}

// ───────────── Consultas ─────────────
export async function listarPropostas(f: { busca?: string; situacao?: string; de?: string; ate?: string; pagina?: number; limite?: number }) {
  await garantirTabelasPropostas();
  const cond: string[] = []; const par: any[] = [];
  const add = (v: any) => { par.push(v); return `$${par.length}`; };
  if (txt(f.busca)) { const p = add(`%${txt(f.busca)}%`); cond.push(`(p."numero"::text ILIKE ${p} OR p."blingNumero"::text ILIKE ${p} OR p."clienteNome" ILIKE ${p} OR p."clienteNomeManual" ILIKE ${p} OR EXISTS (SELECT 1 FROM "PropostaComercialItem" i WHERE i."propostaId"=p."id" AND (i."codigo" ILIKE ${p} OR i."descricao" ILIKE ${p})))`); }
  if (txt(f.situacao) && f.situacao !== 'todas') cond.push(`p."situacao" = ${add(txt(f.situacao))}`);
  if (dataIso(f.de)) cond.push(`p."data" >= ${add(dataIso(f.de))}::date`);
  if (dataIso(f.ate)) cond.push(`p."data" <= ${add(dataIso(f.ate))}::date`);
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limite = Math.min(200, Math.max(1, Math.floor(f.limite || 50)));
  const pagina = Math.max(1, Math.floor(f.pagina || 1));
  const [tot] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n, COALESCE(SUM(p."total"),0)::float AS soma FROM "PropostaComercial" p ${where}`, ...par);
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."blingNumero", p."data"::text AS data, p."situacao", COALESCE(NULLIF(p."clienteNomeManual",''), p."clienteNome") AS "clienteNome", p."total"::float AS total, p."criadoAqui", p."integracao", p."integracaoMotivo", p."pedidoNumero", p."clienteId"::text AS "clienteId",
            (SELECT COUNT(*)::int FROM "PropostaComercialItem" i WHERE i."propostaId"=p."id") AS "qtdItens"
       FROM "PropostaComercial" p ${where} ORDER BY p."numero" DESC NULLS LAST, p."id" DESC
       OFFSET ${(pagina - 1) * limite} LIMIT ${limite}`, ...par);
  const sit = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE("situacao",'—') AS situacao, COUNT(*)::int AS n FROM "PropostaComercial" GROUP BY 1 ORDER BY 2 DESC`);
  return { itens, total: Number(tot?.n || 0), somaTotal: Number(tot?.soma || 0), pagina, limite, situacoes: sit };
}

export async function lerProposta(id: string) {
  await garantirTabelasPropostas();
  const [p] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."blingNumero", p."data"::text AS data, p."situacao", p."clienteId"::text AS "clienteId", p."clienteNome", p."aosCuidadosDe",
            p."totalProdutos"::float AS "totalProdutos", p."total"::float AS total, p."desconto"::float AS desconto, p."outrasDespesas"::float AS "outrasDespesas", p."frete"::float AS frete,
            p."introducao", p."observacoes", p."observacaoInterna", p."prazoEntrega", p."criadoAqui", p."sincronizadoEm", p."clienteNomeManual", p."integracao", p."integracaoMotivo", p."pedidoNumero"
       FROM "PropostaComercial" p WHERE p."id" = $1::bigint`, id);
  if (!p) return null;
  if (txt(p.clienteNomeManual)) p.clienteNome = txt(p.clienteNomeManual);
  if (!txt(p.clienteNome) && txt(p.clienteId)) {
    p.clienteNome = await nomeDoContato(txt(p.clienteId), '');
    if (p.clienteNome) await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "clienteNome" = $2 WHERE "id" = $1::bigint`, id, p.clienteNome).catch(() => null);
  }
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "ordem","produtoId"::text AS "produtoId","codigo","descricao","descricaoDetalhada","unidade","quantidade"::float AS quantidade,"valorLista"::float AS "valorLista","descontoPct"::float AS "descontoPct"
       FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint ORDER BY "ordem"`, id);
  return { ...p, itens };
}

// ───────────── Venda gerada a partir da proposta ─────────────
// Chamada quando um pedido de venda e' importado do Bling: procura uma proposta "Aprovado" do MESMO cliente com os MESMOS SKUs
// (data da proposta <= data do pedido) que ainda nao tenha venda; se achar, vira "Concluído" e guarda o numero do pedido.
export async function vincularPropostaAoPedido(p: { id: string; numero: string; data: string | null; clienteId: string | null; cancelado: boolean; skus: string[] }) {
  if (p.cancelado || !p.clienteId || !p.skus.length) return null;
  await garantirTabelasPropostas();
  const [ja] = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "PropostaComercial" WHERE "pedidoId" = $1::bigint`, p.id);
  if (ja) return null;
  const alvo = Array.from(new Set(p.skus.map((s) => txt(s).toUpperCase()).filter(Boolean))).sort().join('|');
  const cands = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pc."id"::text AS id, pc."numero",
            (SELECT string_agg(DISTINCT UPPER(i."codigo"), '|' ORDER BY UPPER(i."codigo")) FROM "PropostaComercialItem" i WHERE i."propostaId" = pc."id" AND COALESCE(i."codigo",'') <> '') AS skus
       FROM "PropostaComercial" pc
      WHERE pc."pedidoNumero" IS NULL AND pc."clienteId" = $1::bigint
        AND ($2::date IS NULL OR pc."data" IS NULL OR pc."data" <= $2::date)
        AND (pc."situacao" = 'Aprovado'
             -- o Bling marca a proposta como Concluído ao gerar a venda: se a sincronizacao das propostas vier antes da importacao do pedido, ainda liga (so propostas recentes)
             OR (pc."situacao" = 'Concluído' AND ($2::date IS NULL OR pc."data" >= $2::date - 30)))
      ORDER BY (pc."situacao" = 'Aprovado') DESC, pc."data" DESC NULLS LAST, pc."numero" DESC NULLS LAST`, p.clienteId, p.data);
  const achada = cands.find((c) => txt(c.skus) === alvo);
  if (!achada) return null;
  await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "situacao" = 'Concluído', "pedidoNumero" = $2, "pedidoId" = $3::bigint WHERE "id" = $1::bigint`, achada.id, txt(p.numero), p.id);
  return { propostaId: achada.id, propostaNumero: achada.numero };
}

// Dados do pedido (ja importado aqui) ligado a proposta: acha por pedidoId ou, se so o numero foi gravado (UPDATE manual), pelo numero do pedido.
export async function pedidoDaProposta(id: string) {
  await garantirTabelasPropostas();
  const [p] = await prisma.$queryRawUnsafe<any[]>(`SELECT "pedidoId"::text AS "pedidoId", "pedidoNumero" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  if (!p || (!p.pedidoId && !txt(p.pedidoNumero))) return { vinculado: false as const };
  let pedidoId = txt(p.pedidoId);
  if (!pedidoId) {
    const [b] = await prisma.$queryRawUnsafe<any[]>(`SELECT MIN("id")::text AS id FROM "BlingPedido" WHERE "numero" = $1`, txt(p.pedidoNumero));
    pedidoId = txt(b?.id);
    // guarda o id para as proximas consultas
    if (pedidoId) await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "pedidoId" = $2::bigint WHERE "id" = $1::bigint`, id, pedidoId);
  }
  const pedido = pedidoId ? await (await import('./bling-pedidos')).detalhePedido(pedidoId) : null;
  return { vinculado: true as const, pedidoNumero: txt(p.pedidoNumero), pedido };
}

// ───────────── Item: valida na NOSSA base e depois no Bling (considera variacoes de SKU: SKU, SKU-1, SKU-2...) ─────────────
const baseSku = (v: any) => txt(v).toUpperCase().replace(/-\d+$/, '');

export async function validarItemProposta(skuEntrada: string) {
  const sku = baseSku(skuEntrada);
  if (!sku) return { ok: false as const, erro: 'Informe o SKU.' };
  const [peca] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","idPeca","descricao","precoML"::float AS preco,"disponivel","emPrejuizo","sucata","dataVenda","fotoCapaArquivo" IS NOT NULL AS "temFoto"
       FROM "Peca" WHERE UPPER("idPeca") = $1`, sku);
  if (!peca) {
    // Peca ainda em pre-cadastro (nao esta no estoque nem no Bling): entra na proposta, mas a proposta fica so aqui, pendente de envio ao Bling.
    const [pre] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "idPeca","descricao","precoVenda"::float AS preco,"estoque",("fotoCapa" IS NOT NULL AND "fotoCapa" <> '') AS "temFoto","sucata","pecaRestrita" FROM "CadastroPeca" WHERE UPPER("idPeca") = $1 AND "status" = 'pre_cadastro'`, sku).catch(() => [] as any[]);
    if (pre) {
      if (pre.sucata || pre.pecaRestrita) return { ok: false as const, erro: `${sku} e sucata/peca restrita (nao entra em proposta).` };
      return {
        ok: true as const,
        item: { idPeca: txt(pre.idPeca), codigo: txt(pre.idPeca), produtoId: '', descricao: txt(pre.descricao), unidade: 'UN', valorLista: r2(num(pre.preco)), saldoBling: Math.max(1, Math.floor(num(pre.estoque)) || 1), temFoto: !!pre.temFoto, preCadastro: true },
        avisos: [`Peca em pre-cadastro (limite ${Math.max(1, Math.floor(num(pre.estoque)) || 1)} un.): a proposta sera criada so aqui e ficara pendente de envio ao Bling.`].concat(num(pre.preco) > 0 ? [] : ['Peca sem preco: informe o valor.']),
      };
    }
    return { ok: false as const, erro: `SKU ${sku} nao existe na base.` };
  }
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
      valorLista: r2(num(peca.preco)), saldoBling: saldoTotal, temFoto: !!peca.temFoto, preCadastro: false,
    },
    avisos,
  };
}

// ───────────── Busca de pecas para a proposta (estoque + pre-cadastro) ─────────────
const BASE_ITENS_SQL = `(
  SELECT p."idPeca" AS sku, p."descricao", p."precoML"::float AS preco, 'estoque' AS origem, 1 AS limite, m."marca", m."modelo", m."ano"
    FROM "Peca" p JOIN "Moto" m ON m."id" = p."motoId"
   WHERE p."disponivel" = true AND p."emPrejuizo" = false AND p."sucata" = false AND p."dataVenda" IS NULL
  UNION ALL
  SELECT c."idPeca" AS sku, c."descricao", c."precoVenda"::float AS preco, 'pre_cadastro' AS origem, GREATEST(c."estoque",1) AS limite, m."marca", m."modelo", m."ano"
    FROM "CadastroPeca" c JOIN "Moto" m ON m."id" = c."motoId"
   WHERE c."status" = 'pre_cadastro' AND c."sucata" = false AND c."pecaRestrita" = false
) t`;

export async function buscarItensProposta(f: { q?: string; marca?: string; modelo?: string; ano?: string; origem?: string; precoMin?: number; precoMax?: number; pagina?: number; limite?: number }) {
  const cond: string[] = []; const par: any[] = [];
  const add = (v: any) => { par.push(v); return `$${par.length}`; };
  // cada palavra digitada precisa aparecer no SKU, na descricao, no modelo ou na marca
  for (const w of txt(f.q).split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = add(`%${w}%`);
    cond.push(`(t.sku ILIKE ${p} OR t."descricao" ILIKE ${p} OR t."modelo" ILIKE ${p} OR t."marca" ILIKE ${p})`);
  }
  if (txt(f.marca)) cond.push(`t."marca" = ${add(txt(f.marca))}`);
  if (txt(f.modelo)) cond.push(`t."modelo" = ${add(txt(f.modelo))}`);
  if (txt(f.ano) && Number(f.ano)) cond.push(`t."ano" = ${add(Number(f.ano))}`);
  if (f.origem === 'estoque' || f.origem === 'pre_cadastro') cond.push(`t.origem = ${add(f.origem)}`);
  if (num(f.precoMin) > 0) cond.push(`t.preco >= ${add(num(f.precoMin))}`);
  if (num(f.precoMax) > 0) cond.push(`t.preco <= ${add(num(f.precoMax))}`);
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limite = Math.min(100, Math.max(1, Math.floor(f.limite || 30)));
  const pagina = Math.max(1, Math.floor(f.pagina || 1));
  const [tot] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ${BASE_ITENS_SQL} ${where}`, ...par);
  const pExato = add(txt(f.q));
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT t.sku, t."descricao", t.preco, t.origem, t.limite, t."marca", t."modelo", t."ano" FROM ${BASE_ITENS_SQL} ${where}
      ORDER BY (CASE WHEN UPPER(t.sku) = UPPER(${pExato}) THEN 0 ELSE 1 END), t."marca", t."modelo", t.sku OFFSET ${(pagina - 1) * limite} LIMIT ${limite}`, ...par);
  return { itens, total: Number(tot?.n || 0), pagina, limite };
}

// Filtros inteligentes: marcas -> modelos da marca -> anos do modelo (so o que tem peca elegivel), com contagem.
export async function filtrosItensProposta(f: { marca?: string; modelo?: string; origem?: string }) {
  const origemSql = f.origem === 'estoque' || f.origem === 'pre_cadastro' ? ` AND t.origem = '${f.origem}'` : '';
  const marcas = await prisma.$queryRawUnsafe<any[]>(`SELECT t."marca", COUNT(*)::int AS n FROM ${BASE_ITENS_SQL} WHERE true${origemSql} GROUP BY 1 ORDER BY 1`);
  const modelos = txt(f.marca) ? await prisma.$queryRawUnsafe<any[]>(`SELECT t."modelo", COUNT(*)::int AS n FROM ${BASE_ITENS_SQL} WHERE t."marca" = $1${origemSql} GROUP BY 1 ORDER BY 1`, txt(f.marca)) : [];
  const anos = txt(f.marca) && txt(f.modelo) ? await prisma.$queryRawUnsafe<any[]>(`SELECT t."ano", COUNT(*)::int AS n FROM ${BASE_ITENS_SQL} WHERE t."marca" = $1 AND t."modelo" = $2${origemSql} GROUP BY 1 ORDER BY 1 DESC`, txt(f.marca), txt(f.modelo)) : [];
  return { marcas, modelos, anos };
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
  let r: any;
  try { r = await blingReq('/contatos', { method: 'POST', body: JSON.stringify({ nome, tipo: 'F', situacao: 'A' }) }); }
  catch (e: any) { throw erroBling('Bling recusou criar o contato do cliente (POST /contatos)', e); }
  const id = txt(r?.data?.id);
  if (!id) throw new Error('O Bling nao devolveu o id do contato criado.');
  await garantirTabelasPedidos2();
  await prisma.$executeRawUnsafe(`INSERT INTO "BlingCliente" ("id","nome") VALUES ($1::bigint,$2) ON CONFLICT ("id") DO NOTHING`, id, nome).catch(() => null);
  return id;
}

// ───────────── Criar proposta (valida tudo, cria no Bling, le de volta o numero e grava local) ─────────────
export type NovaProposta = {
  clienteId?: string; clienteNome?: string; data?: string; aosCuidadosDe?: string; numero?: number;
  introducao?: string; observacoes?: string; observacaoInterna?: string; prazoEntrega?: string;
  desconto?: number; outrasDespesas?: number; frete?: number;
  itens: Array<{ codigo: string; quantidade?: number; descontoPct?: number; valorLista?: number }>;
};

type ItemValidado = { sku: string; item: any; qtd: number; lista: number; pct: number; preCadastro: boolean };

// Valida cada item (nossa base -> Bling; ou pre-cadastro) e aplica quantidade/preco/desconto informados.
async function validarItensProposta(itens: NovaProposta['itens']): Promise<ItemValidado[]> {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Inclua ao menos um item.');
  const out: ItemValidado[] = [];
  const vistos = new Set<string>();
  for (const it of itens) {
    const sku = baseSku(it.codigo);
    if (vistos.has(sku)) throw new Error(`SKU ${sku} repetido na proposta.`);
    vistos.add(sku);
    const v = await validarItemProposta(sku);
    if (!v.ok) throw new Error(v.erro);
    const qtd = Math.max(1, num(it.quantidade) || 1);
    if (qtd > v.item.saldoBling) throw new Error(v.item.preCadastro ? `${sku}: quantidade ${qtd} maior que o limite do pre-cadastro (${v.item.saldoBling}).` : `${sku}: quantidade ${qtd} maior que o saldo do Bling (${v.item.saldoBling}).`);
    const lista = num(it.valorLista) > 0 ? num(it.valorLista) : v.item.valorLista;
    if (!(lista > 0)) throw new Error(`${sku}: informe o valor da peca.`);
    out.push({ sku, item: v.item, qtd, lista, pct: Math.min(100, Math.max(0, num(it.descontoPct))), preCadastro: !!v.item.preCadastro });
  }
  return out;
}

// Resolve o cliente e monta o corpo que o Bling espera. Itens em pre-cadastro NAO podem ir ao Bling (ainda nao existem la).
async function montarCorpoProposta(dados: NovaProposta, contatoExistente?: string, validados?: ItemValidado[]) {
  const val = validados || await validarItensProposta(dados.itens);
  const itensBling: any[] = [];
  for (const v of val) {
    if (v.preCadastro) throw new Error(`${v.sku} ainda esta em pre-cadastro (nao existe no Bling): finalize o cadastro antes de enviar a proposta.`);
    itensBling.push({
      produto: { id: Number(v.item.produtoId), descricao: v.item.descricao }, codigo: v.item.codigo, unidade: 'UN',
      // GRAVACAO: o Bling quer o preco de LISTA em "valor" e aplica o "desconto" (%) sozinho. (Na LEITURA ele devolve "valor" ja
      // com desconto - por isso gravarPropostaDoBling divide por (1 - desconto) para recuperar a lista.)
      quantidade: v.qtd, valor: r2(v.lista), desconto: v.pct,
    });
  }

  let contatoId = txt(dados.clienteId) || txt(contatoExistente);
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
  return { base, totalNosso: totalDaProposta(val, dados), contatoId };
}

function totalDaProposta(val: ItemValidado[], dados: { desconto?: any; outrasDespesas?: any; frete?: any }) {
  const itens = val.reduce((t, v) => t + v.qtd * r2(v.lista * (1 - v.pct / 100)), 0);
  return r2(itens - num(dados.desconto) + num(dados.outrasDespesas) + num(dados.frete));
}

// Erro do Bling com a etapa e, se for falta de permissao, a dica do escopo (assim a tela mostra QUAL chamada foi recusada).
function erroBling(etapa: string, e: any): Error {
  const m = String(e?.message || e);
  const dica = /insufficient_scope|403/.test(m) ? ' — o aplicativo do Bling nao tem permissao para isso (habilite o escopo e reautorize a conexao).' : '';
  return new Error(`${etapa}: ${m}${dica}`);
}

// POST/PUT no Bling. O schema marca "parcelas" como obrigatorio: se recusar a lista vazia, manda 1 parcela unica (a vista) com o total.
async function enviarAoBling(metodo: 'POST' | 'PUT', path: string, base: any, totalNosso: number) {
  const etapa = `Bling recusou ${metodo === 'PUT' ? 'gravar a edicao da proposta' : 'criar a proposta'} (${metodo} ${path})`;
  try {
    return await blingReq(path, { method: metodo, body: JSON.stringify(base) });
  } catch (e: any) {
    if (!/parcela/i.test(String(e?.message || ''))) throw erroBling(etapa, e);
    try { return await blingReq(path, { method: metodo, body: JSON.stringify({ ...base, parcelas: [{ numeroDias: 0, valor: totalNosso }] }) }); }
    catch (e2: any) { throw erroBling(etapa, e2); }
  }
}

function avisoDeTotal(totalBling: number, totalNosso: number): string[] {
  return totalBling && Math.abs(totalBling - totalNosso) > 0.05
    ? [`O total no Bling (${totalBling.toFixed(2)}) difere do calculado aqui (${totalNosso.toFixed(2)}). Confira a proposta no Bling.`] : [];
}

// Grava (ou regrava) uma proposta LOCAL: ainda nao existe no Bling, tem numero reservado e fica "pendente" na fila de envio.
async function gravarPendenteLocal(idLocal: string | null, numero: number, dados: NovaProposta, val: ItemValidado[], motivo: string, usuario?: string) {
  await garantirTabelasPropostas();
  let id = idLocal;
  const clienteId = txt(dados.clienteId);
  const nomeTxt = txt(dados.clienteNome);
  const clienteNome = clienteId ? await nomeDoContato(clienteId, '') : nomeTxt;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const total = totalDaProposta(val, dados);
  const params = [numero, dataIso(dados.data) || hoje, clienteId || null, clienteNome || null, nomeTxt && !clienteId ? nomeTxt : null, txt(dados.aosCuidadosDe) || null,
    total, num(dados.desconto), num(dados.outrasDespesas), num(dados.frete), txt(dados.introducao) || null, txt(dados.observacoes) || null,
    txt(dados.observacaoInterna) || null, txt(dados.prazoEntrega) || null, motivo];
  if (!id) {
    const [r] = await prisma.$queryRawUnsafe<any[]>(`SELECT (${ID_LOCAL_BASE} + nextval('proposta_local_seq'))::text AS id`);
    id = String(r.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PropostaComercial" ("id","numero","data","situacao","clienteId","clienteNome","clienteNomeManual","aosCuidadosDe","totalProdutos","total","desconto","outrasDespesas","frete",
          "introducao","observacoes","observacaoInterna","prazoEntrega","integracao","integracaoMotivo","criadoAqui","criadoPor","itensVersao","sincronizadoEm")
       VALUES ($1::bigint,$2,$3::date,'Rascunho',$4::bigint,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,'pendente',$16,true,$17,2,now())`,
      id, numero, params[1], params[2], params[3], params[4], params[5], total, params[7], params[8], params[9], params[10], params[11], params[12], params[13], params[14], usuario || null);
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "PropostaComercial" SET "data"=$2::date,"clienteId"=$3::bigint,"clienteNome"=$4,"clienteNomeManual"=$5,"aosCuidadosDe"=$6,"totalProdutos"=$7,"total"=$7,"desconto"=$8,"outrasDespesas"=$9,"frete"=$10,
          "introducao"=$11,"observacoes"=$12,"observacaoInterna"=$13,"prazoEntrega"=$14,"integracaoMotivo"=$15,"sincronizadoEm"=now() WHERE "id"=$1::bigint`,
      id, params[1], params[2], params[3], params[4], params[5], total, params[7], params[8], params[9], params[10], params[11], params[12], params[13], params[14]);
    await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint`, id);
  }
  let ordem = 0;
  for (const v of val) {
    ordem += 1;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PropostaComercialItem" ("propostaId","ordem","produtoId","codigo","descricao","unidade","quantidade","valorLista","descontoPct") VALUES ($1::bigint,$2,$3::bigint,$4,$5,'UN',$6,$7,$8)`,
      id, ordem, v.item.produtoId ? txt(v.item.produtoId) : null, v.item.codigo, v.item.descricao, v.qtd, r2(v.lista), v.pct);
  }
  return { id, total };
}

export async function criarProposta(dados: NovaProposta, usuario?: string) {
  await garantirTabelasPropostas();
  const val = await validarItensProposta(dados.itens);
  const temPre = val.some((v) => v.preCadastro);

  // Peca em pre-cadastro: a proposta fica so aqui (com o nosso numero reservado) e e' enviada ao Bling depois, quando a peca existir la.
  if (temPre) {
    const numero = await reservarNumero();
    const motivo = `Contem peca em pre-cadastro (${val.filter((v) => v.preCadastro).map((v) => v.sku).join(', ')}): ainda nao existe no Bling.`;
    const g = await gravarPendenteLocal(null, numero, dados, val, motivo, usuario);
    return { id: g.id, numero, total: g.total, pendente: true, motivo, avisos: [] as string[] };
  }

  const { base, totalNosso } = await montarCorpoProposta(dados, undefined, val);
  const criado: any = await enviarAoBling('POST', '/propostas-comerciais', base, totalNosso);
  const id = txt(criado?.data?.id);
  if (!id) throw new Error('O Bling nao devolveu o id da proposta criada.');

  // Rascunho (padrao pedido pelo usuario) e leitura de volta: o numero do Bling fica em "blingNumero"; o NOSSO numero e' o proximo da nossa sequencia
  try { await blingReq(`/propostas-comerciais/${id}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao: 'Rascunho' }) }); } catch { /* ja nasce nessa situacao ou o Bling recusou: segue */ }
  const det: any = await blingReq(`/propostas-comerciais/${id}`);
  const numeroNosso = await reservarNumero();
  await gravarPropostaDoBling(det?.data || { id, ...base }, { criadoAqui: true, criadoPor: usuario, numeroNosso });
  const totalBling = num(det?.data?.total);
  return { id, numero: numeroNosso, blingNumero: det?.data?.numero ?? null, total: totalBling || totalNosso, avisos: avisoDeTotal(totalBling, totalNosso) };
}

// Edita uma proposta em Rascunho. Local (pendente): so atualiza aqui. No Bling: replica a edicao (PUT) e atualiza a copia local.
export async function atualizarProposta(id: string, dados: NovaProposta) {
  await garantirTabelasPropostas();
  const [atual] = await prisma.$queryRawUnsafe<any[]>(`SELECT "situacao","numero","blingNumero","integracao","clienteId"::text AS "clienteId","clienteNomeManual" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  if (!atual) throw new Error('Proposta nao encontrada.');
  if (txt(atual.situacao) !== 'Rascunho') throw new Error(`So da para editar proposta em Rascunho (esta em "${txt(atual.situacao) || 'sem situacao'}").`);

  if (ehIdLocal(id)) {
    const val = await validarItensProposta(dados.itens);
    const pre = val.filter((v) => v.preCadastro).map((v) => v.sku);
    const motivo = pre.length ? `Contem peca em pre-cadastro (${pre.join(', ')}): ainda nao existe no Bling.` : 'Aguardando envio ao Bling (o envio tem que ser sequencial).';
    const g = await gravarPendenteLocal(id, Math.round(num(atual.numero)), dados, val, motivo);
    return { id, numero: atual.numero, total: g.total, pendente: true, avisos: [] as string[] };
  }

  const { base, totalNosso } = await montarCorpoProposta(dados, txt(atual.clienteId));
  // o PUT substitui a proposta inteira: sem reenviar o numero DO BLING, ele o perde
  // (se o numero do Bling se perdeu aqui, usa o que foi informado na tela de edicao)
  const numeroEnvio = Math.round(num(atual.blingNumero) || num(dados.numero));
  if (numeroEnvio > 0) base.numero = numeroEnvio;
  await enviarAoBling('PUT', `/propostas-comerciais/${id}`, base, totalNosso);
  const det: any = await blingReq(`/propostas-comerciais/${id}`);
  await gravarPropostaDoBling(det?.data || { id, ...base });
  // cliente digitado na edicao (sem cadastro): guarda o nome na proposta
  if (!txt(dados.clienteId) && txt(dados.clienteNome)) await definirClienteProposta(id, txt(dados.clienteNome));
  const totalBling = num(det?.data?.total);
  return { id, numero: atual.numero, blingNumero: det?.data?.numero ?? null, total: totalBling || totalNosso, avisos: avisoDeTotal(totalBling, totalNosso) };
}

// Envia ao Bling uma proposta pendente. Sem ordem obrigatoria: o nosso numero ja esta reservado e o numero que o Bling der e' so gravado ao lado.
export async function enviarPropostaPendente(id: string, usuario?: string) {
  await garantirTabelasPropostas();
  const [pend] = await prisma.$queryRawUnsafe<any[]>(`SELECT "numero","integracao" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  if (!pend || pend.integracao !== 'pendente') throw new Error('Esta proposta nao esta pendente de envio ao Bling.');

  const p: any = await lerProposta(id);
  const dados: NovaProposta = {
    clienteId: p.clienteId || undefined, clienteNome: p.clienteNome || undefined, data: p.data, aosCuidadosDe: p.aosCuidadosDe || undefined,
    introducao: p.introducao || undefined, observacoes: p.observacoes || undefined, observacaoInterna: p.observacaoInterna || undefined, prazoEntrega: p.prazoEntrega || undefined,
    desconto: p.desconto, outrasDespesas: p.outrasDespesas, frete: p.frete,
    itens: (p.itens || []).map((i: any) => ({ codigo: i.codigo, quantidade: i.quantidade, valorLista: i.valorLista, descontoPct: i.descontoPct })),
  };
  let montado: Awaited<ReturnType<typeof montarCorpoProposta>>;
  try { montado = await montarCorpoProposta(dados, p.clienteId || undefined); }
  catch (e: any) {
    // continua pendente; guarda o motivo (ex.: peca ainda em pre-cadastro)
    await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "integracaoMotivo" = $2 WHERE "id" = $1::bigint`, id, String(e?.message || e)).catch(() => null);
    throw e;
  }
  const { base, totalNosso } = montado;
  const criado: any = await enviarAoBling('POST', '/propostas-comerciais', base, totalNosso);
  const novoId = txt(criado?.data?.id);
  if (!novoId) throw new Error('O Bling nao devolveu o id da proposta criada.');
  try { await blingReq(`/propostas-comerciais/${novoId}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao: 'Rascunho' }) }); } catch { /* ja nasce em Rascunho */ }
  const det: any = await blingReq(`/propostas-comerciais/${novoId}`);

  // troca a linha local (id local) pela do Bling, mantendo o NOSSO numero e o nome digitado
  const [antiga] = await prisma.$queryRawUnsafe<any[]>(`SELECT "clienteNomeManual" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint`, id);
  await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
  await gravarPropostaDoBling(det?.data || { id: novoId, ...base }, { criadoAqui: true, criadoPor: usuario, numeroNosso: Math.round(num(pend.numero)) });
  if (txt(antiga?.clienteNomeManual)) await definirClienteProposta(novoId, txt(antiga.clienteNomeManual));
  return { id: novoId, numero: Math.round(num(pend.numero)), blingNumero: det?.data?.numero ?? null, avisos: avisoDeTotal(num(det?.data?.total), totalNosso) };
}

// Cliente preenchido/corrigido aqui na proposta (vale mesmo sem cadastro no Bling ou na base); aparece na lista e no PDF.
export async function definirClienteProposta(id: string, nome: string) {
  await garantirTabelasPropostas();
  await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "clienteNomeManual" = NULLIF($2,'') WHERE "id" = $1::bigint`, id, txt(nome));
}

// JSON cru do Bling (diagnostico) - le direto do Bling, sem gravar
export async function propostaBrutaDoBling(id: string) { return blingReq(`/propostas-comerciais/${id}`); }

// Exclui a proposta. modo "local": so daqui (e a sincronizacao passa a ignorar essa proposta); modo "bling": no Bling e daqui.
export async function excluirProposta(id: string, modo: 'local' | 'bling', usuario?: string) {
  await garantirTabelasPropostas();
  if (ehIdLocal(id)) {
    // proposta que so existe aqui (pendente): sai direto; o numero so e' devolvido se era o maior reservado (senao fica um buraco na nossa sequencia)
    const [p] = await prisma.$queryRawUnsafe<any[]>(`SELECT "numero" FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
    if (!p) throw new Error('Proposta nao encontrada.');
    await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
    const [maior] = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX("numero"),0) AS m FROM "PropostaComercial"`);
    await prisma.$executeRawUnsafe(`UPDATE "PropostaComercialNumeracao" SET "ultimo" = $1 WHERE "id" = 1 AND "ultimo" = $2`, num(maior?.m), num(p.numero));
    return;
  }
  if (modo === 'bling') {
    try { await blingReq(`/propostas-comerciais/${id}`, { method: 'DELETE' }); }
    catch (e: any) { throw erroBling(`Bling recusou excluir a proposta (DELETE /propostas-comerciais/${id})`, e); }
  } else {
    await prisma.$executeRawUnsafe(`INSERT INTO "PropostaComercialIgnorada" ("id","excluidoPor") VALUES ($1::bigint,$2) ON CONFLICT ("id") DO NOTHING`, id, usuario || null);
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercialItem" WHERE "propostaId" = $1::bigint`, id);
  await prisma.$executeRawUnsafe(`DELETE FROM "PropostaComercial" WHERE "id" = $1::bigint`, id);
}

export async function alterarSituacaoProposta(id: string, situacao: string) {
  if (!SITUACOES_PROPOSTA.includes(situacao)) throw new Error('Situacao invalida.');
  if (ehIdLocal(id)) throw new Error('Esta proposta ainda nao existe no Bling (pendente de envio). Envie-a ao Bling antes de mudar a situacao.');
  try { await blingReq(`/propostas-comerciais/${id}/situacoes`, { method: 'PATCH', body: JSON.stringify({ situacao }) }); }
  catch (e: any) { throw erroBling(`Bling recusou mudar a situacao (PATCH /propostas-comerciais/${id}/situacoes)`, e); }
  await prisma.$executeRawUnsafe(`UPDATE "PropostaComercial" SET "situacao" = $2, "sincronizadoEm" = now() WHERE "id" = $1::bigint`, id, situacao);
}
