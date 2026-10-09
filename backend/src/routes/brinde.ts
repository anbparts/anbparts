// Brinde em venda: pedido de venda do Bling (relatorio de vendas) ao qual se acrescenta uma peca do nosso estoque que sera enviada
// de BRINDE junto. A peca vira "vendida" no sistema (fluxo padrao de Pecas: disponivel=false, dataVenda, pedido do Bling), com todos os
// valores ZERADOS (preco, frete, taxas, liquido) pra nao contar nos relatorios de venda, e o estoque dela e' baixado no Bling.
// Brinde = peca vendida com precoML = 0 vinculada a um pedido (e' assim que o relatorio de vendas e o de separacao a reconhecem).
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq, findBlingProductsByCodes } from './bling';

export const brindeRouter = Router();

const getBaseSku = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');

// GET /brinde/pecas?busca=&limite= — pecas DISPONIVEIS de verdade (nao em prejuizo, nao sucata, sem etiqueta Detran pendente).
brindeRouter.get('/pecas', async (req, res, next) => {
  try {
    const busca = String(req.query.busca || '').trim();
    const limite = Math.min(30, Math.max(1, Number(req.query.limite) || 15));
    const pecas: any[] = await prisma.peca.findMany({
      where: {
        disponivel: true, emPrejuizo: false, sucata: false, etiquetaPendente: false,
        ...(busca ? { OR: [{ idPeca: { contains: busca, mode: 'insensitive' } }, { descricao: { contains: busca, mode: 'insensitive' } }] } : {}),
      } as any,
      select: { id: true, idPeca: true, descricao: true, localizacao: true, moto: { select: { marca: true, modelo: true } } },
      orderBy: { idPeca: 'asc' },
      take: limite,
    } as any);
    res.json({
      ok: true,
      pecas: pecas.map((p) => ({ id: p.id, idPeca: p.idPeca, descricao: p.descricao, localizacao: p.localizacao || null, moto: p.moto ? `${p.moto.marca} ${p.moto.modelo}` : null })),
    });
  } catch (e) { next(e); }
});

// Deposito de onde sai a unidade: o que tem saldo fisico; senao o primeiro ativo.
async function depositoParaBaixa(produtoId: number): Promise<number | null> {
  try {
    const s = await blingReq(`/estoques/saldos?idsProdutos[]=${produtoId}`) as any;
    const deps: any[] = s?.data?.[0]?.depositos || [];
    const comSaldo = deps.find((d) => Number(d.saldoFisico) > 0);
    if (comSaldo?.id) return Number(comSaldo.id);
  } catch { /* cai pro primeiro ativo */ }
  try {
    const d = await blingReq('/depositos?pagina=1&limite=1&situacoes[]=1') as any;
    return Number(d?.data?.[0]?.id || 0) || null;
  } catch { return null; }
}

// POST /brinde/adicionar — body: { pedidoId, pecaId }.
// Ordem: 1) baixa no Bling (se falhar, NADA e' alterado aqui); 2) marca a peca como vendida, valores zerados, no pedido.
brindeRouter.post('/adicionar', async (req, res) => {
  try {
    const pedidoId = String(req.body?.pedidoId || '').trim();
    const pecaId = Number(req.body?.pecaId || 0);
    if (!pedidoId || !pecaId) return res.status(400).json({ ok: false, error: 'pedidoId e pecaId obrigatorios' });

    const peca: any = await prisma.peca.findUnique({ where: { id: pecaId } });
    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada.' });
    if (!peca.disponivel || peca.emPrejuizo || peca.sucata || peca.etiquetaPendente) {
      return res.status(400).json({ ok: false, error: `A peca ${peca.idPeca} nao esta disponivel em estoque (vendida, em prejuizo, sucata ou com etiqueta Detran pendente).` });
    }

    // Pedido de referencia: qualquer peca ja vendida nesse pedido (de onde vem numero e data da venda).
    const ref: any = await prisma.peca.findFirst({
      where: { blingPedidoId: pedidoId, disponivel: false },
      select: { blingPedidoNum: true, dataVenda: true },
    });
    if (!ref?.blingPedidoNum || !ref?.dataVenda) return res.status(404).json({ ok: false, error: 'Pedido nao encontrado no sistema (nenhuma peca vendida nele).' });

    // 1) Baixa no Bling.
    const baseSku = getBaseSku(peca.idPeca);
    const produtos = await findBlingProductsByCodes([baseSku]);
    const produto: any = produtos.get(baseSku);
    if (!produto?.id) return res.status(502).json({ ok: false, error: `Produto ${baseSku} nao encontrado no Bling — nada foi alterado.` });
    const depositoId = await depositoParaBaixa(Number(produto.id));
    const payload: any = { produto: { id: Number(produto.id) }, operacao: 'S', quantidade: 1, observacoes: `Brinde no pedido #${ref.blingPedidoNum} (ANB)` };
    if (depositoId) payload.deposito = { id: depositoId };
    try {
      await blingReq('/estoques', { method: 'POST', body: JSON.stringify(payload) });
    } catch (e: any) {
      return res.status(502).json({ ok: false, error: `Nao consegui baixar o estoque no Bling (${String(e?.message || e).slice(0, 200)}) — nada foi alterado.` });
    }

    // 2) Peca vendida (fluxo padrao), valores zerados.
    await prisma.peca.update({
      where: { id: pecaId },
      data: {
        disponivel: false, emPrejuizo: false,
        dataVenda: ref.dataVenda, blingPedidoId: pedidoId, blingPedidoNum: String(ref.blingPedidoNum),
        precoML: 0, valorFrete: 0, valorTaxas: 0, valorLiq: 0,
      },
    });
    console.log(`[brinde] ${peca.idPeca} adicionada como brinde ao pedido #${ref.blingPedidoNum}; baixa no Bling ok (deposito ${depositoId || 'padrao'})`);
    res.json({ ok: true, idPeca: peca.idPeca, pedidoNum: ref.blingPedidoNum });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Erro ao adicionar o brinde' });
  }
});
