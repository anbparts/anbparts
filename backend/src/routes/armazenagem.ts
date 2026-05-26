import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const armazenagemRouter = Router();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getUsername(req: any): string {
  return String(req.user?.username || '');
}

// ─── ESTRUTURA COMPLETA ───────────────────────────────────────────────────────

// GET /armazenagem/estrutura
// Retorna toda a hierarquia: áreas > posições > detalhes + contagem de caixas em cada detalhe
armazenagemRouter.get('/estrutura', async (_req, res, next) => {
  try {
    const [areas, alocacoes] = await Promise.all([
      prisma.storageArea.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        include: {
          posicoes: {
            where: { ativo: true },
            orderBy: { nome: 'asc' },
            include: {
              detalhes: {
                where: { ativo: true },
                orderBy: { nome: 'asc' },
              },
            },
          },
        },
      }),
      prisma.boxStorageLocation.findMany({
        select: { detailId: true, localizacao: true },
      }),
    ]);

    // Monta mapa de contagem por detailId
    const countByDetail = new Map<number, number>();
    const caixasByDetail = new Map<number, string[]>();
    for (const aloc of alocacoes) {
      countByDetail.set(aloc.detailId, (countByDetail.get(aloc.detailId) || 0) + 1);
      const arr = caixasByDetail.get(aloc.detailId) || [];
      arr.push(aloc.localizacao);
      caixasByDetail.set(aloc.detailId, arr);
    }

    const resultado = areas.map((area) => ({
      id: area.id,
      nome: area.nome,
      descricao: area.descricao,
      totalCaixas: area.posicoes.reduce((s, p) =>
        s + p.detalhes.reduce((sd, d) => sd + (countByDetail.get(d.id) || 0), 0), 0),
      posicoes: area.posicoes.map((pos) => ({
        id: pos.id,
        nome: pos.nome,
        areaId: pos.areaId,
        totalCaixas: pos.detalhes.reduce((s, d) => s + (countByDetail.get(d.id) || 0), 0),
        detalhes: pos.detalhes.map((det) => ({
          id: det.id,
          nome: det.nome,
          posicaoId: det.posicaoId,
          totalCaixas: countByDetail.get(det.id) || 0,
          caixas: caixasByDetail.get(det.id) || [],
        })),
      })),
    }));

    res.json(resultado);
  } catch (e) { next(e); }
});

// ─── ÁREAS ────────────────────────────────────────────────────────────────────

// POST /armazenagem/areas
armazenagemRouter.post('/areas', async (req, res, next) => {
  try {
    const { nome, descricao } = z.object({
      nome: z.string().trim().min(1),
      descricao: z.string().trim().optional(),
    }).parse(req.body);

    const area = await prisma.storageArea.create({
      data: { nome, descricao: descricao || null },
    });
    res.json({ ok: true, area });
  } catch (e) { next(e); }
});

// PATCH /armazenagem/areas/:id
armazenagemRouter.patch('/areas/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome, descricao } = z.object({
      nome: z.string().trim().min(1).optional(),
      descricao: z.string().trim().nullable().optional(),
    }).parse(req.body);

    const area = await prisma.storageArea.update({
      where: { id },
      data: {
        ...(nome !== undefined && { nome }),
        ...(descricao !== undefined && { descricao }),
      },
    });
    res.json({ ok: true, area });
  } catch (e) { next(e); }
});

// DELETE /armazenagem/areas/:id
armazenagemRouter.delete('/areas/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Verifica se tem caixas alocadas antes de excluir
    const totalAlocacoes = await prisma.boxStorageLocation.count({
      where: { detail: { posicao: { areaId: id } } },
    });
    if (totalAlocacoes > 0) {
      res.status(400).json({ error: `Nao e possivel excluir: ha ${totalAlocacoes} caixa(s) alocada(s) nesta area.` });
      return;
    }
    await prisma.storageArea.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── POSIÇÕES ─────────────────────────────────────────────────────────────────

// POST /armazenagem/posicoes
armazenagemRouter.post('/posicoes', async (req, res, next) => {
  try {
    const { areaId, nome } = z.object({
      areaId: z.number().int().positive(),
      nome: z.string().trim().min(1),
    }).parse(req.body);

    const posicao = await prisma.storagePosition.create({
      data: { areaId, nome },
    });
    res.json({ ok: true, posicao });
  } catch (e) { next(e); }
});

// PATCH /armazenagem/posicoes/:id
armazenagemRouter.patch('/posicoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome } = z.object({ nome: z.string().trim().min(1) }).parse(req.body);
    const posicao = await prisma.storagePosition.update({ where: { id }, data: { nome } });
    res.json({ ok: true, posicao });
  } catch (e) { next(e); }
});

// DELETE /armazenagem/posicoes/:id
armazenagemRouter.delete('/posicoes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const totalAlocacoes = await prisma.boxStorageLocation.count({
      where: { detail: { posicaoId: id } },
    });
    if (totalAlocacoes > 0) {
      res.status(400).json({ error: `Nao e possivel excluir: ha ${totalAlocacoes} caixa(s) alocada(s) nesta posicao.` });
      return;
    }
    await prisma.storagePosition.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── DETALHES ─────────────────────────────────────────────────────────────────

// POST /armazenagem/detalhes
armazenagemRouter.post('/detalhes', async (req, res, next) => {
  try {
    const { posicaoId, nome } = z.object({
      posicaoId: z.number().int().positive(),
      nome: z.string().trim().min(1),
    }).parse(req.body);

    const detalhe = await prisma.storagePositionDetail.create({
      data: { posicaoId, nome },
    });
    res.json({ ok: true, detalhe });
  } catch (e) { next(e); }
});

// PATCH /armazenagem/detalhes/:id
armazenagemRouter.patch('/detalhes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome } = z.object({ nome: z.string().trim().min(1) }).parse(req.body);
    const detalhe = await prisma.storagePositionDetail.update({ where: { id }, data: { nome } });
    res.json({ ok: true, detalhe });
  } catch (e) { next(e); }
});

// DELETE /armazenagem/detalhes/:id
armazenagemRouter.delete('/detalhes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const totalAlocacoes = await prisma.boxStorageLocation.count({ where: { detailId: id } });
    if (totalAlocacoes > 0) {
      res.status(400).json({ error: `Nao e possivel excluir: ha ${totalAlocacoes} caixa(s) alocada(s) neste detalhe.` });
      return;
    }
    await prisma.storagePositionDetail.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── ALOCAÇÃO ─────────────────────────────────────────────────────────────────

// POST /armazenagem/alocar
// Body: { localizacao, detailId } — aloca ou move uma caixa
armazenagemRouter.post('/alocar', async (req, res, next) => {
  try {
    const { localizacao, detailId } = z.object({
      localizacao: z.string().trim().min(1),
      detailId: z.number().int().positive(),
    }).parse(req.body);

    const username = getUsername(req);

    // Verifica se o detalhe existe
    const detalhe = await prisma.storagePositionDetail.findUnique({ where: { id: detailId } });
    if (!detalhe) {
      res.status(404).json({ error: 'Detalhe de posicao nao encontrado.' });
      return;
    }

    // Busca alocação anterior (se houver)
    const anterior = await prisma.boxStorageLocation.findUnique({ where: { localizacao } });
    const fromDetailId = anterior?.detailId ?? null;

    // Upsert da alocação
    await prisma.boxStorageLocation.upsert({
      where: { localizacao },
      update: { detailId },
      create: { localizacao, detailId },
    });

    // Registra histórico somente se mudou de lugar
    if (fromDetailId !== detailId) {
      await prisma.boxStorageHistory.create({
        data: {
          localizacao,
          fromDetailId,
          toDetailId: detailId,
          changedBy: username,
        },
      });
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /armazenagem/alocar/:localizacao
// Remove a alocação de uma caixa (deixa sem local)
armazenagemRouter.delete('/alocar/:localizacao', async (req, res, next) => {
  try {
    const localizacao = decodeURIComponent(req.params.localizacao);
    const username = getUsername(req);

    const anterior = await prisma.boxStorageLocation.findUnique({ where: { localizacao } });
    if (!anterior) {
      res.status(404).json({ error: 'Caixa nao esta alocada.' });
      return;
    }

    await prisma.boxStorageLocation.delete({ where: { localizacao } });
    await prisma.boxStorageHistory.create({
      data: {
        localizacao,
        fromDetailId: anterior.detailId,
        toDetailId: anterior.detailId, // mesmo destino — marcamos como "removido" via observacao
        changedBy: username,
        observacao: 'Alocacao removida',
      },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── CAIXAS DISPONÍVEIS ───────────────────────────────────────────────────────

// GET /armazenagem/caixas
// Retorna todas as caixas (localizacoes distintas) com sua alocação WM atual
armazenagemRouter.get('/caixas', async (_req, res, next) => {
  try {
    const [pecas, preCadastros, alocacoes] = await Promise.all([
      prisma.peca.findMany({
        where: { disponivel: true, emPrejuizo: false },
        select: { localizacao: true },
      }),
      prisma.cadastroPeca.findMany({
        where: { status: 'pre_cadastro', localizacao: { not: null } },
        select: { localizacao: true },
      }),
      prisma.boxStorageLocation.findMany({
        include: {
          detail: {
            include: {
              posicao: { include: { area: true } },
            },
          },
        },
      }),
    ]);

    const todasLocalizacoes = new Set<string>();
    for (const p of [...pecas, ...preCadastros]) {
      const loc = String(p.localizacao || '').trim();
      if (loc) todasLocalizacoes.add(loc);
    }

    const alocacaoByLoc = new Map(alocacoes.map((a) => [a.localizacao, a]));

    const caixas = Array.from(todasLocalizacoes)
      .sort()
      .map((loc) => {
        const aloc = alocacaoByLoc.get(loc);
        return {
          localizacao: loc,
          alocada: !!aloc,
          detailId: aloc?.detailId ?? null,
          detailNome: aloc?.detail.nome ?? null,
          posicaoNome: aloc?.detail.posicao.nome ?? null,
          areaNome: aloc?.detail.posicao.area.nome ?? null,
          enderecoCompleto: aloc
            ? `${aloc.detail.posicao.area.nome} › ${aloc.detail.posicao.nome} › ${aloc.detail.nome}`
            : null,
        };
      });

    res.json(caixas);
  } catch (e) { next(e); }
});

// ─── HISTÓRICO ────────────────────────────────────────────────────────────────

// GET /armazenagem/historico/:localizacao
armazenagemRouter.get('/historico/:localizacao', async (req, res, next) => {
  try {
    const localizacao = decodeURIComponent(req.params.localizacao);
    const historico = await prisma.boxStorageHistory.findMany({
      where: { localizacao },
      orderBy: { changedAt: 'desc' },
      take: 50,
      include: {
        fromDetail: { include: { posicao: { include: { area: true } } } },
        toDetail:   { include: { posicao: { include: { area: true } } } },
      },
    });

    const resultado = historico.map((h) => ({
      id: h.id,
      changedAt: h.changedAt,
      changedBy: h.changedBy,
      observacao: h.observacao,
      de: h.fromDetail
        ? `${h.fromDetail.posicao.area.nome} › ${h.fromDetail.posicao.nome} › ${h.fromDetail.nome}`
        : null,
      para: `${h.toDetail.posicao.area.nome} › ${h.toDetail.posicao.nome} › ${h.toDetail.nome}`,
    }));

    res.json(resultado);
  } catch (e) { next(e); }
});
