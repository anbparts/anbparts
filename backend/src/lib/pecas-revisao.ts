// Pecas devolvidas por cancelamento de venda ficam "Em Revisao" ate alguem conferir e liberar de volta ao estoque (ou mandar para Prejuizo).
// Enquanto estiver em revisao a peca continua com disponivel=false (nao vende, nao conta como estoque); aqui fica so o registro
// (pedido cancelado, valores estornados) e o status. Tabela criada sob demanda, sem migration.
//
// Estoque no Bling: ao cancelar o pedido o proprio Bling devolve a unidade ao saldo. Para a peca nao ficar vendavel durante a revisao, o sistema
// da SAIDA dessa unidade (por SKU base, somando as unidades do mesmo SKU); ao marcar como revisada, da ENTRADA de volta. Em Prejuizo, a saida fica.
import { prisma } from './prisma';

let tabelaPronta: Promise<void> | null = null;
export function garantirTabelaRevisao(): Promise<void> {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PecaEmRevisao" (
        "pecaId" INTEGER PRIMARY KEY, "pedidoNum" TEXT, "pedidoId" TEXT, "dataVenda" DATE,
        "precoML" NUMERIC(14,2), "valorLiq" NUMERIC(14,2), "valorFrete" NUMERIC(14,2), "valorTaxas" NUMERIC(14,2),
        "motivo" TEXT, "status" TEXT NOT NULL DEFAULT 'em_revisao', "criadoEm" TIMESTAMP NOT NULL DEFAULT now(),
        "revisadaEm" TIMESTAMP, "revisadaPor" TEXT, "observacao" TEXT)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "PecaEmRevisao" ADD COLUMN IF NOT EXISTS "blingSaida" BOOLEAN NOT NULL DEFAULT false`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "PecaEmRevisao" ADD COLUMN IF NOT EXISTS "blingSaidaEm" TIMESTAMP`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "PecaEmRevisao" ADD COLUMN IF NOT EXISTS "blingSaidaErro" TEXT`);
    })().catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

export type DadosRevisao = {
  pecaId: number; pedidoNum?: string | null; pedidoId?: string | null; dataVenda?: Date | string | null;
  precoML?: any; valorLiq?: any; valorFrete?: any; valorTaxas?: any; motivo?: string | null;
};

// db = prisma ou o "tx" de uma transacao
export async function registrarRevisao(db: any, d: DadosRevisao) {
  const dia = d.dataVenda ? new Date(d.dataVenda).toISOString().slice(0, 10) : null;
  await db.$executeRawUnsafe(
    `INSERT INTO "PecaEmRevisao" ("pecaId","pedidoNum","pedidoId","dataVenda","precoML","valorLiq","valorFrete","valorTaxas","motivo","status","criadoEm","blingSaida","blingSaidaEm","blingSaidaErro")
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,'em_revisao',now(),false,NULL,NULL)
     ON CONFLICT ("pecaId") DO UPDATE SET "pedidoNum"=EXCLUDED."pedidoNum","pedidoId"=EXCLUDED."pedidoId","dataVenda"=EXCLUDED."dataVenda","precoML"=EXCLUDED."precoML",
       "valorLiq"=EXCLUDED."valorLiq","valorFrete"=EXCLUDED."valorFrete","valorTaxas"=EXCLUDED."valorTaxas","motivo"=EXCLUDED."motivo",
       "status"='em_revisao',"criadoEm"=now(),"revisadaEm"=NULL,"revisadaPor"=NULL,"observacao"=NULL,"blingSaida"=false,"blingSaidaEm"=NULL,"blingSaidaErro"=NULL`,
    d.pecaId, d.pedidoNum || null, d.pedidoId || null, dia, Number(d.precoML || 0), Number(d.valorLiq || 0), Number(d.valorFrete || 0), Number(d.valorTaxas || 0), d.motivo || null,
  );
}

// ids das pecas que estao em revisao agora
export async function idsEmRevisao(ids?: number[]): Promise<Set<number>> {
  await garantirTabelaRevisao();
  const rows = ids && ids.length
    ? await prisma.$queryRawUnsafe<Array<{ pecaId: number }>>(`SELECT "pecaId" FROM "PecaEmRevisao" WHERE "status"='em_revisao' AND "pecaId" = ANY($1::int[])`, ids)
    : await prisma.$queryRawUnsafe<Array<{ pecaId: number }>>(`SELECT "pecaId" FROM "PecaEmRevisao" WHERE "status"='em_revisao'`);
  return new Set(rows.map((r) => Number(r.pecaId)));
}

// ───────────── Estoque no Bling ─────────────
// Regra: o Bling NUNCA pode ter estoque a mais que o nosso sistema. A cada evento (cancelamento importado, peca revisada, envio para prejuizo)
// o saldo do Bling do SKU base e comparado com o total de pecas DISPONIVEIS no sistema (todas as variacoes do mesmo SKU) e a diferenca e lancada
// como saida (Bling acima) ou entrada (Bling abaixo). Antes de comparar, roda a importacao de vendas para o total estar atualizado.
// Seguranca: se o SKU tem pedido em aberto ainda nao concluido, o Bling pode estar legitimamente abaixo do sistema (unidade reservada); nesse caso
// nao aumenta o Bling (evita vender de novo uma unidade que acabou de ser vendida) — so reduz.
const skuBase = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');

export type AjusteBling = { sku: string; blingAntes: number; totalSistema: number; acao: 'saida' | 'entrada' | 'nenhuma'; quantidade: number; bloqueadoPorPedidoAberto?: boolean; texto: string };

async function blingLib() {
  const bling: any = await import('../routes/bling');
  const brinde: any = await import('../routes/brinde');
  return { bling, brinde };
}

async function saldoBling(produtoId: number): Promise<number> {
  const { bling } = await blingLib();
  const r: any = await bling.blingReq(`/estoques/saldos?idsProdutos[]=${produtoId}`);
  const d = r?.data?.[0] || {};
  const v = d.saldoVirtualTotal ?? d.saldoFisicoTotal ?? d.saldo;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Saldo do produto nao veio na resposta do Bling.');
  return n;
}

// Unidades do SKU em pedidos ainda nao concluidos (nem cancelados), lidas do banco local de pedidos (atualizado antes)
async function unidadesEmPedidosAbertos(base: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: any }>>(
      `SELECT COALESCE(SUM(i."quantidade"),0) AS n FROM "BlingPedidoItem" i JOIN "BlingPedido" p ON p."id" = i."pedidoId"
       WHERE p."cancelado" = false AND COALESCE(p."situacao",'') !~* '(atendid|concluid|finaliz|faturad|entregue)'
         AND (UPPER(i."sku") = $1 OR UPPER(i."sku") LIKE $1 || '-%')`, base,
    );
    return Number(rows[0]?.n || 0);
  } catch { return 0; }
}

export async function equalizarBling(skuEntrada: string, observacao: string): Promise<AjusteBling> {
  const base = skuBase(skuEntrada);
  const { bling, brinde } = await blingLib();
  // 1) vendas recentes importadas e pedidos locais atualizados antes de comparar
  await bling.garantirImportacaoVendasAtualizada();
  try { await (await import('./bling-pedidos')).sincronizarRecentes(3); } catch { /* sem a atualizacao local, segue so com o que ja existe */ }
  // 2) total do sistema: todas as variacoes disponiveis do SKU (mesma regra da auditoria)
  const totalSistema = await prisma.peca.count({ where: { OR: [{ idPeca: base }, { idPeca: { startsWith: `${base}-` } }], disponivel: true, emPrejuizo: false } });
  // 3) saldo no Bling
  const produtos = await bling.findBlingProductsByCodes([base], { forceRefresh: true });
  const produto: any = produtos.get(base);
  if (!produto?.id) throw new Error(`Produto ${base} nao encontrado no Bling.`);
  const blingAntes = await saldoBling(Number(produto.id));
  const diff = totalSistema - blingAntes;
  if (diff === 0) return { sku: base, blingAntes, totalSistema, acao: 'nenhuma', quantidade: 0, texto: `${base}: Bling ${blingAntes} = sistema ${totalSistema} (nada a ajustar)` };
  if (diff > 0) {
    const abertas = await unidadesEmPedidosAbertos(base);
    if (abertas > 0) {
      return { sku: base, blingAntes, totalSistema, acao: 'nenhuma', quantidade: 0, bloqueadoPorPedidoAberto: true, texto: `${base}: Bling ${blingAntes} abaixo do sistema ${totalSistema}, mas ha ${abertas} unidade(s) em pedido aberto; nao aumentei o Bling para nao vender de novo` };
    }
  }
  const depositoId = await brinde.depositoParaBaixa(Number(produto.id));
  const operacao = diff < 0 ? 'S' : 'E';
  const quantidade = Math.abs(diff);
  const payload: any = { produto: { id: Number(produto.id) }, operacao, quantidade, observacoes: observacao.slice(0, 250) };
  if (depositoId) payload.deposito = { id: depositoId };
  await bling.blingReq('/estoques', { method: 'POST', body: JSON.stringify(payload) });
  return { sku: base, blingAntes, totalSistema, acao: diff < 0 ? 'saida' : 'entrada', quantidade, texto: `${base}: Bling tinha ${blingAntes}, sistema ${totalSistema} → ${diff < 0 ? 'saida' : 'entrada'} de ${quantidade} → ${totalSistema}` };
}

// Cancelamento importado: equaliza o Bling de cada SKU base das pecas enviadas para revisao (junta variacoes do mesmo SKU numa unica conferencia)
export async function processarSaidaBling(pecaIds: number[]): Promise<{ saidas: number; erros: string[]; ajustes: AjusteBling[] }> {
  await garantirTabelaRevisao();
  const ids = Array.from(new Set(pecaIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) return { saidas: 0, erros: [], ajustes: [] };
  // reserva (so uma execucao processa cada peca)
  const reservadas = await prisma.$queryRawUnsafe<Array<{ pecaId: number }>>(
    `UPDATE "PecaEmRevisao" SET "blingSaida" = true WHERE "pecaId" = ANY($1::int[]) AND "status" = 'em_revisao' AND "blingSaida" = false RETURNING "pecaId"`, ids,
  );
  if (!reservadas.length) return { saidas: 0, erros: [], ajustes: [] };
  const pecas = await prisma.peca.findMany({ where: { id: { in: reservadas.map((r) => Number(r.pecaId)) } }, select: { id: true, idPeca: true } });
  const grupos = new Map<string, number[]>();
  for (const p of pecas) {
    const k = skuBase(p.idPeca);
    grupos.set(k, [...(grupos.get(k) || []), p.id]);
  }
  let saidas = 0;
  const erros: string[] = [];
  const ajustes: AjusteBling[] = [];
  for (const [sku, lista] of Array.from(grupos.entries())) {
    try {
      const aj = await equalizarBling(sku, `Cancelamento de venda - peca em revisao (${sku})`);
      ajustes.push(aj);
      await prisma.$executeRawUnsafe(`UPDATE "PecaEmRevisao" SET "blingSaidaEm" = now(), "blingSaidaErro" = NULL WHERE "pecaId" = ANY($1::int[])`, lista);
      saidas += lista.length;
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 300);
      await prisma.$executeRawUnsafe(`UPDATE "PecaEmRevisao" SET "blingSaida" = false, "blingSaidaErro" = $2 WHERE "pecaId" = ANY($1::int[])`, lista, msg);
      erros.push(`${sku}: ${msg}`);
      console.error(`[revisao] falha ao equalizar o estoque no Bling (${sku}):`, msg);
    }
  }
  return { saidas, erros, ajustes };
}

// ───────────── Finalizacao da revisao ─────────────
export type ResultadoRevisao = { ok: boolean; erro?: string; ajuste?: AjusteBling };

// Revisada: a peca volta a contar como disponivel e o Bling e equalizado com o novo total do sistema. Se o Bling nao puder ser ajustado, nada muda.
export async function marcarRevisada(pecaId: number, usuario: string | null, observacao: string | null): Promise<ResultadoRevisao> {
  await garantirTabelaRevisao();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "PecaEmRevisao" WHERE "pecaId"=$1 AND "status"='em_revisao'`, pecaId);
  if (!rows.length) return { ok: false, erro: 'Peca nao esta em revisao.' };
  const peca = await prisma.peca.findUnique({ where: { id: pecaId }, select: { idPeca: true } });
  if (!peca) return { ok: false, erro: 'Peca nao encontrada.' };
  // fecha o registro primeiro (evita dupla acao em cliques repetidos); se o Bling falhar, desfaz tudo
  const fechou = await prisma.$executeRawUnsafe(`UPDATE "PecaEmRevisao" SET "status"='revisada',"revisadaEm"=now(),"revisadaPor"=$2,"observacao"=COALESCE(NULLIF($3,''),"observacao") WHERE "pecaId"=$1 AND "status"='em_revisao'`, pecaId, usuario, observacao || '');
  if (!fechou) return { ok: false, erro: 'Peca ja foi tratada.' };
  const desfazer = async () => {
    await prisma.peca.update({ where: { id: pecaId }, data: { disponivel: false } }).catch(() => undefined);
    await prisma.$executeRawUnsafe(`UPDATE "PecaEmRevisao" SET "status"='em_revisao',"revisadaEm"=NULL,"revisadaPor"=NULL WHERE "pecaId"=$1`, pecaId);
  };
  try {
    await prisma.peca.update({ where: { id: pecaId }, data: { disponivel: true } });
    const ajuste = await equalizarBling(peca.idPeca, `Peca revisada apos cancelamento - volta ao estoque (${peca.idPeca})`);
    if (ajuste.bloqueadoPorPedidoAberto) {
      await desfazer();
      return { ok: false, erro: `${ajuste.texto}. Conclua ou importe o pedido em aberto e tente de novo.`, ajuste };
    }
    return { ok: true, ajuste };
  } catch (e: any) {
    await desfazer();
    return { ok: false, erro: `Nao foi possivel ajustar o estoque no Bling: ${String(e?.message || e).slice(0, 250)}` };
  }
}

export const MOTIVOS_PREJUIZO = ['Extravio no Envio', 'Defeito', 'SKU Cancelado', 'Peça Restrita - Sem Revenda', 'Extravio no Estoque'];

// Voltou com defeito: vai para Prejuizo (nao conta como disponivel) e o Bling e equalizado com o total do sistema.
export async function enviarParaPrejuizo(pecaId: number, motivo: string, observacao: string | null, usuario: string | null): Promise<ResultadoRevisao> {
  await garantirTabelaRevisao();
  if (!MOTIVOS_PREJUIZO.includes(motivo)) return { ok: false, erro: 'Motivo do prejuizo invalido.' };
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "PecaEmRevisao" WHERE "pecaId"=$1 AND "status"='em_revisao'`, pecaId);
  if (!rows.length) return { ok: false, erro: 'Peca nao esta em revisao.' };
  const peca = await prisma.peca.findUnique({ where: { id: pecaId }, select: { id: true, idPeca: true, descricao: true, precoML: true, valorFrete: true, emPrejuizo: true } });
  if (!peca) return { ok: false, erro: 'Peca nao encontrada.' };
  if (peca.emPrejuizo) return { ok: false, erro: 'Peca ja esta em prejuizo.' };
  // a peca em revisao ja nao conta como disponivel; equaliza antes (se o Bling recusar, nada e alterado)
  let ajuste: AjusteBling;
  try { ajuste = await equalizarBling(peca.idPeca, `Peca devolvida enviada para prejuizo (${peca.idPeca})`); }
  catch (e: any) { return { ok: false, erro: `Nao foi possivel ajustar o estoque no Bling: ${String(e?.message || e).slice(0, 250)}` }; }
  const detalhe = `${peca.idPeca} - ${peca.descricao}`;
  await prisma.$transaction(async (tx: any) => {
    await tx.peca.update({ where: { id: pecaId }, data: { disponivel: false, emPrejuizo: true, dataVenda: null, blingPedidoId: null, blingPedidoNum: null } });
    await tx.prejuizo.create({
      data: { data: new Date(), detalhe, motivo, observacao: observacao || 'Peca devolvida (cancelamento de venda) e enviada para prejuizo na revisao.', pecaId, valor: peca.precoML, frete: peca.valorFrete },
    });
    await tx.$executeRawUnsafe(`UPDATE "PecaEmRevisao" SET "status"='prejuizo',"revisadaEm"=now(),"revisadaPor"=$2,"observacao"=COALESCE(NULLIF($3,''),"observacao") WHERE "pecaId"=$1`, pecaId, usuario, observacao || '');
  });
  return { ok: true, ajuste };
}
