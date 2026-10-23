// Financeiro > Pendente Recebimento: pedidos marcados no Relatorio de Vendas como "pendente de recebimento" ate dar baixa.
// So guarda a marcacao (pedido + status); os dados do pedido (itens, valores, cliente) vem sempre ao vivo do mesmo calculo do relatorio.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { montarRelatorioVendas } from './bling';
import { garantirTabelaRevisao, marcarRevisada, enviarParaPrejuizo, processarSaidaBling, MOTIVOS_PREJUIZO } from '../lib/pecas-revisao';
import { garantirTabelasPedidos } from '../lib/bling-pedidos';
import { atribuirNovaEtiquetaPeca } from './devolucoes';
import { garantirTabelasDevolucao, nfEntradaDaPeca, salvarNfEntrada } from '../lib/devolucao-historico';

export const pendenteRecebimentoRouter = Router();

let tabelaPronta: Promise<void> | null = null;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PedidoPendenteRecebimento" (
      "id" SERIAL PRIMARY KEY, "pedidoNum" TEXT NOT NULL UNIQUE, "pedidoId" TEXT, "nomeCliente" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pendente', "marcadoEm" TIMESTAMP NOT NULL DEFAULT now(), "marcadoPor" TEXT,
      "baixadoEm" TIMESTAMP, "baixadoPor" TEXT, "observacao" TEXT)`)
      .then(() => undefined)
      .catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

const usuario = (req: any) => String(req.authUser?.username || '').trim() || null;
const numeroPedido = (v: any) => String(v ?? '').trim().slice(0, 60);

function temAcao(req: any, acao: string) {
  const user = req.authUser || {};
  if (user.isAdmin || String(user.username || '').trim().toLowerCase() === 'bruno') return true;
  // chave nova (Pendencias) ou a antiga (Pendente Recebimento), para nao perder quem ja tinha acesso
  for (const chave of ['pendencias', 'pendente_recebimento']) {
    const acoes = user.permissions?.[chave];
    if (Array.isArray(acoes) && acoes.includes(acao)) return true;
  }
  return false;
}
const podeBaixar = (req: any) => temAcao(req, 'baixar');

// GET /pendente-recebimento/status?pedidos=1,2,3 — situacao de cada pedido (usado pelo botao do Relatorio de Vendas)
pendenteRecebimentoRouter.get('/status', async (req, res, next) => {
  try {
    await garantirTabela();
    const nums = String(req.query.pedidos || '').split(',').map(numeroPedido).filter(Boolean).slice(0, 500);
    const mapa: Record<string, string> = {};
    if (nums.length) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "pedidoNum", "status" FROM "PedidoPendenteRecebimento" WHERE "pedidoNum" = ANY($1::text[])`, nums);
      for (const r of rows) mapa[String(r.pedidoNum)] = String(r.status);
    }
    res.json({ ok: true, status: mapa });
  } catch (e) { next(e); }
});

// POST /pendente-recebimento/marcar { pedidoNum, pedidoId?, nomeCliente? } — marca (ou volta a marcar) como pendente
pendenteRecebimentoRouter.post('/marcar', async (req, res, next) => {
  try {
    await garantirTabela();
    const pedidoNum = numeroPedido(req.body?.pedidoNum);
    if (!pedidoNum) return res.status(400).json({ ok: false, error: 'Informe o pedido.' });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PedidoPendenteRecebimento" ("pedidoNum","pedidoId","nomeCliente","status","marcadoEm","marcadoPor")
       VALUES ($1,$2,$3,'pendente',now(),$4)
       ON CONFLICT ("pedidoNum") DO UPDATE SET "status"='pendente', "marcadoEm"=now(), "marcadoPor"=EXCLUDED."marcadoPor",
         "pedidoId"=COALESCE(EXCLUDED."pedidoId","PedidoPendenteRecebimento"."pedidoId"), "nomeCliente"=COALESCE(EXCLUDED."nomeCliente","PedidoPendenteRecebimento"."nomeCliente"),
         "baixadoEm"=NULL, "baixadoPor"=NULL`,
      pedidoNum, numeroPedido(req.body?.pedidoId) || null, String(req.body?.nomeCliente || '').trim().slice(0, 200) || null, usuario(req),
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /pendente-recebimento/desmarcar { pedidoNum } — tira da lista (marcado por engano)
pendenteRecebimentoRouter.post('/desmarcar', async (req, res, next) => {
  try {
    await garantirTabela();
    const pedidoNum = numeroPedido(req.body?.pedidoNum);
    if (!pedidoNum) return res.status(400).json({ ok: false, error: 'Informe o pedido.' });
    await prisma.$executeRawUnsafe(`DELETE FROM "PedidoPendenteRecebimento" WHERE "pedidoNum" = $1`, pedidoNum);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /pendente-recebimento/baixar { pedidoNum, observacao? } — recebimento confirmado
pendenteRecebimentoRouter.post('/baixar', async (req, res, next) => {
  try {
    if (!podeBaixar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para dar baixa.' });
    await garantirTabela();
    const pedidoNum = numeroPedido(req.body?.pedidoNum);
    if (!pedidoNum) return res.status(400).json({ ok: false, error: 'Informe o pedido.' });
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "PedidoPendenteRecebimento" SET "status"='baixado', "baixadoEm"=now(), "baixadoPor"=$2, "observacao"=COALESCE(NULLIF($3,''),"observacao") WHERE "pedidoNum"=$1`,
      pedidoNum, usuario(req), String(req.body?.observacao || '').trim().slice(0, 500),
    );
    if (!n) return res.status(404).json({ ok: false, error: 'Pedido nao esta na lista.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /pendente-recebimento/reabrir { pedidoNum } — desfaz a baixa
pendenteRecebimentoRouter.post('/reabrir', async (req, res, next) => {
  try {
    if (!podeBaixar(req)) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para reabrir.' });
    await garantirTabela();
    const pedidoNum = numeroPedido(req.body?.pedidoNum);
    await prisma.$executeRawUnsafe(`UPDATE "PedidoPendenteRecebimento" SET "status"='pendente', "baixadoEm"=NULL, "baixadoPor"=NULL WHERE "pedidoNum"=$1`, pedidoNum);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /pendente-recebimento?status=pendente|baixado — lista com os pedidos completos (mesmo formato do Relatorio de Vendas)
pendenteRecebimentoRouter.get('/', async (req, res, next) => {
  try {
    await garantirTabela();
    const status = String(req.query.status || 'pendente') === 'baixado' ? 'baixado' : 'pendente';
    const marcacoes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "pedidoNum", "pedidoId", "nomeCliente", "status", "marcadoEm", "marcadoPor", "baixadoEm", "baixadoPor", "observacao"
       FROM "PedidoPendenteRecebimento" WHERE "status" = $1 ORDER BY ${status === 'baixado' ? '"baixadoEm"' : '"marcadoEm"'} DESC LIMIT 500`, status,
    );
    const nums = marcacoes.map((m) => String(m.pedidoNum));
    const rel = nums.length ? await montarRelatorioVendas({ pedidosExatos: nums }) : { totaisGerais: { totalPedidos: 0, totalItens: 0, precoML: 0, valorTaxas: 0, valorFrete: 0, valorLiq: 0 }, pedidos: [] };
    const porNum = new Map<string, any>((rel.pedidos as any[]).map((p) => [String(p.pedidoNum), p]));
    const itens = marcacoes.map((m) => {
      const grupo = porNum.get(String(m.pedidoNum)) || null;
      return {
        marcacao: { pedidoNum: m.pedidoNum, status: m.status, marcadoEm: m.marcadoEm, marcadoPor: m.marcadoPor, baixadoEm: m.baixadoEm, baixadoPor: m.baixadoPor, observacao: m.observacao },
        // pedido que nao aparece mais no relatorio (ex.: pecas devolvidas): mantem a marcacao com o que foi guardado
        pedido: grupo ? { ...grupo, nomeCliente: grupo.nomeCliente || m.nomeCliente || null }
          : { pedidoNum: m.pedidoNum, pedidoId: m.pedidoId, nomeCliente: m.nomeCliente, dataVenda: '', quantidadeItens: 0, subtotalPrecoML: 0, subtotalTaxas: 0, subtotalFrete: 0, subtotalValorLiq: 0, itens: [] },
        semDados: !grupo,
      };
    });
    const total = itens.reduce((acc, i) => acc + Number(i.pedido.subtotalValorLiq || 0), 0);
    res.json({ ok: true, status, itens, resumo: { pedidos: itens.length, valorLiq: Math.round(total * 100) / 100 }, podeBaixar: podeBaixar(req) });
  } catch (e) { next(e); }
});

// ───────────── Devolucoes (pecas em revisao apos cancelamento de venda) ─────────────

// GET /pendencias/devolucoes?status=em_revisao|revisada
pendenteRecebimentoRouter.get('/devolucoes', async (req, res, next) => {
  try {
    await garantirTabelaRevisao();
    await garantirTabelasPedidos();
    await garantirTabelasDevolucao();
    const status = String(req.query.status || 'em_revisao') === 'revisada' ? 'revisada' : 'em_revisao';
    const motivos = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","nome" FROM "DevolucaoMotivo" WHERE "ativo" ORDER BY "ordem","nome"`);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r."pecaId", r."pedidoNum", r."pedidoId", r."dataVenda"::text AS "dataVenda", r."precoML", r."valorLiq", r."valorFrete", r."valorTaxas", r."motivo", r."status",
              r."criadoEm", r."revisadaEm", r."revisadaPor", r."observacao", r."blingSaida", r."blingSaidaErro",
              p."idPeca", p."descricao", p."localizacao", p."detranEtiqueta", p."etiquetaPendente", p."precoML" AS "precoAtual",
              m."marca", m."modelo", m."ano", b."clienteNome", b."canal", b."situacao",
              dr."motivoId" AS "tipoId", dm."nome" AS "tipoNome", dr."observacao" AS "tipoObs", dr."nfDevolucao" AS "nfEntrada", dr."nfVenda" AS "nfSaida", dr."clienteNome" AS "clienteRegistro"
       FROM "PecaEmRevisao" r
       JOIN "Peca" p ON p."id" = r."pecaId"
       LEFT JOIN "Moto" m ON m."id" = p."motoId"
       LEFT JOIN LATERAL (SELECT x."motivoId", x."observacao", x."nfDevolucao", x."nfVenda", x."clienteNome" FROM "DevolucaoRegistro" x WHERE x."pecaId" = r."pecaId" ORDER BY x."dataDevolucao" DESC, x."id" DESC LIMIT 1) dr ON true
       LEFT JOIN "DevolucaoMotivo" dm ON dm."id" = dr."motivoId"
       LEFT JOIN "BlingPedido" b ON r."pedidoId" ~ '^[0-9]+$' AND b."id" = r."pedidoId"::bigint
       WHERE ${status === 'revisada' ? `r."status" IN ('revisada','prejuizo')` : `r."status" = 'em_revisao'`}
       ORDER BY ${status === 'revisada' ? 'r."revisadaEm"' : 'r."criadoEm"'} DESC LIMIT 500`,
    );
    res.json({
      ok: true, status, podeRevisar: temAcao(req, 'revisar'), motivosPrejuizo: MOTIVOS_PREJUIZO, motivosDevolucao: motivos.map((m) => ({ id: Number(m.id), nome: m.nome })),
      itens: rows.map((r) => ({
        pecaId: Number(r.pecaId), idPeca: r.idPeca, descricao: r.descricao, localizacao: r.localizacao, detranEtiqueta: r.detranEtiqueta, etiquetaPendente: !!r.etiquetaPendente,
        moto: [r.marca, r.modelo, r.ano].filter(Boolean).join(' '),
        pedido: { num: r.pedidoNum, id: r.pedidoId, dataVenda: r.dataVenda, clienteNome: r.clienteNome || r.clienteRegistro || null, canal: r.canal, situacao: r.situacao },
        estornado: { precoML: Number(r.precoML || 0), valorLiq: Number(r.valorLiq || 0), valorFrete: Number(r.valorFrete || 0), valorTaxas: Number(r.valorTaxas || 0) },
        nfEntrada: r.nfEntrada || null, nfSaida: r.nfSaida || null,
        tipo: r.tipoId ? { id: Number(r.tipoId), nome: r.tipoNome, observacao: r.tipoObs || null } : null,
        blingSaida: !!r.blingSaida, blingSaidaErro: r.blingSaidaErro || null, motivo: r.motivo, status: r.status, criadoEm: r.criadoEm, revisadaEm: r.revisadaEm, revisadaPor: r.revisadaPor, observacao: r.observacao,
      })),
    });
  } catch (e) { next(e); }
});

// POST /pendencias/devolucoes/nf-entrada { pecaId, nfEntrada } — informa (ou corrige) a NF de entrada sem concluir a revisao
pendenteRecebimentoRouter.post('/devolucoes/nf-entrada', async (req, res, next) => {
  try {
    if (!temAcao(req, 'revisar')) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para informar a NF de entrada.' });
    const pecaId = Number(req.body?.pecaId);
    const nf = String(req.body?.nfEntrada || '').trim().slice(0, 40);
    if (!Number.isInteger(pecaId) || pecaId <= 0) return res.status(400).json({ ok: false, error: 'Informe a peca.' });
    if (!nf) return res.status(400).json({ ok: false, error: 'Informe o numero da NF de entrada.' });
    const ok = await salvarNfEntrada(pecaId, nf, usuario(req));
    if (!ok) return res.status(404).json({ ok: false, error: 'Registro da devolucao nao encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /pendencias/devolucoes/revisar { pecaId, observacao? } — peca revisada: volta ao estoque
pendenteRecebimentoRouter.post('/devolucoes/revisar', async (req, res, next) => {
  try {
    if (!temAcao(req, 'revisar')) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para liberar pecas em revisao.' });
    const pecaId = Number(req.body?.pecaId);
    if (!Number.isInteger(pecaId) || pecaId <= 0) return res.status(400).json({ ok: false, error: 'Informe a peca.' });
    // a peca so sai de "Em revisao" com a NF de entrada (retorno) emitida e informada
    const nfEntrada = String(req.body?.nfEntrada || '').trim().slice(0, 40) || await nfEntradaDaPeca(pecaId);
    if (!nfEntrada) return res.status(400).json({ ok: false, error: 'Informe a nota fiscal de entrada (retorno) desta peca. Ela so pode ser marcada como revisada depois que a NF de entrada for emitida.' });
    // peca com etiqueta Detran pendente (a anterior foi baixada na venda): so sai da revisao com a nova etiqueta informada
    const pecaEtq = await prisma.peca.findUnique({ where: { id: pecaId }, select: { etiquetaPendente: true } });
    if (pecaEtq?.etiquetaPendente) {
      const nova = String(req.body?.novaEtiqueta || '').trim();
      if (!nova) return res.status(400).json({ ok: false, error: 'Esta peca esta com a etiqueta Detran pendente. Informe a nova etiqueta para concluir a revisao.' });
      const ret = await atribuirNovaEtiquetaPeca(pecaId, nova);
      if (ret.status !== 200) return res.status(ret.status).json({ ok: false, error: ret.body?.error || 'Nao foi possivel atribuir a nova etiqueta.' });
    }
    await salvarNfEntrada(pecaId, nfEntrada, usuario(req));
    const r = await marcarRevisada(pecaId, usuario(req), String(req.body?.observacao || '').trim().slice(0, 500) || null);
    if (!r.ok) return res.status(400).json({ ok: false, error: r.erro || 'Nao foi possivel concluir a revisao.' });
    res.json({ ok: true, ajusteBling: r.ajuste?.texto || null });
  } catch (e) { next(e); }
});

// POST /pendencias/devolucoes/prejuizo { pecaId, motivo, observacao? } — voltou com defeito: vai para Prejuizo
pendenteRecebimentoRouter.post('/devolucoes/prejuizo', async (req, res, next) => {
  try {
    if (!temAcao(req, 'revisar')) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para tratar pecas em revisao.' });
    const pecaId = Number(req.body?.pecaId);
    if (!Number.isInteger(pecaId) || pecaId <= 0) return res.status(400).json({ ok: false, error: 'Informe a peca.' });
    const r = await enviarParaPrejuizo(pecaId, String(req.body?.motivo || 'Defeito').trim(), String(req.body?.observacao || '').trim().slice(0, 500) || null, usuario(req));
    if (!r.ok) return res.status(400).json({ ok: false, error: r.erro || 'Nao foi possivel enviar para prejuizo.' });
    res.json({ ok: true, ajusteBling: r.ajuste?.texto || null });
  } catch (e) { next(e); }
});

// POST /pendencias/devolucoes/tentar-bling { pecaId } — repete a saida de estoque no Bling que tinha falhado
pendenteRecebimentoRouter.post('/devolucoes/tentar-bling', async (req, res, next) => {
  try {
    if (!temAcao(req, 'revisar')) return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao.' });
    const pecaId = Number(req.body?.pecaId);
    if (!Number.isInteger(pecaId) || pecaId <= 0) return res.status(400).json({ ok: false, error: 'Informe a peca.' });
    const r = await processarSaidaBling([pecaId]);
    if (r.erros.length) return res.status(400).json({ ok: false, error: r.erros[0] });
    res.json({ ok: true, saidas: r.saidas, ajusteBling: r.ajustes.map((a) => a.texto).join(' | ') || null });
  } catch (e) { next(e); }
});
