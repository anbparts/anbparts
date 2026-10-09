// Dados para o Termo de Retirada e Entrega (gerado em PDF no navegador, a partir do Relatorio de Vendas):
// comprador/documento/numero da venda vem do pedido no Bling; as pecas, do nosso cadastro.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';

export const termoRetiradaRouter = Router();

const txt = (v: any) => String(v ?? '').trim();

// GET /termo-retirada/dados?pedidoId=
termoRetiradaRouter.get('/dados', async (req, res) => {
  try {
    const pedidoId = txt(req.query?.pedidoId);
    if (!pedidoId) return res.status(400).json({ ok: false, error: 'pedidoId obrigatorio' });

    const pecas: any[] = await prisma.peca.findMany({
      where: { blingPedidoId: pedidoId, disponivel: false } as any,
      select: {
        idPeca: true, descricao: true, numeroMotor: true, numeroPeca: true, detranEtiqueta: true,
        mercadoLivreItemId: true, mercadoLivreLink: true, precoML: true, blingPedidoNum: true, dataVenda: true,
        moto: { select: { marca: true, modelo: true } },
      },
      orderBy: { idPeca: 'asc' },
    } as any);
    if (!pecas.length) return res.status(404).json({ ok: false, error: 'Nenhuma peca vendida encontrada nesse pedido.' });

    let comprador: { nome: string; documento: string; tipoPessoa: string } = { nome: '', documento: '', tipoPessoa: '' };
    let numeroLoja = '';
    let total = 0;
    let dataPedido = '';
    try {
      const detalhe = await blingReq(`/pedidos/vendas/${encodeURIComponent(pedidoId)}`) as any;
      const d = detalhe?.data || {};
      comprador = { nome: txt(d?.contato?.nome), documento: txt(d?.contato?.numeroDocumento), tipoPessoa: txt(d?.contato?.tipoPessoa) };
      numeroLoja = txt(d?.numeroLoja);
      total = Number(d?.total) || 0;
      dataPedido = txt(d?.data);
    } catch { /* sem Bling: o termo sai com o comprador em branco para preencher a mao */ }

    res.json({
      ok: true,
      pedidoNum: txt(pecas[0].blingPedidoNum),
      dataVenda: dataPedido || (pecas[0].dataVenda ? new Date(pecas[0].dataVenda).toISOString().slice(0, 10) : ''),
      numeroVenda: numeroLoja,
      total: total || pecas.reduce((s, p) => s + (Number(p.precoML) || 0), 0),
      comprador,
      itens: pecas.map((p) => ({
        idPeca: p.idPeca,
        descricao: txt(p.descricao),
        veiculo: p.moto ? `${txt(p.moto.marca)} ${txt(p.moto.modelo)}`.trim() : '',
        numeroMotor: txt(p.numeroMotor),
        numeroPeca: txt(p.numeroPeca),
        etiquetasDetran: txt(p.detranEtiqueta),
        anuncioML: txt(p.mercadoLivreItemId),
        valor: Number(p.precoML) || 0,
        brinde: (Number(p.precoML) || 0) === 0,
      })),
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Erro ao carregar os dados do pedido' });
  }
});
