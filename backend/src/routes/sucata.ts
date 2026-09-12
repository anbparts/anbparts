import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const sucataRouter = Router();

// GET /sucata?status=pendente|vendida (default: pendente)
// Pendente = peca de sucata ainda disponivel (sem pedido de venda atribuido).
// Vendida = ja baixada via Importacao de Vendas (tem dataVenda + blingPedidoNum).
sucataRouter.get('/', async (req, res, next) => {
  try {
    const status = String(req.query?.status || 'pendente').trim();
    const where: any = { sucata: true, disponivel: status !== 'vendida' };

    const pecas = await (prisma as any).peca.findMany({
      where,
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        precoML: true,
        valorLiq: true,
        dataVenda: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        cadastro: true,
        moto: { select: { id: true, marca: true, modelo: true, ano: true } },
      },
      orderBy: status === 'vendida' ? { dataVenda: 'desc' } : { cadastro: 'desc' },
    });

    res.json({ ok: true, total: pecas.length, pecas });
  } catch (e) { next(e); }
});
