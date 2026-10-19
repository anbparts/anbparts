// Pedidos e Clientes do Bling guardados no nosso banco (paginas Bling ERP > Pedidos / Clientes).
// Fonte: detalhe de cada pedido (/pedidos/vendas/{id}) e cadastro do contato (/contatos/{id}). Tabelas criadas sob demanda (sem migration):
//   "BlingPedido", "BlingPedidoItem", "BlingCliente", "BlingCanalVenda".
// Carga inicial: os IDs de pedido que ja estao nas pecas (blingPedidoId). Depois, uma rotina periodica traz os pedidos recentes
// (e atualiza a situacao dos que mudaram). A chamada ao Bling passa pelo controle global de limite (3 req/s).
import { prisma } from './prisma';
import { blingReq, classifyOrderSituation, listPedidos } from '../routes/bling';

const txt = (v: any) => String(v ?? '').trim();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tabelasProntas: Promise<void> | null = null;
export function garantirTabelasPedidos(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BlingPedido" (
        "id" BIGINT PRIMARY KEY, "numero" TEXT, "numeroLoja" TEXT, "data" DATE,
        "situacaoId" INTEGER, "situacao" TEXT, "cancelado" BOOLEAN NOT NULL DEFAULT false,
        "canalId" BIGINT, "canal" TEXT, "clienteId" BIGINT, "clienteNome" TEXT,
        "totalProdutos" NUMERIC(14,2), "total" NUMERIC(14,2), "frete" NUMERIC(14,2), "desconto" NUMERIC(14,2), "taxaComissao" NUMERIC(14,2),
        "entregaCidade" TEXT, "entregaUf" TEXT, "entregaCep" TEXT, "entregaEndereco" TEXT, "observacoes" TEXT,
        "sincronizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlingPedido_data_idx" ON "BlingPedido" ("data")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlingPedido_cliente_idx" ON "BlingPedido" ("clienteId")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BlingPedidoItem" (
        "id" SERIAL PRIMARY KEY, "pedidoId" BIGINT NOT NULL, "sku" TEXT, "descricao" TEXT,
        "quantidade" NUMERIC(14,3), "valor" NUMERIC(14,2), "total" NUMERIC(14,2))`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlingPedidoItem_pedido_idx" ON "BlingPedidoItem" ("pedidoId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlingPedidoItem_sku_idx" ON "BlingPedidoItem" ("sku")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BlingCliente" (
        "id" BIGINT PRIMARY KEY, "nome" TEXT, "tipoPessoa" TEXT, "documento" TEXT, "email" TEXT, "telefone" TEXT, "celular" TEXT,
        "cidade" TEXT, "uf" TEXT, "cep" TEXT, "endereco" TEXT, "bairro" TEXT,
        "enriquecidoEm" TIMESTAMPTZ, "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BlingCanalVenda" ("id" BIGINT PRIMARY KEY, "nome" TEXT, "tipo" TEXT)`);
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

// ───────────── Sincronizacao ─────────────
export const jobPedidos: any = {
  rodando: false, fase: '', total: 0, feitos: 0, erros: 0, iniciadoEm: null as string | null, finalizadoEm: null as string | null, ultimoErro: '', modo: '',
};

let canaisCache: Map<number, { nome: string; tipo: string }> | null = null;
async function carregarCanais(forcar = false) {
  if (canaisCache && !forcar) return canaisCache;
  const mapa = new Map<number, { nome: string; tipo: string }>();
  try {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r: any = await blingReq(`/canais-venda?pagina=${pagina}&limite=100`);
      const lista: any[] = Array.isArray(r?.data) ? r.data : [];
      for (const c of lista) {
        const id = num(c?.id);
        if (!id) continue;
        mapa.set(id, { nome: txt(c?.descricao) || txt(c?.nome) || `Loja ${id}`, tipo: txt(c?.tipo) });
      }
      if (lista.length < 100) break;
    }
    for (const [id, c] of Array.from(mapa.entries())) {
      await prisma.$executeRawUnsafe(`INSERT INTO "BlingCanalVenda" ("id","nome","tipo") VALUES ($1::bigint,$2,$3) ON CONFLICT ("id") DO UPDATE SET "nome"=EXCLUDED."nome","tipo"=EXCLUDED."tipo"`, String(id), c.nome, c.tipo);
    }
  } catch (e: any) {
    // sem a lista de canais: usa o que ja estava gravado
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","nome","tipo" FROM "BlingCanalVenda"`).catch(() => [] as any[]);
    for (const r of rows) mapa.set(Number(r.id), { nome: txt(r.nome), tipo: txt(r.tipo) });
  }
  canaisCache = mapa;
  return mapa;
}

// Le o pedido no Bling e grava pedido + itens (+ cliente basico). Devolve o id do cliente (se houver).
export async function sincronizarPedido(pedidoId: number | string) {
  await garantirTabelasPedidos();
  const resp: any = await blingReq(`/pedidos/vendas/${pedidoId}`);
  const d = resp?.data;
  if (!d?.id) throw new Error(`Pedido ${pedidoId} sem dados`);
  const canais = await carregarCanais();
  const sit = classifyOrderSituation(d);
  const situacaoId = num(d?.situacao?.id) || (sit.ids && sit.ids[0]) || null;
  const lojaId = num(d?.loja?.id);
  const canal = lojaId ? (canais.get(lojaId)?.nome || `Loja ${lojaId}`) : 'Manual';
  const etq = d?.transporte?.etiqueta || {};
  const contato = d?.contato || {};
  const clienteId = num(contato?.id) || null;
  const descontoRaw = num(d?.desconto?.valor);
  const totalProdutos = num(d?.totalProdutos);
  const desconto = String(d?.desconto?.unidade || '').toUpperCase() === 'PERCENTUAL' ? Math.round(totalProdutos * (descontoRaw / 100) * 100) / 100 : descontoRaw;
  const enderecoEntrega = [txt(etq?.endereco), txt(etq?.numero), txt(etq?.complemento), txt(etq?.bairro)].filter(Boolean).join(', ');

  await prisma.$executeRawUnsafe(
    `INSERT INTO "BlingPedido" ("id","numero","numeroLoja","data","situacaoId","situacao","cancelado","canalId","canal","clienteId","clienteNome",
       "totalProdutos","total","frete","desconto","taxaComissao","entregaCidade","entregaUf","entregaCep","entregaEndereco","observacoes","sincronizadoEm")
     VALUES ($1::bigint,$2,$3,$4::date,$5,$6,$7,$8::bigint,$9,$10::bigint,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
     ON CONFLICT ("id") DO UPDATE SET "numero"=EXCLUDED."numero","numeroLoja"=EXCLUDED."numeroLoja","data"=EXCLUDED."data","situacaoId"=EXCLUDED."situacaoId",
       "situacao"=EXCLUDED."situacao","cancelado"=EXCLUDED."cancelado","canalId"=EXCLUDED."canalId","canal"=EXCLUDED."canal","clienteId"=EXCLUDED."clienteId",
       "clienteNome"=EXCLUDED."clienteNome","totalProdutos"=EXCLUDED."totalProdutos","total"=EXCLUDED."total","frete"=EXCLUDED."frete","desconto"=EXCLUDED."desconto",
       "taxaComissao"=EXCLUDED."taxaComissao","entregaCidade"=EXCLUDED."entregaCidade","entregaUf"=EXCLUDED."entregaUf","entregaCep"=EXCLUDED."entregaCep",
       "entregaEndereco"=EXCLUDED."entregaEndereco","observacoes"=EXCLUDED."observacoes","sincronizadoEm"=now()`,
    String(d.id), txt(d.numero) || String(d.id), txt(d.numeroLoja) || null, (txt(d.data) || '').slice(0, 10) || null,
    situacaoId, sit.label, !!sit.isCancelado, lojaId ? String(lojaId) : null, canal, clienteId ? String(clienteId) : null, txt(contato?.nome) || null,
    totalProdutos, num(d?.total), num(d?.transporte?.frete), desconto, num(d?.taxas?.taxaComissao),
    txt(etq?.municipio) || null, txt(etq?.uf) || null, txt(etq?.cep) || null, enderecoEntrega || null, txt(d?.observacoes) || null,
  );

  await prisma.$executeRawUnsafe(`DELETE FROM "BlingPedidoItem" WHERE "pedidoId" = $1::bigint`, String(d.id));
  for (const it of Array.isArray(d?.itens) ? d.itens : []) {
    const qtd = num(it?.quantidade) || 1;
    const valor = num(it?.valor ?? it?.valorUnitario);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BlingPedidoItem" ("pedidoId","sku","descricao","quantidade","valor","total") VALUES ($1::bigint,$2,$3,$4,$5,$6)`,
      String(d.id), txt(it?.codigo || it?.produto?.codigo) || null, txt(it?.descricao || it?.produto?.nome) || null, qtd, valor, Math.round(qtd * valor * 100) / 100,
    );
  }

  if (clienteId) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BlingCliente" ("id","nome","tipoPessoa","documento","cidade","uf","cep") VALUES ($1::bigint,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("id") DO UPDATE SET "nome"=COALESCE(NULLIF(EXCLUDED."nome",''),"BlingCliente"."nome"),
         "documento"=COALESCE(NULLIF(EXCLUDED."documento",''),"BlingCliente"."documento"),
         "cidade"=COALESCE("BlingCliente"."cidade",EXCLUDED."cidade"),"uf"=COALESCE("BlingCliente"."uf",EXCLUDED."uf"),"cep"=COALESCE("BlingCliente"."cep",EXCLUDED."cep")`,
      String(clienteId), txt(contato?.nome) || null, txt(contato?.tipoPessoa) || null, txt(contato?.numeroDocumento).replace(/\D/g, '') || null,
      txt(etq?.municipio) || null, txt(etq?.uf) || null, txt(etq?.cep) || null,
    );
  }
  return clienteId;
}

// Completa o cadastro do cliente (email, telefones, endereco) a partir do contato do Bling.
export async function enriquecerCliente(clienteId: number | string) {
  const r: any = await blingReq(`/contatos/${clienteId}`);
  const c = r?.data;
  if (!c) throw new Error('contato sem dados');
  const end = c?.endereco?.geral || {};
  await prisma.$executeRawUnsafe(
    `UPDATE "BlingCliente" SET "nome"=COALESCE(NULLIF($2,''),"nome"), "tipoPessoa"=COALESCE(NULLIF($3,''),"tipoPessoa"), "documento"=COALESCE(NULLIF($4,''),"documento"),
       "email"=NULLIF($5,''), "telefone"=NULLIF($6,''), "celular"=NULLIF($7,''), "cidade"=COALESCE(NULLIF($8,''),"cidade"), "uf"=COALESCE(NULLIF($9,''),"uf"),
       "cep"=COALESCE(NULLIF($10,''),"cep"), "endereco"=NULLIF($11,''), "bairro"=NULLIF($12,''), "enriquecidoEm"=now() WHERE "id"=$1::bigint`,
    String(clienteId), txt(c?.nome), txt(c?.tipo), txt(c?.numeroDocumento).replace(/\D/g, ''), txt(c?.email), txt(c?.telefone), txt(c?.celular),
    txt(end?.municipio), txt(end?.uf), txt(end?.cep), [txt(end?.endereco), txt(end?.numero), txt(end?.complemento)].filter(Boolean).join(', '), txt(end?.bairro),
  );
}

async function enriquecerPendentes(limite: number) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id"::text AS id FROM "BlingCliente" WHERE "enriquecidoEm" IS NULL ORDER BY "id" ASC LIMIT ${Math.max(1, Math.floor(limite))}`);
  let feitos = 0;
  for (const r of rows) {
    try { await enriquecerCliente(r.id); } catch (e: any) {
      // marca como tentado pra nao travar a fila (contato apagado/sem permissao); da pra reprocessar depois
      await prisma.$executeRawUnsafe(`UPDATE "BlingCliente" SET "enriquecidoEm" = now() WHERE "id" = $1::bigint`, String(r.id));
      if (/renovar token|Reconecte/i.test(String(e?.message))) throw e;
    }
    feitos += 1;
    if (jobPedidos.rodando) jobPedidos.feitos += 1;
  }
  return feitos;
}

// Carga inicial: todos os pedidos que ja aparecem nas pecas e ainda nao estao na tabela, depois os clientes.
export async function iniciarCargaHistorica(opcoes: { reprocessar?: boolean } = {}) {
  if (jobPedidos.rodando) return { ok: false, jaRodando: true };
  await garantirTabelasPedidos();
  const ids = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT p."blingPedidoId" AS id FROM "Peca" p WHERE p."blingPedidoId" IS NOT NULL AND p."blingPedidoId" ~ '^[0-9]+$'
       ${opcoes.reprocessar ? '' : `AND NOT EXISTS (SELECT 1 FROM "BlingPedido" b WHERE b."id" = p."blingPedidoId"::bigint)`}
     ORDER BY 1`,
  );
  Object.assign(jobPedidos, { rodando: true, modo: 'historico', fase: 'pedidos', total: ids.length, feitos: 0, erros: 0, iniciadoEm: new Date().toISOString(), finalizadoEm: null, ultimoErro: '' });
  void (async () => {
    try {
      await carregarCanais(true);
      for (const r of ids) {
        try { await sincronizarPedido(String(r.id)); } catch (e: any) {
          jobPedidos.erros += 1; jobPedidos.ultimoErro = `${r.id}: ${String(e?.message || e).slice(0, 200)}`;
          if (/renovar token|Reconecte/i.test(String(e?.message))) throw e;
        }
        jobPedidos.feitos += 1;
      }
      const pend = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "BlingCliente" WHERE "enriquecidoEm" IS NULL`);
      Object.assign(jobPedidos, { fase: 'clientes', total: Number(pend[0]?.n || 0), feitos: 0 });
      while (true) {
        const n = await enriquecerPendentes(50);
        if (n < 50) break;
      }
    } catch (e: any) {
      jobPedidos.ultimoErro = String(e?.message || e).slice(0, 300);
    } finally {
      Object.assign(jobPedidos, { rodando: false, fase: '', finalizadoEm: new Date().toISOString() });
    }
  })();
  return { ok: true, total: ids.length };
}

// Pedidos de um periodo (todos, mesmo sem peca vinculada): traz os novos e atualiza a situacao dos que mudaram.
export async function sincronizarPeriodo(de: string, ate: string) {
  await garantirTabelasPedidos();
  const lista: any[] = await listPedidos(de, ate) as any;
  const arr: Array<{ id: number; situacao: any }> = Array.isArray(lista) ? lista : Array.from((lista as any)?.values?.() || []);
  const existentes = new Map<string, string>((await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id"::text AS id, "situacao" FROM "BlingPedido" WHERE "id" = ANY($1::bigint[])`, arr.map((p) => String(p.id)),
  )).map((r) => [String(r.id), txt(r.situacao)]));
  let novos = 0;
  let atualizados = 0;
  for (const p of arr) {
    const atual = existentes.get(String(p.id));
    const label = txt(p.situacao?.label);
    if (atual === undefined) {
      await sincronizarPedido(String(p.id)); novos += 1;
    } else if (label && atual !== label) {
      await sincronizarPedido(String(p.id)); atualizados += 1;
    }
  }
  return { encontrados: arr.length, novos, atualizados };
}

export async function sincronizarRecentes(dias = 3) {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hoje = new Date();
  const de = fmt(new Date(hoje.getTime() - dias * 86400000));
  const r = await sincronizarPeriodo(de, fmt(hoje));
  const enriquecidos = await enriquecerPendentes(15);
  return { ...r, enriquecidos };
}

let schedulerRodando = false;
export function startBlingPedidosScheduler() {
  const tick = async () => {
    if (schedulerRodando || jobPedidos.rodando) return;
    schedulerRodando = true;
    try { await sincronizarRecentes(3); } catch (e: any) { console.error('[bling-pedidos] sincronizacao periodica falhou:', e?.message || e); }
    finally { schedulerRodando = false; }
  };
  setTimeout(() => { void tick(); }, 4 * 60 * 1000);
  setInterval(() => { void tick(); }, 10 * 60 * 1000);
}

// ───────────── Consultas das paginas ─────────────
export async function listarPedidos(f: { busca?: string; situacao?: string; canal?: string; de?: string; ate?: string; pagina?: number; limite?: number }) {
  await garantirTabelasPedidos();
  const params: any[] = [];
  const cond: string[] = [];
  if (txt(f.busca)) {
    params.push(`%${txt(f.busca)}%`);
    const i = params.length;
    cond.push(`(p."numero" ILIKE $${i} OR p."numeroLoja" ILIKE $${i} OR p."clienteNome" ILIKE $${i} OR EXISTS (SELECT 1 FROM "BlingPedidoItem" it WHERE it."pedidoId" = p."id" AND (it."sku" ILIKE $${i} OR it."descricao" ILIKE $${i})))`);
  }
  if (f.situacao && f.situacao !== 'todas') {
    if (f.situacao === 'cancelado') cond.push(`p."cancelado" = true`);
    else if (f.situacao === 'ativos') cond.push(`p."cancelado" = false`);
    else { params.push(f.situacao); cond.push(`p."situacao" = $${params.length}`); }
  }
  if (f.canal && f.canal !== 'todos') { params.push(f.canal); cond.push(`p."canal" = $${params.length}`); }
  if (f.de) { params.push(f.de); cond.push(`p."data" >= $${params.length}::date`); }
  if (f.ate) { params.push(f.ate); cond.push(`p."data" <= $${params.length}::date`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limite = Math.min(200, Math.max(1, Number(f.limite) || 50));
  const offset = (Math.max(1, Number(f.pagina) || 1) - 1) * limite;

  const resumo = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE p."cancelado" = false)::int AS ativos, COALESCE(SUM(CASE WHEN p."cancelado" THEN 0 ELSE p."total" END),0) AS soma FROM "BlingPedido" p ${where}`, ...params,
  );
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."numeroLoja", p."data"::text AS data, p."situacao", p."cancelado", p."canal", p."clienteId"::text AS "clienteId", p."clienteNome",
            p."total", p."frete", p."entregaCidade", p."entregaUf",
            (SELECT COALESCE(SUM(it."quantidade"),0) FROM "BlingPedidoItem" it WHERE it."pedidoId" = p."id") AS pecas,
            (SELECT string_agg(DISTINCT it."sku", ', ') FROM "BlingPedidoItem" it WHERE it."pedidoId" = p."id") AS skus
     FROM "BlingPedido" p ${where} ORDER BY p."data" DESC NULLS LAST, p."id" DESC LIMIT ${limite} OFFSET ${offset}`, ...params,
  );
  const canais = await prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT "canal" FROM "BlingPedido" WHERE "canal" IS NOT NULL ORDER BY 1`);
  const situacoes = await prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT "situacao" FROM "BlingPedido" WHERE "situacao" IS NOT NULL ORDER BY 1`);
  return {
    total: Number(resumo[0]?.n || 0), ativos: Number(resumo[0]?.ativos || 0), soma: num(resumo[0]?.soma), pagina: Math.max(1, Number(f.pagina) || 1), limite,
    itens: itens.map((r) => ({ ...r, total: num(r.total), frete: num(r.frete), pecas: num(r.pecas) })),
    canais: canais.map((c) => String(c.canal)), situacoes: situacoes.map((s) => String(s.situacao)),
  };
}

export async function detalhePedido(id: string) {
  await garantirTabelasPedidos();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT p.*, p."id"::text AS id_txt, p."data"::text AS data_txt, p."clienteId"::text AS cliente_txt FROM "BlingPedido" p WHERE p."id" = $1::bigint`, id);
  if (!rows.length) return null;
  const p = rows[0];
  const itens = await prisma.$queryRawUnsafe<any[]>(`SELECT "sku","descricao","quantidade","valor","total" FROM "BlingPedidoItem" WHERE "pedidoId" = $1::bigint ORDER BY "id" ASC`, id);
  const cliente = p.clienteId ? (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BlingCliente" WHERE "id" = $1::bigint`, String(p.clienteId)))[0] || null : null;
  return {
    id: p.id_txt, numero: p.numero, numeroLoja: p.numeroLoja, data: p.data_txt, situacao: p.situacao, cancelado: p.cancelado, canal: p.canal,
    clienteId: p.cliente_txt, clienteNome: p.clienteNome, totalProdutos: num(p.totalProdutos), total: num(p.total), frete: num(p.frete), desconto: num(p.desconto),
    taxaComissao: num(p.taxaComissao), entrega: { cidade: p.entregaCidade, uf: p.entregaUf, cep: p.entregaCep, endereco: p.entregaEndereco }, observacoes: p.observacoes,
    itens: itens.map((i) => ({ sku: i.sku, descricao: i.descricao, quantidade: num(i.quantidade), valor: num(i.valor), total: num(i.total) })),
    cliente: cliente ? { id: String(cliente.id), nome: cliente.nome, documento: cliente.documento, email: cliente.email, telefone: cliente.telefone, celular: cliente.celular, cidade: cliente.cidade, uf: cliente.uf } : null,
  };
}

export async function listarClientes(f: { busca?: string; filtro?: string; ordem?: string; pagina?: number; limite?: number }) {
  await garantirTabelasPedidos();
  const params: any[] = [];
  const condBusca = txt(f.busca) ? (params.push(`%${txt(f.busca)}%`), `AND (c."nome" ILIKE $1 OR c."documento" ILIKE $1 OR c."email" ILIKE $1 OR c."cidade" ILIKE $1 OR c."celular" ILIKE $1 OR c."telefone" ILIKE $1)`) : '';
  const base = `
    WITH ped AS (
      SELECT p."clienteId", COUNT(*)::int AS pedidos, SUM(p."total") AS total, MIN(p."data") AS primeira, MAX(p."data") AS ultima,
             array_agg(DISTINCT p."canal") FILTER (WHERE p."canal" IS NOT NULL) AS canais
      FROM "BlingPedido" p WHERE p."cancelado" = false AND p."clienteId" IS NOT NULL GROUP BY p."clienteId"
    ), pec AS (
      SELECT p."clienteId", SUM(i."quantidade") AS pecas
      FROM "BlingPedido" p JOIN "BlingPedidoItem" i ON i."pedidoId" = p."id" WHERE p."cancelado" = false AND p."clienteId" IS NOT NULL GROUP BY p."clienteId"
    )
    SELECT c."id"::text AS id, c."nome", c."documento", c."tipoPessoa", c."email", c."telefone", c."celular", c."cidade", c."uf",
           ped.pedidos, COALESCE(pec.pecas, 0) AS pecas, ped.total, ped.primeira::text AS primeira, ped.ultima::text AS ultima, ped.canais,
           CASE WHEN ped.pedidos > 1 THEN ROUND((ped.ultima - ped.primeira)::numeric / (ped.pedidos - 1), 0) ELSE NULL END AS frequencia_dias,
           (CURRENT_DATE - ped.ultima) AS dias_sem_comprar
    FROM "BlingCliente" c JOIN ped ON ped."clienteId" = c."id" LEFT JOIN pec ON pec."clienteId" = c."id"
    WHERE 1=1 ${condBusca}`;
  let filtroSql = '';
  if (f.filtro === 'recorrentes') filtroSql = 'WHERE x.pedidos >= 2';
  else if (f.filtro === 'unica') filtroSql = 'WHERE x.pedidos = 1';
  else if (f.filtro === 'inativos') filtroSql = 'WHERE x.dias_sem_comprar > 180';
  const ordens: Record<string, string> = {
    total: 'x.total DESC NULLS LAST', pedidos: 'x.pedidos DESC, x.total DESC', pecas: 'x.pecas DESC, x.total DESC',
    ultima: 'x.ultima DESC NULLS LAST', nome: 'x.nome ASC', frequencia: 'x.frequencia_dias ASC NULLS LAST',
  };
  const ordem = ordens[String(f.ordem || 'total')] || ordens.total;
  const limite = Math.min(200, Math.max(1, Number(f.limite) || 50));
  const offset = (Math.max(1, Number(f.pagina) || 1) - 1) * limite;
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM (${base}) x ${filtroSql} ORDER BY ${ordem} LIMIT ${limite} OFFSET ${offset}`, ...params);
  const resumo = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE x.pedidos >= 2)::int AS recorrentes, COALESCE(SUM(x.total),0) AS receita, COALESCE(SUM(x.pecas),0) AS pecas
     FROM (${base}) x ${filtroSql}`, ...params,
  );
  return {
    total: Number(resumo[0]?.n || 0), recorrentes: Number(resumo[0]?.recorrentes || 0), receita: num(resumo[0]?.receita), pecas: num(resumo[0]?.pecas),
    pagina: Math.max(1, Number(f.pagina) || 1), limite,
    itens: rows.map((r) => ({
      id: r.id, nome: r.nome, documento: r.documento, tipoPessoa: r.tipoPessoa, email: r.email, telefone: r.telefone, celular: r.celular, cidade: r.cidade, uf: r.uf,
      pedidos: Number(r.pedidos), pecas: num(r.pecas), total: num(r.total), primeira: r.primeira, ultima: r.ultima, canais: r.canais || [],
      frequenciaDias: r.frequencia_dias != null ? Number(r.frequencia_dias) : null, diasSemComprar: r.dias_sem_comprar != null ? Number(r.dias_sem_comprar) : null,
    })),
  };
}

export async function detalheCliente(id: string) {
  await garantirTabelasPedidos();
  const c = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BlingCliente" WHERE "id" = $1::bigint`, id))[0];
  if (!c) return null;
  const pedidos = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."id"::text AS id, p."numero", p."data"::text AS data, p."situacao", p."cancelado", p."canal", p."total" FROM "BlingPedido" p WHERE p."clienteId" = $1::bigint ORDER BY p."data" DESC, p."id" DESC`, id,
  );
  const itens = await prisma.$queryRawUnsafe<any[]>(
    `SELECT i."pedidoId"::text AS "pedidoId", i."sku", i."descricao", i."quantidade", i."valor", i."total" FROM "BlingPedidoItem" i JOIN "BlingPedido" p ON p."id" = i."pedidoId" WHERE p."clienteId" = $1::bigint ORDER BY i."id" ASC`, id,
  );
  const porPedido = new Map<string, any[]>();
  for (const i of itens) { const l = porPedido.get(i.pedidoId) || []; l.push({ sku: i.sku, descricao: i.descricao, quantidade: num(i.quantidade), valor: num(i.valor), total: num(i.total) }); porPedido.set(i.pedidoId, l); }
  return {
    cliente: { id: String(c.id), nome: c.nome, tipoPessoa: c.tipoPessoa, documento: c.documento, email: c.email, telefone: c.telefone, celular: c.celular, cidade: c.cidade, uf: c.uf, cep: c.cep, endereco: c.endereco, bairro: c.bairro },
    pedidos: pedidos.map((p) => ({ ...p, total: num(p.total), itens: porPedido.get(p.id) || [] })),
  };
}

export async function statusSincronizacao() {
  await garantirTabelasPedidos();
  const r = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS pedidos, MAX("sincronizadoEm") AS ultima, MIN("data")::text AS desde FROM "BlingPedido"`);
  const c = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS clientes, COUNT(*) FILTER (WHERE "enriquecidoEm" IS NULL)::int AS pendentes FROM "BlingCliente"`);
  const semPedido = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(DISTINCT p."blingPedidoId")::int AS n FROM "Peca" p WHERE p."blingPedidoId" ~ '^[0-9]+$' AND NOT EXISTS (SELECT 1 FROM "BlingPedido" b WHERE b."id" = p."blingPedidoId"::bigint)`,
  ).catch(() => [{ n: 0 }]);
  return {
    pedidos: Number(r[0]?.pedidos || 0), ultimaSincronizacao: r[0]?.ultima || null, pedidoMaisAntigo: r[0]?.desde || null,
    clientes: Number(c[0]?.clientes || 0), clientesSemDetalhe: Number(c[0]?.pendentes || 0), pedidosDasPecasPendentes: Number(semPedido[0]?.n || 0),
    job: { ...jobPedidos },
  };
}
