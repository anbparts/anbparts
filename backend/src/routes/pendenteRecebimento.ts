// Financeiro > Pendente Recebimento: pedidos marcados no Relatorio de Vendas como "pendente de recebimento" ate dar baixa.
// So guarda a marcacao (pedido + status); os dados do pedido (itens, valores, cliente) vem sempre ao vivo do mesmo calculo do relatorio.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { montarRelatorioVendas } from './bling';

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

function podeBaixar(req: any) {
  const user = req.authUser || {};
  if (user.isAdmin || String(user.username || '').trim().toLowerCase() === 'bruno') return true;
  const acoes = user.permissions?.pendente_recebimento;
  return Array.isArray(acoes) && acoes.includes('baixar');
}

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
