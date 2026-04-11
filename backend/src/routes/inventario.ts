import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const inventarioRouter = Router();

const INVENTARIO_STATUS_EM_ANDAMENTO = 'em_andamento';
const INVENTARIO_STATUS_FINALIZADO = 'finalizado';
const CAIXA_STATUS_PENDENTE = 'pendente';
const CAIXA_STATUS_FINALIZADA = 'finalizada';
const ITEM_STATUS_PENDENTE = 'pendente';
const ITEM_STATUS_CONFIRMADO = 'confirmado';
const ITEM_STATUS_DIFERENCA = 'diferenca';

const diferencaSchema = z.object({
  tipo: z.enum(['nao_localizado', 'diferenca_estoque']),
});

function normalizeCaixa(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function getBaseSku(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/-\d+$/, '');
}

function parseDateStart(date: string) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function parseDateEnd(date: string) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

function sortText(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function formatInventoryStatus(status: string) {
  if (status === INVENTARIO_STATUS_FINALIZADO) return 'Finalizado';
  if (status === INVENTARIO_STATUS_EM_ANDAMENTO) return 'Em andamento';
  return status;
}

function formatCaixaStatus(status: string) {
  if (status === CAIXA_STATUS_FINALIZADA) return 'Finalizada';
  if (status === CAIXA_STATUS_PENDENTE) return 'Pendente';
  return status;
}

function formatDiferencaTipo(tipo: string | null | undefined) {
  if (tipo === 'nao_localizado') return 'Nao Localizado';
  if (tipo === 'diferenca_estoque') return 'Diferenca de Estoque';
  return tipo || 'Nao informado';
}

function serializeInventarioItem(item: {
  id: number;
  caixa: string;
  skuBase: string;
  motoId: number | null;
  idPecaReferencia: string;
  descricao: string;
  quantidadeEstoque: number;
  status: string;
  tipoDiferenca?: string | null;
  decidedAt?: Date | string | null;
}) {
  return {
    ...item,
    tipoDiferencaLabel: item.status === ITEM_STATUS_DIFERENCA
      ? formatDiferencaTipo(item.tipoDiferenca)
      : null,
  };
}

function buildInventarioSnapshot(pecas: Array<{
  idPeca: string;
  motoId: number;
  descricao: string;
  localizacao: string | null;
}>) {
  const caixasMap = new Map<string, Map<string, any>>();

  for (const peca of pecas) {
    const caixa = normalizeCaixa(peca.localizacao);
    if (!caixa) continue;

    const skuBase = getBaseSku(peca.idPeca);
    if (!skuBase) continue;

    if (!caixasMap.has(caixa)) {
      caixasMap.set(caixa, new Map<string, any>());
    }

    const itensCaixa = caixasMap.get(caixa)!;
    const current = itensCaixa.get(skuBase) || {
      caixa,
      skuBase,
      motoId: Number.isFinite(Number(peca.motoId)) ? Number(peca.motoId) : null,
      idPecaReferencia: peca.idPeca,
      descricao: peca.descricao || 'Sem descricao',
      quantidadeEstoque: 0,
    };

    current.quantidadeEstoque += 1;
    if (!current.idPecaReferencia || sortText(String(peca.idPeca), String(current.idPecaReferencia)) < 0) {
      current.idPecaReferencia = peca.idPeca;
    }
    if (!current.descricao && peca.descricao) {
      current.descricao = peca.descricao;
    }

    itensCaixa.set(skuBase, current);
  }

  const caixas = Array.from(caixasMap.keys()).sort(sortText);
  const itens = caixas.flatMap((caixa) =>
    Array.from(caixasMap.get(caixa)?.values() || [])
      .sort((a, b) => sortText(a.skuBase, b.skuBase)),
  );

  return { caixas, itens };
}

async function findInventarioAberto() {
  return prisma.inventario.findFirst({
    where: { status: INVENTARIO_STATUS_EM_ANDAMENTO },
    orderBy: { startedAt: 'desc' },
  });
}

function buildCaixasResumo(caixasRows: any[], itensRows: any[]) {
  const counters = new Map<string, { totalItens: number; pendentes: number; confirmados: number; diferencas: number }>();

  for (const item of itensRows) {
    const caixa = String(item.caixa || '');
    const current = counters.get(caixa) || {
      totalItens: 0,
      pendentes: 0,
      confirmados: 0,
      diferencas: 0,
    };

    current.totalItens += 1;
    if (item.status === ITEM_STATUS_PENDENTE) current.pendentes += 1;
    if (item.status === ITEM_STATUS_CONFIRMADO) current.confirmados += 1;
    if (item.status === ITEM_STATUS_DIFERENCA) current.diferencas += 1;
    counters.set(caixa, current);
  }

  return caixasRows
    .map((caixa) => {
      const count = counters.get(caixa.caixa) || {
        totalItens: 0,
        pendentes: 0,
        confirmados: 0,
        diferencas: 0,
      };

      return {
        id: caixa.id,
        caixa: caixa.caixa,
        status: caixa.status,
        statusLabel: formatCaixaStatus(caixa.status),
        finishedAt: caixa.finishedAt,
        totalItens: count.totalItens,
        pendentes: count.pendentes,
        confirmados: count.confirmados,
        diferencas: count.diferencas,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === CAIXA_STATUS_PENDENTE ? -1 : 1;
      }
      return sortText(a.caixa, b.caixa);
    });
}

async function loadInventarioState(inventarioId: number) {
  const [inventario, caixasRows, itensRows] = await Promise.all([
    prisma.inventario.findUnique({
      where: { id: inventarioId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.inventarioCaixa.findMany({
      where: { inventarioId },
      orderBy: { caixa: 'asc' },
      select: {
        id: true,
        caixa: true,
        status: true,
        finishedAt: true,
      },
    }),
    prisma.inventarioItem.findMany({
      where: { inventarioId },
      select: {
        caixa: true,
        status: true,
      },
    }),
  ]);

  if (!inventario) return null;

  const caixas = buildCaixasResumo(caixasRows, itensRows);
  const totalPendentes = caixas.reduce((sum, caixa) => sum + caixa.pendentes, 0);
  const totalConfirmados = caixas.reduce((sum, caixa) => sum + caixa.confirmados, 0);
  const totalDiferencas = caixas.reduce((sum, caixa) => sum + caixa.diferencas, 0);
  const caixasPendentes = caixas.filter((caixa) => caixa.status === CAIXA_STATUS_PENDENTE).length;

  return {
    inventario: {
      ...inventario,
      statusLabel: formatInventoryStatus(inventario.status),
      totalCaixas: caixas.length,
      totalPendentes,
      totalConfirmados,
      totalDiferencas,
      caixasPendentes,
      podeFinalizarInventario: inventario.status === INVENTARIO_STATUS_EM_ANDAMENTO && caixas.length > 0 && caixasPendentes === 0 && totalPendentes === 0,
    },
    caixas,
  };
}

async function loadCaixaState(inventarioId: number, caixa: string) {
  const caixaNormalizada = normalizeCaixa(caixa);
  if (!caixaNormalizada) return null;

  const [caixaRow, itens] = await Promise.all([
    prisma.inventarioCaixa.findUnique({
      where: {
        inventarioId_caixa: {
          inventarioId,
          caixa: caixaNormalizada,
        },
      },
      select: {
        id: true,
        caixa: true,
        status: true,
        finishedAt: true,
      },
    }),
    prisma.inventarioItem.findMany({
      where: {
        inventarioId,
        caixa: caixaNormalizada,
      },
      orderBy: { skuBase: 'asc' },
      select: {
        id: true,
        caixa: true,
        skuBase: true,
        motoId: true,
        idPecaReferencia: true,
        descricao: true,
        quantidadeEstoque: true,
        status: true,
        tipoDiferenca: true,
        decidedAt: true,
      },
    }),
  ]);

  if (!caixaRow) return null;

  const pendentes = itens.filter((item) => item.status === ITEM_STATUS_PENDENTE);
  const confirmados = itens
    .filter((item) => item.status === ITEM_STATUS_CONFIRMADO)
    .map(serializeInventarioItem);
  const diferencas = itens
    .filter((item) => item.status === ITEM_STATUS_DIFERENCA)
    .map(serializeInventarioItem);

  return {
    caixa: {
      ...caixaRow,
      statusLabel: formatCaixaStatus(caixaRow.status),
      totalItens: itens.length,
      pendentes: pendentes.length,
      diferencas: diferencas.length,
      confirmados: itens.filter((item) => item.status === ITEM_STATUS_CONFIRMADO).length,
    },
    itensPendentes: pendentes,
    itensConfirmados: confirmados,
    diferencasRegistradas: diferencas,
  };
}

function serializeInventarioLog(inventario: any) {
  const diferencas = Array.isArray(inventario.itens)
    ? inventario.itens.map((item: any) => ({
        id: item.id,
        caixa: item.caixa,
        skuBase: item.skuBase,
        motoId: item.motoId,
        idPecaReferencia: item.idPecaReferencia,
        descricao: item.descricao,
        quantidadeEstoque: item.quantidadeEstoque,
        tipoDiferenca: item.tipoDiferenca,
        tipoDiferencaLabel: formatDiferencaTipo(item.tipoDiferenca),
        decidedAt: item.decidedAt,
      }))
    : [];

  const caixas = Array.isArray(inventario.caixas)
    ? inventario.caixas
    : [];

  return {
    id: inventario.id,
    status: inventario.status,
    statusLabel: formatInventoryStatus(inventario.status),
    startedAt: inventario.startedAt,
    finishedAt: inventario.finishedAt,
    totalCaixas: caixas.length,
    caixasFinalizadas: caixas.filter((caixa: any) => caixa.status === CAIXA_STATUS_FINALIZADA).length,
    totalDiferencas: diferencas.length,
    diferencas,
  };
}

inventarioRouter.get('/atual', async (_req, res, next) => {
  try {
    const aberto = await findInventarioAberto();
    if (!aberto) {
      return res.json({ ok: true, inventario: null, caixas: [] });
    }

    const state = await loadInventarioState(aberto.id);
    res.json({ ok: true, ...(state || { inventario: null, caixas: [] }) });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.post('/novo', async (_req, res, next) => {
  try {
    const inventarioAberto = await findInventarioAberto();
    if (inventarioAberto) {
      const state = await loadInventarioState(inventarioAberto.id);
      return res.json({ ok: true, jaExistia: true, ...(state || { inventario: null, caixas: [] }) });
    }

    const pecas = await prisma.peca.findMany({
      where: {
        disponivel: true,
        emPrejuizo: false,
        localizacao: { not: null },
      },
      select: {
        idPeca: true,
        motoId: true,
        descricao: true,
        localizacao: true,
      },
      orderBy: [
        { localizacao: 'asc' },
        { idPeca: 'asc' },
      ],
    });

    const snapshot = buildInventarioSnapshot(pecas);
    if (!snapshot.caixas.length || !snapshot.itens.length) {
      return res.status(400).json({ error: 'Nenhuma caixa com estoque e localizacao foi encontrada para iniciar o inventario' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const inventario = await tx.inventario.create({
        data: {
          status: INVENTARIO_STATUS_EM_ANDAMENTO,
        },
      });

      await tx.inventarioCaixa.createMany({
        data: snapshot.caixas.map((caixa) => ({
          inventarioId: inventario.id,
          caixa,
          status: CAIXA_STATUS_PENDENTE,
        })),
      });

      await tx.inventarioItem.createMany({
        data: snapshot.itens.map((item) => ({
          inventarioId: inventario.id,
          caixa: item.caixa,
          skuBase: item.skuBase,
          motoId: item.motoId,
          idPecaReferencia: item.idPecaReferencia,
          descricao: item.descricao,
          quantidadeEstoque: item.quantidadeEstoque,
          status: ITEM_STATUS_PENDENTE,
        })),
      });

      return inventario;
    });

    const state = await loadInventarioState(created.id);
    res.status(201).json({ ok: true, criado: true, ...(state || { inventario: null, caixas: [] }) });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.delete('/atual', async (_req, res, next) => {
  try {
    const inventarioAberto = await findInventarioAberto();
    if (!inventarioAberto) {
      return res.status(404).json({ error: 'Nao existe inventario em andamento para cancelar' });
    }

    await prisma.inventario.delete({
      where: { id: inventarioAberto.id },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.get('/caixas/:caixa', async (req, res, next) => {
  try {
    const inventarioId = Number(req.query?.inventarioId);
    const aberto = !inventarioId ? await findInventarioAberto() : null;
    const targetInventarioId = inventarioId || aberto?.id || 0;

    if (!targetInventarioId) {
      return res.status(404).json({ error: 'Nao existe inventario em andamento' });
    }

    const state = await loadCaixaState(targetInventarioId, req.params.caixa);
    if (!state) {
      return res.status(404).json({ error: 'Caixa nao encontrada nesse inventario' });
    }

    res.json({ ok: true, inventarioId: targetInventarioId, ...state });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.post('/itens/:id/confirmar', async (req, res, next) => {
  try {
    const itemId = Number(req.params.id);
    const item = await prisma.inventarioItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        inventarioId: true,
        status: true,
        inventario: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!item) return res.status(404).json({ error: 'Item do inventario nao encontrado' });
    if (item.inventario.status !== INVENTARIO_STATUS_EM_ANDAMENTO) {
      return res.status(400).json({ error: 'Esse inventario ja foi finalizado' });
    }
    if (item.status !== ITEM_STATUS_PENDENTE) {
      return res.status(409).json({ error: 'Esse item ja foi tratado anteriormente' });
    }

    await prisma.inventarioItem.update({
      where: { id: item.id },
      data: {
        status: ITEM_STATUS_CONFIRMADO,
        tipoDiferenca: null,
        decidedAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.post('/itens/:id/diferenca', async (req, res, next) => {
  try {
    const payload = diferencaSchema.parse(req.body || {});
    const itemId = Number(req.params.id);
    const item = await prisma.inventarioItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        status: true,
        inventario: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!item) return res.status(404).json({ error: 'Item do inventario nao encontrado' });
    if (item.inventario.status !== INVENTARIO_STATUS_EM_ANDAMENTO) {
      return res.status(400).json({ error: 'Esse inventario ja foi finalizado' });
    }
    if (item.status !== ITEM_STATUS_PENDENTE) {
      return res.status(409).json({ error: 'Esse item ja foi tratado anteriormente' });
    }

    await prisma.inventarioItem.update({
      where: { id: item.id },
      data: {
        status: ITEM_STATUS_DIFERENCA,
        tipoDiferenca: payload.tipo,
        decidedAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.post('/caixas/:caixa/finalizar', async (req, res, next) => {
  try {
    const inventarioId = Number(req.body?.inventarioId || req.query?.inventarioId);
    if (!inventarioId) return res.status(400).json({ error: 'inventarioId obrigatorio' });

    const caixa = normalizeCaixa(req.params.caixa);
    if (!caixa) return res.status(400).json({ error: 'Caixa invalida' });

    const caixaRow = await prisma.inventarioCaixa.findUnique({
      where: {
        inventarioId_caixa: {
          inventarioId,
          caixa,
        },
      },
      select: {
        id: true,
        status: true,
        inventario: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!caixaRow) return res.status(404).json({ error: 'Caixa nao encontrada nesse inventario' });
    if (caixaRow.inventario.status !== INVENTARIO_STATUS_EM_ANDAMENTO) {
      return res.status(400).json({ error: 'Esse inventario ja foi finalizado' });
    }

    const pendentes = await prisma.inventarioItem.count({
      where: {
        inventarioId,
        caixa,
        status: ITEM_STATUS_PENDENTE,
      },
    });

    if (pendentes > 0) {
      return res.status(400).json({ error: 'Ainda existem SKUs pendentes nessa caixa' });
    }

    await prisma.inventarioCaixa.update({
      where: {
        inventarioId_caixa: {
          inventarioId,
          caixa,
        },
      },
      data: {
        status: CAIXA_STATUS_FINALIZADA,
        finishedAt: new Date(),
      },
    });

    const state = await loadInventarioState(inventarioId);
    res.json({ ok: true, ...(state || { inventario: null, caixas: [] }) });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.post('/:id/finalizar', async (req, res, next) => {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await prisma.inventario.findUnique({
      where: { id: inventarioId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!inventario) return res.status(404).json({ error: 'Inventario nao encontrado' });
    if (inventario.status !== INVENTARIO_STATUS_EM_ANDAMENTO) {
      return res.status(400).json({ error: 'Esse inventario ja foi finalizado' });
    }

    const [pendenciasCaixa, pendenciasItem] = await Promise.all([
      prisma.inventarioCaixa.count({
        where: {
          inventarioId,
          status: CAIXA_STATUS_PENDENTE,
        },
      }),
      prisma.inventarioItem.count({
        where: {
          inventarioId,
          status: ITEM_STATUS_PENDENTE,
        },
      }),
    ]);

    if (pendenciasCaixa > 0 || pendenciasItem > 0) {
      return res.status(400).json({ error: 'Ainda existem caixas ou itens pendentes antes de finalizar o inventario' });
    }

    const updated = await prisma.inventario.update({
      where: { id: inventarioId },
      data: {
        status: INVENTARIO_STATUS_FINALIZADO,
        finishedAt: new Date(),
      },
    });

    res.json({
      ok: true,
      inventario: {
        ...updated,
        statusLabel: formatInventoryStatus(updated.status),
      },
    });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.get('/logs', async (req, res, next) => {
  try {
    const dataInicio = String(req.query?.dataInicio || '').trim();
    const dataFim = String(req.query?.dataFim || '').trim();
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 30));
    const where: any = {
      status: INVENTARIO_STATUS_FINALIZADO,
    };

    if (dataInicio || dataFim) {
      where.finishedAt = {};
      if (dataInicio) where.finishedAt.gte = parseDateStart(dataInicio);
      if (dataFim) where.finishedAt.lte = parseDateEnd(dataFim);
    }

    const inventarios = await prisma.inventario.findMany({
      where,
      orderBy: { finishedAt: 'desc' },
      take: limit,
      include: {
        caixas: {
          select: {
            status: true,
          },
        },
        itens: {
          where: {
            status: ITEM_STATUS_DIFERENCA,
          },
          select: {
            id: true,
            caixa: true,
            skuBase: true,
            motoId: true,
            idPecaReferencia: true,
            descricao: true,
            quantidadeEstoque: true,
            tipoDiferenca: true,
            decidedAt: true,
          },
        },
      },
    });

    res.json({
      ok: true,
      logs: inventarios.map(serializeInventarioLog),
    });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.get('/logs/:id', async (req, res, next) => {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await prisma.inventario.findUnique({
      where: { id: inventarioId },
      include: {
        caixas: {
          select: {
            status: true,
          },
        },
        itens: {
          where: {
            status: ITEM_STATUS_DIFERENCA,
          },
          orderBy: [
            { caixa: 'asc' },
            { skuBase: 'asc' },
          ],
          select: {
            id: true,
            caixa: true,
            skuBase: true,
            motoId: true,
            idPecaReferencia: true,
            descricao: true,
            quantidadeEstoque: true,
            tipoDiferenca: true,
            decidedAt: true,
          },
        },
      },
    });

    if (!inventario) return res.status(404).json({ error: 'Inventario nao encontrado' });

    res.json({
      ok: true,
      log: serializeInventarioLog(inventario),
    });
  } catch (e) {
    next(e);
  }
});

inventarioRouter.delete('/logs/:id', async (req, res, next) => {
  try {
    const inventarioId = Number(req.params.id);
    if (!inventarioId) return res.status(400).json({ error: 'Inventario invalido' });

    const inventario = await prisma.inventario.findUnique({
      where: { id: inventarioId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!inventario) return res.status(404).json({ error: 'Inventario nao encontrado' });
    if (inventario.status !== INVENTARIO_STATUS_FINALIZADO) {
      return res.status(400).json({ error: 'Somente inventarios finalizados podem ser excluidos pelos logs' });
    }

    await prisma.inventario.delete({
      where: { id: inventarioId },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
