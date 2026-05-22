import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { syncDetranEtiquetaBling } from '../lib/sync-bling-detran';

export const devolucoesRouter = Router();

function hasEstoqueAction(req: any, action: string) {
  const user = req.authUser || {};
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'bruno' || user.isAdmin) return true;
  const actions = user.permissions?.estoque;
  return Array.isArray(actions) && actions.includes(action);
}

function hasEtiquetasDetranAction(req: any, action: string) {
  const user = req.authUser || {};
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'bruno' || user.isAdmin) return true;
  const actions = user.permissions?.etiquetas_detran;
  return Array.isArray(actions) && actions.includes(action);
}

function requireEstoqueAction(action: string) {
  return (req: any, res: any, next: any) => {
    if (hasEstoqueAction(req, action)) return next();
    return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para executar esta acao.' });
  };
}

function requirePendenciaEtiquetaAction(req: any, res: any, next: any) {
  if (hasEstoqueAction(req, 'devolucoes') || hasEtiquetasDetranAction(req, 'processar_devolucao')) {
    return next();
  }
  return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para executar esta acao.' });
}

// ── POST /devolucoes — registrar devolução e reverter peça ao estoque ──────────
devolucoesRouter.post('/', requireEstoqueAction('devolucoes'), async (req, res, next) => {
  try {
    const {
      pecaId,
      dataDevolucao,
      nfVendaNumero,
      nfDevolucaoNumero,
      observacoes,
    } = req.body || {};

    if (!pecaId) return res.status(400).json({ error: 'pecaId obrigatorio' });

    const peca = await prisma.peca.findUnique({
      where: { id: Number(pecaId) },
      include: { moto: true },
    });

    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });
    if (peca.disponivel) return res.status(400).json({ error: 'Peca ja esta em estoque' });

    // Registrar histórico de devolução — 1 linha por etiqueta
    const baseHistorico = {
      pecaId:            peca.id,
      idPeca:            peca.idPeca,
      descricao:         peca.descricao,
      motoId:            peca.motoId,
      motoNome:          `${peca.moto.marca} ${peca.moto.modelo}${peca.moto.ano ? ' ' + peca.moto.ano : ''}`,
      pedidoBlingId:     peca.blingPedidoId  || null,
      pedidoBlingNum:    peca.blingPedidoNum || null,
      valorLiq:          peca.valorLiq,
      valorFrete:        peca.valorFrete,
      valorTaxas:        peca.valorTaxas,
      precoML:           peca.precoML,
      dataVenda:         peca.dataVenda      || null,
      dataDevolucao:     dataDevolucao ? new Date(dataDevolucao) : new Date(),
      nfVendaNumero:     nfVendaNumero       || null,
      nfDevolucaoNumero: nfDevolucaoNumero   || null,
      observacoes:       observacoes         || null,
    };
    const etqs = (peca.detranEtiqueta || '').split('/').map((e: string) => e.trim()).filter(Boolean);
    let primeiroId: number | null = null;
    if (etqs.length > 0) {
      for (const etq of etqs) {
        const dev = await prisma.historicoDevolucao.create({
          data: { ...baseHistorico, etiquetasDetran: etq, etiquetaBaixada: peca.detranBaixada || false },
        });
        if (primeiroId === null) primeiroId = dev.id;
      }
    } else {
      const dev = await prisma.historicoDevolucao.create({
        data: { ...baseHistorico, etiquetasDetran: null, etiquetaBaixada: false },
      });
      primeiroId = dev.id;
    }

    // Reverter peça ao estoque — limpar dados de venda e etiqueta
    await prisma.peca.update({
      where: { id: peca.id },
      data: {
        disponivel:      true,
        dataVenda:       null,
        blingPedidoId:   null,
        blingPedidoNum:  null,
        detranEtiqueta:  null,
        detranStatus:    null,
        detranBaixada:   false,
        detranBaixadaAt: null,
        etiquetaPendente: peca.detranEtiqueta ? true : false,
      },
    });

    res.json({ ok: true, devolucaoId: primeiroId });
  } catch (e) { next(e); }
});

// ── GET /devolucoes — listar histórico com filtros ────────────────────────────
devolucoesRouter.get('/', requireEstoqueAction('devolucoes'), async (req, res, next) => {
  try {
    const {
      idPeca, descricao, motoId,
      pedidoBlingNum,
      comEtiqueta,
      dataVendaDe, dataVendaAte,
      dataDevolucaoDe, dataDevolucaoAte,
      orderBy = 'dataDevolucao', orderDir = 'desc',
      page = '1', perPage = '50',
    } = req.query as Record<string, string>;

    const where: any = {};

    if (idPeca)        where.idPeca     = { contains: idPeca.toUpperCase() };
    if (descricao)     where.descricao  = { contains: descricao, mode: 'insensitive' };
    if (motoId)        where.motoId     = Number(motoId);
    if (pedidoBlingNum) where.pedidoBlingNum = { contains: pedidoBlingNum };

    if (comEtiqueta === 'com')  where.etiquetasDetran = { not: null };
    if (comEtiqueta === 'sem')  where.etiquetasDetran = null;

    if (dataVendaDe || dataVendaAte) {
      where.dataVenda = {
        ...(dataVendaDe  ? { gte: new Date(dataVendaDe  + 'T00:00:00.000Z') } : {}),
        ...(dataVendaAte ? { lte: new Date(dataVendaAte + 'T23:59:59.999Z') } : {}),
      };
    }
    if (dataDevolucaoDe || dataDevolucaoAte) {
      where.dataDevolucao = {
        ...(dataDevolucaoDe  ? { gte: new Date(dataDevolucaoDe  + 'T00:00:00.000Z') } : {}),
        ...(dataDevolucaoAte ? { lte: new Date(dataDevolucaoAte + 'T23:59:59.999Z') } : {}),
      };
    }

    const validOrder = ['idPeca','descricao','motoNome','pedidoBlingNum','valorLiq','dataVenda','dataDevolucao','etiquetasDetran','criadoEm'];
    const safeOrder  = validOrder.includes(orderBy) ? orderBy : 'dataDevolucao';
    const safeDir    = orderDir === 'asc' ? 'asc' : 'desc';
    const pageNum    = Math.max(1, Number(page));
    const perPageNum = Math.min(200, Math.max(1, Number(perPage)));

    const [total, devolucoes] = await Promise.all([
      prisma.historicoDevolucao.count({ where }),
      prisma.historicoDevolucao.findMany({
        where,
        orderBy: { [safeOrder]: safeDir },
        skip:  (pageNum - 1) * perPageNum,
        take:  perPageNum,
        include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
      }),
    ]);

    res.json({ ok: true, total, page: pageNum, perPage: perPageNum, devolucoes });
  } catch (e) { next(e); }
});

// ── GET /devolucoes/pendentes-etiqueta — SKUs com etiquetaPendente ────────────
devolucoesRouter.get('/pendentes-etiqueta', async (_req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: { etiquetaPendente: true, disponivel: true },
      select: {
        id: true, idPeca: true, descricao: true, motoId: true,
        localizacao: true, cadastro: true,
        moto: { select: { marca: true, modelo: true, ano: true } },
        devolucoes: {
          orderBy: { dataDevolucao: 'desc' },
          take: 1,
          select: { dataDevolucao: true, etiquetasDetran: true, etiquetaBaixada: true, pedidoBlingNum: true },
        },
      },
      orderBy: { idPeca: 'asc' },
    });
    res.json({ ok: true, total: pecas.length, pecas });
  } catch (e) { next(e); }
});

// -- POST /devolucoes/pendentes-etiqueta/:pecaId/nova-etiqueta
// Finaliza a pendencia de devolucao cadastrando uma nova etiqueta Detran.
devolucoesRouter.post('/pendentes-etiqueta/:pecaId/nova-etiqueta', requirePendenciaEtiquetaAction, async (req, res, next) => {
  try {
    const pecaId = Number(req.params.pecaId);
    const novaEtiqueta = String(req.body?.detranEtiqueta || req.body?.novaEtiqueta || '').trim().toUpperCase();

    if (!Number.isFinite(pecaId) || pecaId <= 0) {
      return res.status(400).json({ ok: false, error: 'pecaId invalido' });
    }
    if (!novaEtiqueta) {
      return res.status(400).json({ ok: false, error: 'Nova etiqueta obrigatoria' });
    }

    const peca = await prisma.peca.findUnique({
      where: { id: pecaId },
      select: {
        id: true,
        idPeca: true,
        etiquetaPendente: true,
        disponivel: true,
        detranEtiqueta: true,
      },
    });

    if (!peca) return res.status(404).json({ ok: false, error: 'Peca nao encontrada' });
    if (!peca.etiquetaPendente) {
      return res.status(400).json({ ok: false, error: 'Peca nao possui pendencia de etiqueta' });
    }

    const etiquetaEmUso = await prisma.peca.findFirst({
      where: {
        id: { not: peca.id },
        detranEtiqueta: { equals: novaEtiqueta, mode: 'insensitive' },
      },
      select: { idPeca: true },
    });

    if (etiquetaEmUso) {
      return res.status(409).json({ ok: false, error: `Etiqueta ja esta cadastrada no SKU ${etiquetaEmUso.idPeca}` });
    }

    const atualizada = await prisma.peca.update({
      where: { id: peca.id },
      data: {
        disponivel: true,
        detranEtiqueta: novaEtiqueta,
        detranStatus: null,
        detranBaixada: false,
        detranBaixadaAt: null,
        etiquetaPendente: false,
      },
    });

    await syncDetranEtiquetaBling(peca.idPeca);

    res.json({ ok: true, peca: atualizada });
  } catch (e) { next(e); }
});
