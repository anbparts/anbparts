// Estoque > Devolucoes: historico de cancelamentos/devolucoes + lista padronizada de motivos (tipos de devolucao).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { garantirTabelasDevolucao, completarCanais, registrarDevolucoes } from '../lib/devolucao-historico';

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
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const per = Math.min(200, Math.max(10, Number(q.per) || 50));
    const page = Math.max(1, Number(q.page) || 1);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT d."id", d."pecaId", d."idPeca", d."descricao", d."pedidoNum", d."pedidoId", d."dataVenda"::text AS "dataVenda", d."dataDevolucao"::text AS "dataDevolucao",
              d."motoId", d."motoNome", d."motoLabel", d."valor", d."valorLiq", d."canal", d."motivoId", mo."nome" AS "motivoNome", d."observacao", d."origem",
              d."criadoEm", d."atualizadoEm", d."atualizadoPor"
       FROM "DevolucaoRegistro" d LEFT JOIN "DevolucaoMotivo" mo ON mo."id" = d."motivoId"
       ${filtro} ORDER BY d."dataDevolucao" DESC, d."id" DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, ...params);
    const [tot] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int AS n, COALESCE(sum(d."valor"),0) AS valor, COALESCE(sum(d."valorLiq"),0) AS "valorLiq", count(*) FILTER (WHERE d."motivoId" IS NULL)::int AS "semMotivo"
       FROM "DevolucaoRegistro" d ${filtro}`, ...params);
    const porMotivo = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(mo."nome", 'Sem motivo informado') AS nome, count(*)::int AS qtd
       FROM "DevolucaoRegistro" d LEFT JOIN "DevolucaoMotivo" mo ON mo."id" = d."motivoId" ${filtro} GROUP BY 1 ORDER BY 2 DESC`, ...params);
    const canais = await prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT "canal" FROM "DevolucaoRegistro" WHERE "canal" IS NOT NULL ORDER BY 1`);
    const motivos = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","nome" FROM "DevolucaoMotivo" WHERE "ativo" ORDER BY "ordem","nome"`);

    res.json({
      ok: true, page, per, total: num(tot?.n),
      resumo: { qtd: num(tot?.n), valor: num(tot?.valor), valorLiq: num(tot?.valorLiq), semMotivo: num(tot?.semMotivo), porMotivo },
      canais: canais.map((c) => c.canal), motivos, podeEditar: podeEditar(req),
      itens: rows.map((r) => ({ ...r, id: Number(r.id), valor: r.valor == null ? null : num(r.valor), valorLiq: r.valorLiq == null ? null : num(r.valorLiq) })),
    });
  } catch (e) { next(e); }
});

// PATCH /devolucoes-historico/:id { motivoId?, observacao?, dataDevolucao? }
devolucaoHistoricoRouter.patch('/:id(\\d+)', exigirEdicao, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const sets: string[] = [];
    const params: any[] = [];
    const set = (col: string, v: any, cast = '') => { params.push(v); sets.push(`"${col}" = $${params.length}${cast}`); };
    if ('motivoId' in req.body) {
      const m = req.body.motivoId;
      if (m === null || m === '') set('motivoId', null);
      else {
        const [ok] = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 AS x FROM "DevolucaoMotivo" WHERE "id" = $1::int`, Number(m));
        if (!ok) return res.status(400).json({ ok: false, error: 'Motivo invalido.' });
        set('motivoId', Number(m));
      }
    }
    if ('observacao' in req.body) set('observacao', String(req.body.observacao || '').trim().slice(0, 1000) || null);
    if ('dataDevolucao' in req.body) {
      if (!dataOk(req.body.dataDevolucao)) return res.status(400).json({ ok: false, error: 'Data invalida.' });
      set('dataDevolucao', req.body.dataDevolucao, '::date');
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada para alterar.' });
    params.push(usuario(req));
    sets.push(`"atualizadoEm" = now()`, `"atualizadoPor" = $${params.length}`);
    params.push(id);
    const n = await prisma.$executeRawUnsafe(`UPDATE "DevolucaoRegistro" SET ${sets.join(', ')} WHERE "id" = $${params.length}::int`, ...params);
    if (!n) return res.status(404).json({ ok: false, error: 'Registro nao encontrado.' });
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
