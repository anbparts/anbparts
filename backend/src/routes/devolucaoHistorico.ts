// Estoque > Devolucoes: historico de cancelamentos/devolucoes + lista padronizada de motivos (tipos de devolucao).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { garantirTabelasDevolucao, completarCanais, registrarDevolucoes } from '../lib/devolucao-historico';
import { garantirTabelaRevisao } from '../lib/pecas-revisao';
import { loadBlingVendaInfo } from './etiquetas-detran';

// Situacao ATUAL da peca (nao a da epoca da devolucao): em revisao, prejuizo, em estoque, vendida de novo ou sem peca no sistema
const JOINS_STATUS = `LEFT JOIN "Peca" pc ON pc."id" = d."pecaId" LEFT JOIN "PecaEmRevisao" rv ON rv."pecaId" = d."pecaId"`;
const STATUS_ATUAL = `(CASE WHEN pc."id" IS NULL THEN 'sem_peca' WHEN rv."status" = 'em_revisao' THEN 'em_revisao' WHEN pc."emPrejuizo" THEN 'prejuizo' WHEN pc."disponivel" THEN 'estoque' ELSE 'vendida' END)`;

export const devolucaoHistoricoRouter = Router();

const usuario = (req: any) => String(req.authUser?.username || '').trim() || null;

function ehAdmin(req: any) {
  const user = req.authUser || {};
  return Boolean(user.isAdmin) || String(user.username || '').trim().toLowerCase() === 'bruno';
}
function temAcaoEm(req: any, chave: string, acoes: string[]) {
  const lista = req.authUser?.permissions?.[chave];
  return Array.isArray(lista) && acoes.some((a) => lista.includes(a));
}
// quem pode corrigir motivo/observacao e mexer na lista de motivos
function podeEditar(req: any) {
  return ehAdmin(req) || temAcaoEm(req, 'estoque', ['editar', 'devolucoes']) || temAcaoEm(req, 'pendencias', ['revisar']) || temAcaoEm(req, 'pendente_recebimento', ['revisar']);
}
function exigirEdicao(req: any, res: any, next: any) {
  if (podeEditar(req)) return next();
  return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para alterar devolucoes.' });
}

devolucaoHistoricoRouter.use(async (_req, _res, next) => {
  try { await garantirTabelasDevolucao(); next(); } catch (e) { next(e); }
});

const num = (v: any) => Number(v || 0);
const dataOk = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// GET /devolucoes-historico?busca=&de=&ate=&canal=&motivo=&origem=&page=&per=
devolucaoHistoricoRouter.get('/', async (req, res, next) => {
  try {
    await completarCanais();
    await garantirTabelaRevisao();
    try { await (await import('../lib/bling-pedidos')).garantirTabelasPedidos(); } catch { /* sem pedidos locais */ }
    const q = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    const add = (sql: string, v: any) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    const busca = String(q.busca || '').trim();
    if (busca) {
      params.push(`%${busca}%`);
      const p = `$${params.length}`;
      where.push(`(d."idPeca" ILIKE ${p} OR d."descricao" ILIKE ${p} OR d."pedidoNum" ILIKE ${p} OR d."motoNome" ILIKE ${p} OR d."motoLabel" ILIKE ${p})`);
    }
    if (dataOk(q.de)) add(`d."dataDevolucao" >= ?::date`, q.de);
    if (dataOk(q.ate)) add(`d."dataDevolucao" <= ?::date`, q.ate);
    if (q.canal) add(`d."canal" = ?`, String(q.canal));
    if (q.origem) add(`d."origem" = ?`, String(q.origem));
    if (q.motivo === 'sem') where.push(`d."motivoId" IS NULL`);
    else if (/^\d+$/.test(String(q.motivo || ''))) add(`d."motivoId" = ?::int`, q.motivo);
    // os cartoes de resumo ignoram o filtro de status (senao clicar num cartao zeraria os outros)
    const filtroSemStatus = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const paramsSemStatus = params.slice();
    if (['em_revisao', 'prejuizo', 'estoque', 'vendida', 'sem_peca'].includes(String(q.status || ''))) add(`${STATUS_ATUAL} = ?`, String(q.status));
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const per = Math.min(200, Math.max(10, Number(q.per) || 50));
    const page = Math.max(1, Number(q.page) || 1);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT d."id", d."pecaId", d."idPeca", d."descricao", d."pedidoNum", d."pedidoId", d."dataVenda"::text AS "dataVenda", d."dataDevolucao"::text AS "dataDevolucao",
              d."motoId", d."motoNome", d."motoLabel", d."valor", d."valorLiq", d."frete", d."taxas", d."nfVenda", d."nfDevolucao", d."canal", d."motivoId", mo."nome" AS "motivoNome", d."observacao", d."origem",
              d."criadoEm", d."atualizadoEm", d."atualizadoPor", ${STATUS_ATUAL} AS "statusAtual", pc."localizacao" AS "localizacaoAtual", pc."etiquetaPendente" AS "etiquetaPendente", pc."detranEtiqueta" AS "etiquetaAtual", pc."detranStatus" AS "detranStatus", bp."clienteNome" AS "clienteNome",
              (SELECT json_agg(json_build_object('etiqueta', h."etiquetasDetran", 'baixada', COALESCE(h."etiquetaBaixada", false)) ORDER BY h."id")
                 FROM "HistoricoDevolucao" h
                WHERE h."pecaId" = d."pecaId" AND h."etiquetasDetran" IS NOT NULL AND h."etiquetasDetran" <> ''
                  AND COALESCE(h."pedidoBlingNum", '') = COALESCE(d."pedidoNum", '')
                  AND (h."dataDevolucao" AT TIME ZONE 'America/Sao_Paulo')::date = d."dataDevolucao") AS "etiquetas"
       FROM "DevolucaoRegistro" d LEFT JOIN "DevolucaoMotivo" mo ON mo."id" = d."motivoId" ${JOINS_STATUS}
       LEFT JOIN "BlingPedido" bp ON bp."id" = (CASE WHEN d."pedidoId" ~ '^[0-9]+$' THEN d."pedidoId"::bigint END)
       ${filtro} ORDER BY d."dataDevolucao" DESC, d."id" DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, ...params);
    const [tot] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int AS n, COALESCE(sum(d."valor"),0) AS valor, COALESCE(sum(d."valorLiq"),0) AS "valorLiq", count(*) FILTER (WHERE d."motivoId" IS NULL)::int AS "semMotivo"
       FROM "DevolucaoRegistro" d ${JOINS_STATUS} ${filtro}`, ...params);
    const porStatusRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${STATUS_ATUAL} AS status, count(*)::int AS qtd, count(*) FILTER (WHERE d."motivoId" IS NULL)::int AS "semMotivo"
       FROM "DevolucaoRegistro" d ${JOINS_STATUS} ${filtroSemStatus} GROUP BY 1`, ...paramsSemStatus);
    const porStatus: Record<string, number> = {};
    let totalGeral = 0; let semMotivoGeral = 0;
    for (const r of porStatusRows) { porStatus[r.status] = num(r.qtd); totalGeral += num(r.qtd); semMotivoGeral += num(r.semMotivo); }
    const porMotivo = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(mo."nome", 'Sem motivo informado') AS nome, count(*)::int AS qtd
       FROM "DevolucaoRegistro" d LEFT JOIN "DevolucaoMotivo" mo ON mo."id" = d."motivoId" ${JOINS_STATUS} ${filtro} GROUP BY 1 ORDER BY 2 DESC`, ...params);
    const canais = await prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT "canal" FROM "DevolucaoRegistro" WHERE "canal" IS NOT NULL ORDER BY 1`);
    const motivos = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","nome" FROM "DevolucaoMotivo" WHERE "ativo" ORDER BY "ordem","nome"`);

    res.json({
      ok: true, page, per, total: num(tot?.n),
      resumo: { qtd: num(tot?.n), valor: num(tot?.valor), valorLiq: num(tot?.valorLiq), semMotivo: num(tot?.semMotivo), porMotivo, totalGeral, semMotivoGeral, porStatus },
      canais: canais.map((c) => c.canal), motivos, podeEditar: podeEditar(req),
      itens: rows.map((r) => ({ ...r, id: Number(r.id), valor: r.valor == null ? null : num(r.valor), valorLiq: r.valorLiq == null ? null : num(r.valorLiq), frete: r.frete == null ? null : num(r.frete), taxas: r.taxas == null ? null : num(r.taxas) })),
    });
  } catch (e) { next(e); }
});

// GET /devolucoes-historico/consulta?sku=&pedido= — ajuda a preencher o registro manual (peca + moto, e pedido ja importado)
devolucaoHistoricoRouter.get('/consulta', async (req, res, next) => {
  try {
    const sku = String(req.query.sku || '').trim();
    const pedidoTxt = String(req.query.pedido || '').trim().replace(/^#/, '');
    let peca: any = null;
    let pedido: any = null;
    if (sku) {
      const [p] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p."id", p."idPeca", p."descricao", p."motoId", p."precoML", NULLIF(trim(concat_ws(' ', m."marca", m."modelo", m."ano")), '') AS "motoNome", m."etiquetaSkuLabel" AS "motoLabel"
         FROM "Peca" p LEFT JOIN "Moto" m ON m."id" = p."motoId" WHERE upper(p."idPeca") = upper($1) ORDER BY p."id" DESC LIMIT 1`, sku);
      if (p) peca = { id: Number(p.id), idPeca: p.idPeca, descricao: p.descricao, motoId: p.motoId, motoNome: p.motoNome, motoLabel: p.motoLabel, precoML: p.precoML == null ? null : num(p.precoML) };
    }
    if (pedidoTxt) {
      try {
        const [b] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT b."id"::text AS id, b."numero", b."data"::text AS data, b."canal", b."total", b."situacao",
                  (SELECT i."valor" FROM "BlingPedidoItem" i WHERE i."pedidoId" = b."id" AND upper(i."sku") = upper($2) LIMIT 1) AS "valorItem"
           FROM "BlingPedido" b WHERE b."numero" = $1 OR b."numeroLoja" = $1 OR b."id"::text = $1 LIMIT 1`, pedidoTxt, sku);
        if (b) pedido = { id: b.id, numero: b.numero, data: b.data, canal: b.canal, situacao: b.situacao, valorItem: b.valorItem == null ? null : num(b.valorItem) };
      } catch { /* pedidos locais ainda nao criados */ }
    }
    res.json({ ok: true, peca, pedido });
  } catch (e) { next(e); }
});

// GET /devolucoes-historico/nf-venda?pedido=&pedidoId= — procura no Bling a NF de venda do pedido (chamada sob demanda, pode demorar)
devolucaoHistoricoRouter.get('/nf-venda', async (req, res, next) => {
  try {
    const pedidoNum = String(req.query.pedido || '').trim().replace(/^#/, '');
    const pedidoId = String(req.query.pedidoId || '').trim();
    if (!pedidoNum && !pedidoId) return res.status(400).json({ ok: false, error: 'Informe o pedido.' });
    const info = await loadBlingVendaInfo({ pedidoNum, pedidoId } as any);
    if (!info?.nfNumero) return res.json({ ok: true, nf: null, aviso: 'O Bling nao retornou uma NF para esse pedido.' });
    res.json({ ok: true, nf: info.nfNumero, clienteNome: info.clienteNome || null });
  } catch (e) { next(e); }
});

// POST /devolucoes-historico — registro manual (devolucoes do passado). Nao mexe em estoque nem em Bling.
devolucaoHistoricoRouter.post('/', exigirEdicao, async (req, res, next) => {
  try {
    const b = req.body || {};
    const idPeca = String(b.sku || '').trim().slice(0, 60);
    const descricao = String(b.descricao || '').trim().slice(0, 300);
    if (!idPeca && !descricao) return res.status(400).json({ ok: false, error: 'Informe o SKU ou a descricao da peca.' });
    if (!dataOk(b.dataDevolucao)) return res.status(400).json({ ok: false, error: 'Informe a data da devolucao.' });
    if (b.dataVenda && !dataOk(b.dataVenda)) return res.status(400).json({ ok: false, error: 'Data da venda invalida.' });
    let motivoId: number | null = null;
    if (b.motivoId) {
      const [ok] = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "DevolucaoMotivo" WHERE "id" = $1::int`, Number(b.motivoId));
      if (!ok) return res.status(400).json({ ok: false, error: 'Motivo invalido.' });
      motivoId = Number(b.motivoId);
    }
    let pecaId: number | null = null, motoId: number | null = null, motoNome: string | null = null, motoLabel: string | null = null, descFinal = descricao, skuFinal = idPeca;
    if (idPeca) {
      const [p] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p."id", p."idPeca", p."descricao", p."motoId", NULLIF(trim(concat_ws(' ', m."marca", m."modelo", m."ano")), '') AS "motoNome", m."etiquetaSkuLabel" AS "motoLabel"
         FROM "Peca" p LEFT JOIN "Moto" m ON m."id" = p."motoId" WHERE upper(p."idPeca") = upper($1) ORDER BY p."id" DESC LIMIT 1`, idPeca);
      if (p) { pecaId = Number(p.id); motoId = p.motoId ?? null; motoNome = p.motoNome; motoLabel = p.motoLabel; skuFinal = p.idPeca; if (!descFinal) descFinal = p.descricao || ''; }
    }
    const pedidoNum = String(b.pedidoNum || '').trim().replace(/^#/, '').slice(0, 60) || null;
    let pedidoId: string | null = null;
    let canal = String(b.canal || '').trim().slice(0, 60) || null;
    if (pedidoNum) {
      try {
        const [bp] = await prisma.$queryRawUnsafe<any[]>(`SELECT b."id"::text AS id, b."canal" FROM "BlingPedido" b WHERE b."numero" = $1 OR b."numeroLoja" = $1 OR b."id"::text = $1 LIMIT 1`, pedidoNum);
        if (bp) { pedidoId = bp.id; if (!canal) canal = bp.canal || null; }
      } catch { /* sem pedidos locais */ }
    }
    const valor = b.valor === '' || b.valor == null ? null : Number(b.valor);
    const valorLiq = b.valorLiq === '' || b.valorLiq == null ? null : Number(b.valorLiq);
    if ((valor != null && !Number.isFinite(valor)) || (valorLiq != null && !Number.isFinite(valorLiq))) return res.status(400).json({ ok: false, error: 'Valor invalido.' });
    const [row] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "DevolucaoRegistro" ("pecaId","idPeca","descricao","pedidoNum","pedidoId","dataVenda","dataDevolucao","motoId","motoNome","motoLabel","valor","valorLiq","canal","motivoId","observacao","origem","atualizadoPor","frete","taxas","nfVenda","nfDevolucao")
       VALUES ($1::int,$2,$3,$4,$5,$6::date,$7::date,$8::int,$9,$10,$11::numeric,$12::numeric,$13,$14::int,$15,'manual',$16,$17::numeric,$18::numeric,$19,$20) ON CONFLICT DO NOTHING RETURNING "id"`,
      pecaId, skuFinal || null, descFinal || null, pedidoNum, pedidoId, b.dataVenda || null, b.dataDevolucao, motoId, String(b.motoNome || '').trim().slice(0, 160) || motoNome, String(b.motoLabel || '').trim().slice(0, 80) || motoLabel, valor, valorLiq, canal, motivoId,
      String(b.observacao || '').trim().slice(0, 1000) || null, usuario(req),
      b.frete === '' || b.frete == null ? null : Number(b.frete), b.taxas === '' || b.taxas == null ? null : Number(b.taxas),
      String(b.nfVenda || '').trim().slice(0, 40) || null, String(b.nfDevolucao || '').trim().slice(0, 40) || null);
    if (!row) return res.status(409).json({ ok: false, error: 'Ja existe um registro desta peca/pedido nessa data.' });
    res.json({ ok: true, id: Number(row.id), pecaEncontrada: pecaId != null });
  } catch (e) { next(e); }
});

// PATCH /devolucoes-historico/:id — edita a linha toda (so este registro; nao mexe em estoque nem Bling)
devolucaoHistoricoRouter.patch('/:id(\\d+)', exigirEdicao, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const [atual] = await prisma.$queryRawUnsafe<any[]>(`SELECT "idPeca","pedidoNum" FROM "DevolucaoRegistro" WHERE "id" = $1::int`, id);
    if (!atual) return res.status(404).json({ ok: false, error: 'Registro nao encontrado.' });

    const sets: string[] = [];
    const params: any[] = [];
    const set = (col: string, v: any, cast = '') => { params.push(v); sets.push(`"${col}" = $${params.length}${cast}`); };
    const texto = (chave: string, col: string, max: number) => { if (chave in b) set(col, String(b[chave] ?? '').trim().slice(0, max) || null); };
    const numero = (chave: string, col: string): string | null => {
      if (!(chave in b)) return null;
      if (b[chave] === '' || b[chave] == null) { set(col, null, '::numeric'); return null; }
      const n = Number(b[chave]);
      if (!Number.isFinite(n)) return `Valor invalido em ${chave}.`;
      set(col, n, '::numeric');
      return null;
    };

    if ('motivoId' in b) {
      const m = b.motivoId;
      if (m === null || m === '') set('motivoId', null);
      else {
        const [ok] = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "DevolucaoMotivo" WHERE "id" = $1::int`, Number(m));
        if (!ok) return res.status(400).json({ ok: false, error: 'Motivo invalido.' });
        set('motivoId', Number(m));
      }
    }
    texto('observacao', 'observacao', 1000);
    texto('descricao', 'descricao', 300);
    texto('canal', 'canal', 60);
    texto('motoNome', 'motoNome', 160);
    texto('motoLabel', 'motoLabel', 80);
    texto('nfVenda', 'nfVenda', 40);
    texto('nfDevolucao', 'nfDevolucao', 40);
    for (const [k, col] of [['valor', 'valor'], ['valorLiq', 'valorLiq'], ['frete', 'frete'], ['taxas', 'taxas']] as const) {
      const e = numero(k, col);
      if (e) return res.status(400).json({ ok: false, error: e });
    }
    if ('dataDevolucao' in b) {
      if (!dataOk(b.dataDevolucao)) return res.status(400).json({ ok: false, error: 'Data da devolucao invalida.' });
      set('dataDevolucao', b.dataDevolucao, '::date');
    }
    if ('dataVenda' in b) {
      if (b.dataVenda === '' || b.dataVenda == null) set('dataVenda', null, '::date');
      else if (!dataOk(b.dataVenda)) return res.status(400).json({ ok: false, error: 'Data da venda invalida.' });
      else set('dataVenda', b.dataVenda, '::date');
    }
    // trocou o SKU: religa a peca (e a moto) do estoque
    if ('sku' in b) {
      const sku = String(b.sku ?? '').trim().slice(0, 60);
      if (sku.toUpperCase() !== String(atual.idPeca || '').toUpperCase()) {
        const [p] = sku ? await prisma.$queryRawUnsafe<any[]>(`SELECT p."id", p."idPeca", p."motoId" FROM "Peca" p WHERE upper(p."idPeca") = upper($1) ORDER BY p."id" DESC LIMIT 1`, sku) : [];
        set('idPeca', p ? p.idPeca : (sku || null));
        set('pecaId', p ? Number(p.id) : null, '::int');
        set('motoId', p ? p.motoId ?? null : null, '::int');
      }
    }
    // trocou o pedido: religa ao pedido importado (quando existir)
    if ('pedidoNum' in b) {
      const pn = String(b.pedidoNum ?? '').trim().replace(/^#/, '').slice(0, 60) || null;
      set('pedidoNum', pn);
      if (pn !== (atual.pedidoNum || null)) {
        let pid: string | null = null;
        if (pn) {
          try {
            const [bp] = await prisma.$queryRawUnsafe<any[]>(`SELECT b."id"::text AS id FROM "BlingPedido" b WHERE b."numero" = $1 OR b."numeroLoja" = $1 OR b."id"::text = $1 LIMIT 1`, pn);
            pid = bp?.id || null;
          } catch { /* sem pedidos locais */ }
        }
        set('pedidoId', pid);
      }
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada para alterar.' });
    params.push(usuario(req));
    sets.push(`"atualizadoEm" = now()`, `"atualizadoPor" = $${params.length}`);
    params.push(id);
    await prisma.$executeRawUnsafe(`UPDATE "DevolucaoRegistro" SET ${sets.join(', ')} WHERE "id" = $${params.length}::int`, ...params);
    res.json({ ok: true });
  } catch (e) {
    if (String((e as any)?.message || '').includes('DevolucaoRegistro_dedupe_uq')) return res.status(409).json({ ok: false, error: 'Ja existe um registro desta peca/pedido nessa data.' });
    next(e);
  }
});

// POST /devolucoes-historico/motivo-por-peca { pecaId, motivoId, observacao? } — usado em Pendencias > Devolucoes
devolucaoHistoricoRouter.post('/motivo-por-peca', exigirEdicao, async (req, res, next) => {
  try {
    const pecaId = Number(req.body?.pecaId);
    const motivoId = Number(req.body?.motivoId);
    if (!Number.isInteger(pecaId) || pecaId <= 0) return res.status(400).json({ ok: false, error: 'Informe a peca.' });
    const [m] = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "DevolucaoMotivo" WHERE "id" = $1::int AND "ativo"`, motivoId);
    if (!m) return res.status(400).json({ ok: false, error: 'Escolha um motivo da lista.' });
    const observacao = String(req.body?.observacao || '').trim().slice(0, 1000) || null;
    let n = await atualizarUltimo(pecaId, motivoId, observacao, usuario(req));
    if (!n) {
      // peca sem registro (ex.: revisao antiga): cria a partir dos dados da revisao e tenta de novo
      const [p] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p."idPeca", p."descricao", p."motoId", NULLIF(trim(concat_ws(' ', m."marca", m."modelo", m."ano")), '') AS "motoNome", m."etiquetaSkuLabel" AS "motoLabel",
                r."pedidoNum", r."pedidoId", r."dataVenda"::text AS "dataVenda", r."precoML", r."valorLiq"
         FROM "PecaEmRevisao" r JOIN "Peca" p ON p."id" = r."pecaId" LEFT JOIN "Moto" m ON m."id" = p."motoId" WHERE r."pecaId" = $1::int`, pecaId);
      if (!p) return res.status(404).json({ ok: false, error: 'Registro da devolucao nao encontrado.' });
      await registrarDevolucoes([{ pecaId, idPeca: p.idPeca, descricao: p.descricao, pedidoNum: p.pedidoNum, pedidoId: p.pedidoId, dataVenda: p.dataVenda, motoId: p.motoId, motoNome: p.motoNome, motoLabel: p.motoLabel, valor: p.precoML == null ? null : num(p.precoML), valorLiq: p.valorLiq == null ? null : num(p.valorLiq), origem: 'cancelamento_importado' }]);
      n = await atualizarUltimo(pecaId, motivoId, observacao, usuario(req));
    }
    if (!n) return res.status(404).json({ ok: false, error: 'Registro da devolucao nao encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function atualizarUltimo(pecaId: number, motivoId: number, observacao: string | null, por: string | null) {
  return prisma.$executeRawUnsafe(
    `UPDATE "DevolucaoRegistro" SET "motivoId" = $2::int, "observacao" = COALESCE($3, "observacao"), "atualizadoEm" = now(), "atualizadoPor" = $4
     WHERE "id" = (SELECT "id" FROM "DevolucaoRegistro" WHERE "pecaId" = $1::int ORDER BY "dataDevolucao" DESC, "id" DESC LIMIT 1)`,
    pecaId, motivoId, observacao, por);
}

// ───────────── Tipos de devolucao (motivos) ─────────────

// GET /devolucoes-historico/motivos — todos (inclusive inativos) com quantas devolucoes usam cada um
devolucaoHistoricoRouter.get('/motivos', async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT mo."id", mo."nome", mo."ativo", mo."ordem", (SELECT count(*)::int FROM "DevolucaoRegistro" d WHERE d."motivoId" = mo."id") AS "uso"
       FROM "DevolucaoMotivo" mo ORDER BY mo."ativo" DESC, mo."ordem", mo."nome"`);
    res.json({ ok: true, podeEditar: podeEditar(req), motivos: rows.map((r) => ({ id: Number(r.id), nome: r.nome, ativo: !!r.ativo, ordem: Number(r.ordem), uso: Number(r.uso) })) });
  } catch (e) { next(e); }
});

devolucaoHistoricoRouter.post('/motivos', exigirEdicao, async (req, res, next) => {
  try {
    const nome = String(req.body?.nome || '').trim().slice(0, 80);
    if (!nome) return res.status(400).json({ ok: false, error: 'Informe o nome do motivo.' });
    const [{ prox }] = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(max("ordem"),0)+1 AS prox FROM "DevolucaoMotivo"`);
    const [row] = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "DevolucaoMotivo" ("nome","ordem") VALUES ($1,$2::int) ON CONFLICT DO NOTHING RETURNING "id"`, nome, Number(prox));
    if (!row) return res.status(409).json({ ok: false, error: 'Ja existe um motivo com esse nome.' });
    res.json({ ok: true, id: Number(row.id) });
  } catch (e) { next(e); }
});

devolucaoHistoricoRouter.patch('/motivos/:id(\\d+)', exigirEdicao, async (req, res, next) => {
  try {
    const sets: string[] = [];
    const params: any[] = [];
    if ('nome' in req.body) {
      const nome = String(req.body.nome || '').trim().slice(0, 80);
      if (!nome) return res.status(400).json({ ok: false, error: 'Informe o nome do motivo.' });
      params.push(nome); sets.push(`"nome" = $${params.length}`);
    }
    if ('ativo' in req.body) { params.push(!!req.body.ativo); sets.push(`"ativo" = $${params.length}`); }
    if ('ordem' in req.body && Number.isFinite(Number(req.body.ordem))) { params.push(Math.round(Number(req.body.ordem))); sets.push(`"ordem" = $${params.length}::int`); }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada para alterar.' });
    params.push(Number(req.params.id));
    const n = await prisma.$executeRawUnsafe(`UPDATE "DevolucaoMotivo" SET ${sets.join(', ')} WHERE "id" = $${params.length}::int`, ...params);
    if (!n) return res.status(404).json({ ok: false, error: 'Motivo nao encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    if (String((e as any)?.message || '').includes('DevolucaoMotivo_nome_uq')) return res.status(409).json({ ok: false, error: 'Ja existe um motivo com esse nome.' });
    next(e);
  }
});

// motivo ja usado so pode ser desativado (para nao perder o historico)
devolucaoHistoricoRouter.delete('/motivos/:id(\\d+)', exigirEdicao, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [u] = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS n FROM "DevolucaoRegistro" WHERE "motivoId" = $1::int`, id);
    if (num(u?.n) > 0) return res.status(409).json({ ok: false, error: `Esse motivo ja foi usado em ${num(u.n)} devolucao(oes). Desative-o em vez de excluir.` });
    await prisma.$executeRawUnsafe(`DELETE FROM "DevolucaoMotivo" WHERE "id" = $1::int`, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
