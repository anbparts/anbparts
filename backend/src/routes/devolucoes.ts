import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { syncDetranEtiquetaBling } from '../lib/sync-bling-detran';
import { spDayStart, spDayEnd } from '../lib/timezone';
import { sendDetranAtivacaoEmailIfNeeded } from '../lib/detran-alert';
import { calcularTipoPeca, carregarCartelaMap } from './etiquetas-detran';

export const devolucoesRouter = Router();

// Etiqueta é de cartela quando: termina em 001..034 (posição) E a base (sem os 3 dígitos)
// é exatamente o prefixo da cartela da moto (detranCartelaId). Mesma regra usada no
// pré-cadastro (cadastro.ts) e em etiquetas-detran.ts — duplicada aqui por convenção do projeto.
function ehEtiquetaCartelaDaMoto(etq: unknown, cartelaBase: unknown) {
  const s = String(etq || '').trim();
  const base = String(cartelaBase || '').trim();
  if (!base || s.length <= 3) return false;
  const pos = Number(s.slice(-3));
  return pos >= 1 && pos <= 34 && s.slice(0, -3) === base;
}

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
        ...(dataVendaDe  ? { gte: spDayStart(dataVendaDe)  } : {}),
        ...(dataVendaAte ? { lte: spDayEnd(dataVendaAte)   } : {}),
      };
    }
    if (dataDevolucaoDe || dataDevolucaoAte) {
      where.dataDevolucao = {
        ...(dataDevolucaoDe  ? { gte: spDayStart(dataDevolucaoDe)  } : {}),
        ...(dataDevolucaoAte ? { lte: spDayEnd(dataDevolucaoAte)   } : {}),
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
        moto: { select: { marca: true, modelo: true, ano: true, renavam: true, placa: true } },
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
        descricao: true,
        motoId: true,
        etiquetaPendente: true,
        disponivel: true,
        detranEtiqueta: true,
        tipoPecaAvulsa: true,
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

    // Verifica se a nova etiqueta e de cartela (bate com a cartela da moto) ou avulsa —
    // mesma regra do pre-cadastro. Se for avulsa, marca a data de atribuicao (peca pode ter
    // cadastro antigo, entao a janela de pendencia de ativacao usa essa data em vez da antiga).
    const moto = await (prisma as any).moto.findUnique({
      where: { id: peca.motoId },
      select: { marca: true, modelo: true, renavam: true, placa: true, chassi: true, notaFiscalEntrada: true, detranCartelaId: true },
    });
    const posicaoCartela = await prisma.motoDetranPosicao.findFirst({
      where: { motoId: peca.motoId, idPeca: peca.idPeca, etiqueta: novaEtiqueta },
      select: { id: true },
    });
    const ehCartela = Boolean(posicaoCartela) || ehEtiquetaCartelaDaMoto(novaEtiqueta, moto?.detranCartelaId);
    const ehAvulsa = !ehCartela;

    // O Tipo de Peca e da PECA, nao da etiqueta — nao muda so porque a etiqueta mudou. Toda peca
    // de devolucao ja teve uma etiqueta antes (cartela ou avulsa), entao derivamos o tipo a partir
    // dela com a MESMA logica usada no resto do modulo (calcularTipoPeca): cartela da moto
    // (MotoDetranPosicao) -> posicao 001-034 -> tipoPecaAvulsa ja salvo, como ultimo fallback.
    const ultimaDevolucao = await prisma.historicoDevolucao.findFirst({
      where: { pecaId: peca.id },
      orderBy: { dataDevolucao: 'desc' },
      select: { etiquetasDetran: true },
    });
    const etiquetaAnterior = String(ultimaDevolucao?.etiquetasDetran || '').trim().toUpperCase();
    const cartelaMap = await carregarCartelaMap([peca.motoId]);
    const tipoDerivado = etiquetaAnterior
      ? calcularTipoPeca(etiquetaAnterior, peca.motoId, cartelaMap, peca.tipoPecaAvulsa)
      : peca.tipoPecaAvulsa;
    const tipoPecaParaAtivacao = tipoDerivado || peca.tipoPecaAvulsa || 'Avulsa';

    const atualizada = await prisma.peca.update({
      where: { id: peca.id },
      data: {
        disponivel: true,
        detranEtiqueta: novaEtiqueta,
        detranStatus: null,
        detranBaixada: false,
        detranBaixadaAt: null,
        etiquetaPendente: false,
        etiquetaAtribuidaEm: ehAvulsa ? new Date() : null,
        tipoPecaAvulsa: tipoPecaParaAtivacao,
      },
    });

    await syncDetranEtiquetaBling(peca.idPeca);

    if (ehAvulsa && tipoPecaParaAtivacao) {
      try {
        await sendDetranAtivacaoEmailIfNeeded([{
          idPeca: peca.idPeca,
          descricao: peca.descricao,
          etiqueta: novaEtiqueta,
          tipoPeca: tipoPecaParaAtivacao,
          motoLabel: moto ? [moto.marca, moto.modelo].filter(Boolean).join(' ') : null,
          renavam: moto?.renavam || null,
          placa: moto?.placa || null,
          chassi: moto?.chassi || null,
          notaFiscalEntrada: moto?.notaFiscalEntrada || null,
        }]);
      } catch (err) {
        console.error('[ativacao-email] falha ao enviar alerta de ativacao (devolucao):', err);
      }
    }

    res.json({ ok: true, peca: atualizada, ehAvulsa });
  } catch (e) { next(e); }
});
