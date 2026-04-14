import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

export const motosRouter = Router();

const motoSchema = z.object({
  marca:        z.string().min(1),
  modelo:       z.string().min(1),
  ano:          z.number().int().optional().nullable(),
  cor:          z.string().optional().nullable(),
  placa:        z.string().optional().nullable(),
  chassi:       z.string().optional().nullable(),
  renavam:      z.string().optional().nullable(),
  dataCompra:   z.string().optional().nullable(),
  precoCompra:  z.number().default(0),
  origemCompra: z.string().optional().nullable(),
  observacoes:  z.string().optional().nullable(),
});

const detranEtiquetaStatusSchema = z.object({
  status: z.enum(['ativa', 'baixada']),
});

const motoAnexosSchema = z.object({
  anexos: z.record(z.any()).default({}),
  removidos: z.array(z.string()).default([]),
});

const MOTO_ANEXO_KEYS = [
  'nfeLeilao',
  'atpve',
  'baixaDetran',
  'nfeEntrada',
  'certBaixa',
  'recibo',
  'editalLeilao',
  'laudoDescaracterizacao',
  'fotoDianteira',
  'fotoTraseira',
  'fotoLateralDireita',
  'fotoLateralEsquerda',
  'fotoPainel',
  'fotoChassi',
  'fotoNumeroMotor',
] as const;

function normalizeAttachment(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = String((value as any).name || '').trim();
  const dataUrl = String((value as any).dataUrl || '').trim();
  if (!name || !dataUrl.startsWith('data:')) return null;
  return { name, dataUrl };
}

function normalizeMotoAnexos(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const anexos: Record<string, { name: string; dataUrl: string }> = {};
  for (const key of MOTO_ANEXO_KEYS) {
    const current = normalizeAttachment(source[key]);
    if (current) anexos[key] = current;
  }
  return anexos;
}

function countMotoAnexos(value: unknown) {
  return Object.keys(normalizeMotoAnexos(value)).length;
}

function normalizeDetranEtiqueta(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
  return text || null;
}

// GET /motos
motosRouter.get('/', async (req, res, next) => {
  try {
    const motos = await prisma.moto.findMany({
      include: {
        pecas: {
          select: {
            id: true,
            disponivel: true,
            emPrejuizo: true,
            precoML: true,
            valorLiq: true,
            detranEtiqueta: true,
            detranBaixada: true,
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    const result = motos.map(m => {
      const disponiveis = m.pecas.filter(p => p.disponivel && !p.emPrejuizo);
      const vendidas    = m.pecas.filter(p => !p.disponivel && !p.emPrejuizo);

      // Receita = Preço ML das vendidas (valor bruto)
      const receita = vendidas.reduce((s, p) => s + Number(p.precoML), 0);

      // Valor estoque = Preço ML das disponíveis
      const valorEst = disponiveis.reduce((s, p) => s + Number(p.precoML), 0);

      // Lucro previsto = igual ao Excel:
      // (Valor Líq. vendidas + Valor Líq. em estoque) - Preço Compra
      // Valor Líquido = já descontado taxa ML + frete
      const vlVendidas  = vendidas.reduce((s, p) => s + Number(p.valorLiq), 0);
      const vlEstoque   = disponiveis.reduce((s, p) => s + Number(p.valorLiq), 0);
      const lucro       = (vlVendidas + vlEstoque) - Number(m.precoCompra);
      const detranPecas = m.pecas.filter((p) => normalizeDetranEtiqueta(p.detranEtiqueta));
      const detranCount = detranPecas.length;
      const detranAtivas = detranPecas.filter((p) => !p.detranBaixada).length;
      const detranBaixadas = detranPecas.filter((p) => p.detranBaixada).length;

      // % recuperada = quanto do investimento já voltou (valor líq. vendidas / preço compra)
      const pctRecuperada = Number(m.precoCompra) > 0
        ? Math.round(vlVendidas / Number(m.precoCompra) * 100)
        : 0;

      return {
        ...m,
        precoCompra:    Number(m.precoCompra),
        qtdDisp:        disponiveis.length,
        qtdVendidas:    vendidas.length,
        receitaTotal:   receita,
        valorEstoque:   valorEst,
        vlVendidas,
        vlEstoque,
        lucro,
        pctRecuperada,
        qtdRelacionadas: m.pecas.length,
        detranCount,
        detranAtivas,
        detranBaixadas,
        temDetran: detranCount > 0,
        anexosCount: countMotoAnexos((m as any).anexos),
        temAnexos: countMotoAnexos((m as any).anexos) > 0,
        pecas: undefined,
      };
    });

    res.json(result);
  } catch (e) { next(e); }
});

// GET /motos/:id/detran-etiquetas
motosRouter.get('/:id/detran-etiquetas', async (req, res, next) => {
  try {
    const motoId = Number(req.params.id);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return res.status(400).json({ error: 'Moto invalida' });
    }

    const pecas = await prisma.peca.findMany({
      where: {
        motoId,
        detranEtiqueta: { not: null },
      },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranBaixada: true,
        detranBaixadaAt: true,
      },
      orderBy: { idPeca: 'asc' },
    });

    const itens = pecas
      .map((peca) => ({
        id: peca.id,
        idPeca: peca.idPeca,
        descricao: peca.descricao,
        detranEtiqueta: normalizeDetranEtiqueta(peca.detranEtiqueta),
        detranStatus: peca.detranBaixada ? 'baixada' : 'ativa',
        detranStatusLabel: peca.detranBaixada ? 'Baixada' : 'Ativa',
        detranBaixada: !!peca.detranBaixada,
        detranBaixadaAt: peca.detranBaixadaAt,
      }))
      .filter((peca) => peca.detranEtiqueta);

    res.json({
      ok: true,
      motoId,
      total: itens.length,
      itens,
    });
  } catch (e) { next(e); }
});

// PATCH /motos/pecas/:pecaId/detran-status
motosRouter.patch('/pecas/:pecaId/detran-status', async (req, res, next) => {
  try {
    const pecaId = Number(req.params.pecaId);
    if (!Number.isInteger(pecaId) || pecaId <= 0) {
      return res.status(400).json({ error: 'Peca invalida' });
    }

    const payload = detranEtiquetaStatusSchema.parse(req.body || {});
    const current = await prisma.peca.findUnique({
      where: { id: pecaId },
      select: {
        id: true,
        motoId: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranBaixada: true,
        detranBaixadaAt: true,
      },
    });

    if (!current) {
      return res.status(404).json({ error: 'Peca nao encontrada' });
    }

    const detranEtiqueta = normalizeDetranEtiqueta(current.detranEtiqueta);
    if (!detranEtiqueta) {
      return res.status(400).json({ error: 'A peca nao possui etiqueta DETRAN' });
    }

    const detranBaixada = payload.status === 'baixada';
    const updated = await prisma.peca.update({
      where: { id: pecaId },
      data: {
        detranBaixada,
        detranBaixadaAt: detranBaixada ? new Date() : null,
      },
      select: {
        id: true,
        motoId: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        detranBaixada: true,
        detranBaixadaAt: true,
      },
    });

    res.json({
      ok: true,
      item: {
        id: updated.id,
        motoId: updated.motoId,
        idPeca: updated.idPeca,
        descricao: updated.descricao,
        detranEtiqueta: normalizeDetranEtiqueta(updated.detranEtiqueta),
        detranStatus: updated.detranBaixada ? 'baixada' : 'ativa',
        detranStatusLabel: updated.detranBaixada ? 'Baixada' : 'Ativa',
        detranBaixada: !!updated.detranBaixada,
        detranBaixadaAt: updated.detranBaixadaAt,
      },
    });
  } catch (e) { next(e); }
});

// GET /motos/:id/anexos
motosRouter.get('/:id/anexos', async (req, res, next) => {
  try {
    const motoId = Number(req.params.id);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return res.status(400).json({ error: 'Moto invalida' });
    }

    const moto = await prisma.moto.findUnique({
      where: { id: motoId },
      select: {
        id: true,
        marca: true,
        modelo: true,
        ano: true,
        anexos: true,
      },
    });

    if (!moto) {
      return res.status(404).json({ error: 'Moto nao encontrada' });
    }

    const anexos = normalizeMotoAnexos((moto as any).anexos);

    res.json({
      ok: true,
      motoId: moto.id,
      moto: `${moto.marca} ${moto.modelo}`,
      ano: moto.ano,
      anexos,
      total: Object.keys(anexos).length,
    });
  } catch (e) { next(e); }
});

// PUT /motos/:id/anexos
motosRouter.put('/:id/anexos', async (req, res, next) => {
  try {
    const motoId = Number(req.params.id);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return res.status(400).json({ error: 'Moto invalida' });
    }

    const payload = motoAnexosSchema.parse(req.body || {});
    const motoAtual = await prisma.moto.findUnique({
      where: { id: motoId },
      select: {
        id: true,
        marca: true,
        modelo: true,
        ano: true,
        anexos: true,
      },
    });

    if (!motoAtual) {
      return res.status(404).json({ error: 'Moto nao encontrada' });
    }

    const anexosAtuais = normalizeMotoAnexos((motoAtual as any).anexos);
    const anexosAtualizados = normalizeMotoAnexos(payload.anexos);
    const removidos = Array.isArray(payload.removidos)
      ? payload.removidos.filter((key) => MOTO_ANEXO_KEYS.includes(key as typeof MOTO_ANEXO_KEYS[number]))
      : [];

    const anexos = {
      ...anexosAtuais,
      ...anexosAtualizados,
    } as Record<string, { name: string; dataUrl: string }>;

    for (const key of removidos) {
      delete anexos[key];
    }

    const moto = await prisma.moto.update({
      where: { id: motoId },
      data: { anexos },
      select: {
        id: true,
        marca: true,
        modelo: true,
        ano: true,
        anexos: true,
      },
    });

    res.json({
      ok: true,
      motoId: moto.id,
      moto: `${moto.marca} ${moto.modelo}`,
      ano: moto.ano,
      anexos: normalizeMotoAnexos((moto as any).anexos),
      total: countMotoAnexos((moto as any).anexos),
    });
  } catch (e) { next(e); }
});

// GET /motos/:id
motosRouter.get('/:id', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUniqueOrThrow({
      where: { id: Number(req.params.id) },
      include: { pecas: { orderBy: { idPeca: 'asc' } } }
    });
    res.json(moto);
  } catch (e) { next(e); }
});

// POST /motos
motosRouter.post('/', async (req, res, next) => {
  try {
    const data = motoSchema.parse(req.body);
    const moto = await prisma.moto.create({
      data: {
        ...data,
        dataCompra: data.dataCompra ? new Date(data.dataCompra) : null,
      }
    });
    res.status(201).json(moto);
  } catch (e) { next(e); }
});

// PUT /motos/:id
motosRouter.put('/:id', async (req, res, next) => {
  try {
    const data = motoSchema.partial().parse(req.body);
    const moto = await prisma.moto.update({
      where: { id: Number(req.params.id) },
      data: {
        ...data,
        dataCompra: data.dataCompra ? new Date(data.dataCompra) : undefined,
      }
    });
    res.json(moto);
  } catch (e) { next(e); }
});

// DELETE /motos/:id
motosRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.moto.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
