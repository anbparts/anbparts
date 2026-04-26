import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { sendDetranBaixaEmailIfNeeded } from '../lib/detran-alert';
import { compressDataUrlImage, normalizeImageFileName } from '../lib/image';
import { z } from 'zod';

export const pecasRouter = Router();

const DEFAULT_SELL_FRETE = 29.9;
const DEFAULT_TAXA_PCT = 17;
const CAIXA_SEM_LOCALIZACAO = 'Sem Localizacao';
const PREJUIZO_MOTIVOS = new Set([
  'Extravio no Envio',
  'Defeito',
  'SKU Cancelado',
  'Peça Restrita - Sem Revenda',
  'Extravio no Estoque',
]);

const pecaBaseSchema = z.object({
  motoId:        z.number().int(),
  descricao:     z.string().min(1),
  localizacao:   z.string().optional().nullable(),
  detranEtiqueta: z.string().optional().nullable(),
  numeroPeca:    z.string().optional().nullable(),
  pesoLiquido:   z.number().optional().nullable(),
  pesoBruto:     z.number().optional().nullable(),
  largura:       z.number().optional().nullable(),
  altura:        z.number().optional().nullable(),
  profundidade:  z.number().optional().nullable(),
  precoML:       z.number().default(0),
  valorLiq:      z.number().default(0),
  valorFrete:    z.number().default(0),
  valorTaxas:    z.number().default(0),
  disponivel:    z.boolean().default(true),
  blingPedidoNum: z.string().optional().nullable(),
  dataVenda:     z.string().optional().nullable(),
  cadastro:      z.string().optional().nullable(),
});

const createPecaSchema = pecaBaseSchema.extend({
  idPeca: z.string().trim().min(1).optional().nullable(),
});

const updatePecaSchema = pecaBaseSchema.partial();

const prejuizoPayloadSchema = z.object({
  motivo: z.string().min(1),
  motoId: z.number().int().optional(),
  descricao: z.string().min(1).optional(),
  cadastro: z.string().optional().nullable(),
  precoML: z.number().optional(),
  valorFrete: z.number().optional(),
  valorTaxas: z.number().optional(),
  observacao: z.string().optional().nullable(),
});

const bulkDeletePecasSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

const fotoCapaPayloadSchema = z.object({
  fotoCapaNome: z.string().trim().min(1).nullable().optional(),
  fotoCapaArquivo: z.string().trim().min(1).nullable().optional(),
}).superRefine((value, ctx) => {
  const hasNome = Boolean(value.fotoCapaNome);
  const hasArquivo = Boolean(value.fotoCapaArquivo);

  if (hasNome !== hasArquivo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe nome e arquivo da foto capa juntos.',
    });
  }

  if (hasArquivo && !String(value.fotoCapaArquivo).startsWith('data:image/')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Arquivo da foto capa invalido.',
    });
  }
});

function isBrunoAuthUser(req: any) {
  return String(req?.authUser?.username || '').trim().toLowerCase() === 'bruno';
}

async function gerarIdPeca(): Promise<string> {
  const last = await prisma.peca.findFirst({ orderBy: { idPeca: 'desc' } });
  if (!last) return 'PN0001';
  const num = parseInt(last.idPeca.replace('PN', '')) + 1;
  return 'PN' + String(num).padStart(4, '0');
}

function inferDefaultIdFormat(prefixo: string) {
  return prefixo.toUpperCase() === 'PN' ? 'plain' : 'underscore';
}

function normalizeIdPeca(value: string) {
  return String(value || '').trim().toUpperCase();
}

function countDetranEtiquetas(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return 0;

  return text
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function extractSequenceForPrefix(idPeca: string, prefixo: string) {
  const normalizedId = normalizeIdPeca(idPeca);
  const normalizedPrefix = normalizeIdPeca(prefixo);
  const withoutSuffix = normalizedId.replace(/-\d+$/, '');

  if (withoutSuffix.startsWith(`${normalizedPrefix}_`)) {
    const numericPart = withoutSuffix.slice(normalizedPrefix.length + 1);
    if (/^\d+$/.test(numericPart)) {
      return {
        number: Number(numericPart),
        width: numericPart.length,
        format: 'underscore' as const,
      };
    }
  }

  if (withoutSuffix.startsWith(normalizedPrefix)) {
    const numericPart = withoutSuffix.slice(normalizedPrefix.length);
    if (/^\d+$/.test(numericPart)) {
      return {
        number: Number(numericPart),
        width: numericPart.length,
        format: 'plain' as const,
      };
    }
  }

  return null;
}

function buildSuggestedId(prefixo: string, nextNumber: number, width: number, format: 'plain' | 'underscore') {
  const padded = String(nextNumber).padStart(width, '0');
  return format === 'underscore' ? `${prefixo}_${padded}` : `${prefixo}${padded}`;
}

async function getProdutoConfig() {
  const cfg = await prisma.blingConfig.findFirst();
  const prefixos = cfg && Array.isArray(cfg.prefixos) ? (cfg.prefixos as any[]) : [];

  return {
    prefixos,
    fretePadrao: roundMoney(Math.max(0, Number(cfg?.fretePadrao) || DEFAULT_SELL_FRETE)),
    taxaPadraoPct: roundMoney(Math.max(0, Number(cfg?.taxaPadraoPct) || DEFAULT_TAXA_PCT)),
  };
}

async function suggestIdPecaForMoto(motoId: number) {
  const cfg = await getProdutoConfig();
  const prefixoConfig = cfg.prefixos.find((item) => Number(item?.motoId) === Number(motoId));
  const prefixo = prefixoConfig?.prefixo ? normalizeIdPeca(prefixoConfig.prefixo) : '';

  if (!prefixo) {
    return {
      prefixo: null,
      sugestao: await gerarIdPeca(),
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    };
  }

  const candidates = await prisma.peca.findMany({
    where: {
      OR: [
        { motoId: Number(motoId) },
        { idPeca: { startsWith: prefixo } },
      ],
    },
    select: { idPeca: true, motoId: true },
  });

  const motoMatches = candidates
    .filter((item) => item.motoId === Number(motoId))
    .map((item) => extractSequenceForPrefix(item.idPeca, prefixo))
    .filter(Boolean) as Array<{ number: number; width: number; format: 'plain' | 'underscore' }>;

  const prefixMatches = candidates
    .map((item) => extractSequenceForPrefix(item.idPeca, prefixo))
    .filter(Boolean) as Array<{ number: number; width: number; format: 'plain' | 'underscore' }>;

  const referenceMatches = motoMatches.length ? motoMatches : prefixMatches;
  const highest = [...referenceMatches].sort((a, b) => b.number - a.number)[0];
  const nextNumber = (highest?.number || 0) + 1;
  const width = highest?.width || 4;
  const format = highest?.format || inferDefaultIdFormat(prefixo);

  return {
    prefixo,
    sugestao: buildSuggestedId(prefixo, nextNumber, width, format),
    fretePadrao: cfg.fretePadrao,
    taxaPadraoPct: cfg.taxaPadraoPct,
  };
}

function parseDateStart(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function parseDateEnd(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2));
}

function normalizePecaLocalizacao(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function normalizeQueryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeQueryList(item));
  }

  return String(value ?? '')
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeAsciiText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function calculatePecaFinancialValues(
  current: { precoML: any; valorFrete: any; valorTaxas: any },
  nextPrecoML?: number,
  nextFrete?: number,
  nextTaxaValor?: number,
) {
  const precoML = roundMoney(Math.max(0, nextPrecoML !== undefined ? Number(nextPrecoML) || 0 : Number(current.precoML) || 0));
  const valorFrete = roundMoney(Math.max(0, nextFrete !== undefined ? Number(nextFrete) || 0 : Number(current.valorFrete) || 0));
  const valorTaxas = roundMoney(Math.max(0, nextTaxaValor !== undefined ? Number(nextTaxaValor) || 0 : Number(current.valorTaxas) || 0));
  const valorLiq = roundMoney(precoML - valorFrete - valorTaxas);

  return { precoML, valorFrete, valorTaxas, valorLiq };
}

function calculateManualSaleValues(
  peca: { precoML: any; valorFrete: any; valorTaxas: any },
  nextPrecoML?: number,
  nextFrete?: number,
  nextTaxaValor?: number,
) {
  const precoAtual = Number(peca.precoML) || 0;
  const precoVenda = nextPrecoML !== undefined ? Number(nextPrecoML) || 0 : precoAtual;
  const freteAtual = Number(peca.valorFrete) || 0;
  const taxasAtuais = Number(peca.valorTaxas) || 0;

  const valorFrete = nextFrete !== undefined
    ? roundMoney(Math.max(0, Number(nextFrete) || 0))
    : (freteAtual > 0 ? roundMoney(freteAtual) : DEFAULT_SELL_FRETE);
  const valorTaxas = nextTaxaValor !== undefined
    ? roundMoney(Math.max(0, Number(nextTaxaValor) || 0))
    : roundMoney(precoVenda * (
      precoAtual > 0 && taxasAtuais > 0
        ? (taxasAtuais / precoAtual)
        : (DEFAULT_TAXA_PCT / 100)
    ));
  const valorLiq = roundMoney(precoVenda - valorFrete - valorTaxas);

  return {
    precoML: precoVenda,
    valorFrete,
    valorTaxas,
    valorLiq,
  };
}

// GET /pecas
pecasRouter.get('/', async (req, res, next) => {
  try {
    const {
      motoId,
      marca,
      disponivel,
      mercadoLivreLink,
      localizacao,
      caixas,
      sku,
      search,
      numeroPeca,
      dataVendaFrom,
      dataVendaTo,
      detranEtiqueta,
      imagem,
      detranEtiquetaTexto,
      dimensoes,
      page = '1',
      per = '20',
      orderBy = 'cadastro',
      orderDir = 'desc',
    } = req.query as any;
    const searchText = String(search || '').trim();
    const skuText = normalizeIdPeca(String(sku || ''));
    const detranEtiquetaText = String(detranEtiquetaTexto || '').trim().toUpperCase();
    const where: any = searchText ? {} : { emPrejuizo: false };
    const andConditions: any[] = [];
    if (motoId) where.motoId = Number(motoId);
    if (marca) {
      andConditions.push({
        moto: {
          is: {
            marca: { contains: String(marca).trim(), mode: 'insensitive' },
          },
        },
      });
    }
    if (disponivel !== undefined) where.disponivel = disponivel === 'true';
    if (mercadoLivreLink === 'com') {
      andConditions.push({ mercadoLivreLink: { not: null } });
      andConditions.push({ NOT: { mercadoLivreLink: '' } });
    }
    if (mercadoLivreLink === 'sem') {
      andConditions.push({
        OR: [
          { mercadoLivreLink: null },
          { mercadoLivreLink: '' },
        ],
      });
    }
    if (localizacao === 'com') {
      andConditions.push({ localizacao: { not: null } });
      andConditions.push({ NOT: { localizacao: '' } });
    }
    if (localizacao === 'sem') {
      andConditions.push({
        OR: [
          { localizacao: null },
          { localizacao: '' },
        ],
      });
    }
    const caixasSelecionadas = normalizeQueryList(caixas);
    if (caixasSelecionadas.length) {
      const incluiSemLocalizacao = caixasSelecionadas.some((item) => normalizeAsciiText(item) === normalizeAsciiText(CAIXA_SEM_LOCALIZACAO));
      const caixasPreenchidas = caixasSelecionadas
        .map((item) => normalizePecaLocalizacao(item))
        .filter((item): item is string => Boolean(item) && normalizeAsciiText(item) !== normalizeAsciiText(CAIXA_SEM_LOCALIZACAO));

      const caixasConditions: any[] = [];

      if (caixasPreenchidas.length) {
        caixasConditions.push({ localizacao: { in: caixasPreenchidas } });
      }

      if (incluiSemLocalizacao) {
        caixasConditions.push({ localizacao: null });
        caixasConditions.push({ localizacao: '' });
      }

      if (caixasConditions.length) {
        andConditions.push({ OR: caixasConditions });
      }
    }
    // Filtro etiqueta detran
    if (detranEtiqueta === 'com') {
      andConditions.push({ detranEtiqueta: { not: null } });
      andConditions.push({ NOT: { detranEtiqueta: '' } });
      // Mostra também peças em prejuízo que têm etiqueta cadastrada
      delete where.emPrejuizo;
    }
    if (detranEtiqueta === 'sem') {
      andConditions.push({ OR: [{ detranEtiqueta: null }, { detranEtiqueta: '' }] });
    }
    if (imagem === 'com') {
      andConditions.push({ fotoCapaArquivo: { not: null } });
      andConditions.push({ NOT: { fotoCapaArquivo: '' } });
    }
    if (imagem === 'sem') {
      andConditions.push({
        OR: [
          { fotoCapaArquivo: null },
          { fotoCapaArquivo: '' },
        ],
      });
    }
    if (detranEtiquetaText) {
      andConditions.push({ detranEtiqueta: { contains: detranEtiquetaText } });
      delete where.emPrejuizo;
    }
    // Filtro dimensoes (largura, altura e profundidade todas preenchidas e > 0)
    if (dimensoes === 'com') {
      andConditions.push({ largura: { not: null, gt: 0 } });
      andConditions.push({ altura: { not: null, gt: 0 } });
      andConditions.push({ profundidade: { not: null, gt: 0 } });
    }
    if (dimensoes === 'sem') {
      andConditions.push({
        OR: [
          { largura: null }, { largura: 0 },
          { altura: null }, { altura: 0 },
          { profundidade: null }, { profundidade: 0 },
        ],
      });
    }
    if (skuText) {
      andConditions.push({ idPeca: { startsWith: skuText } });
    }
    if (searchText) {
      andConditions.push({
        OR: [
          { idPeca: { contains: searchText, mode: 'insensitive' } },
          { descricao: { contains: searchText, mode: 'insensitive' } },
          { blingPedidoNum: { contains: searchText, mode: 'insensitive' } },
        ],
      });
    }
    if (numeroPeca) {
      const numeroPecaText = String(numeroPeca).trim();
      if (numeroPecaText) {
        andConditions.push({ numeroPeca: { contains: numeroPecaText, mode: 'insensitive' } });
      }
    }
    if (andConditions.length) {
      where.AND = andConditions;
    }
    if (dataVendaFrom || dataVendaTo) {
      where.dataVenda = {};
      if (dataVendaFrom) where.dataVenda.gte = parseDateStart(dataVendaFrom);
      if (dataVendaTo) where.dataVenda.lte = parseDateEnd(dataVendaTo);
    }

    const normalizedOrderDir = String(orderDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderByMap: Record<string, any> = {
      motoId: { motoId: normalizedOrderDir },
      idPeca: { idPeca: normalizedOrderDir },
      descricao: { descricao: normalizedOrderDir },
      localizacao: { localizacao: normalizedOrderDir },
      cadastro: { cadastro: normalizedOrderDir },
      precoML: { precoML: normalizedOrderDir },
      valorLiq: { valorLiq: normalizedOrderDir },
      valorFrete: { valorFrete: normalizedOrderDir },
      valorTaxas: { valorTaxas: normalizedOrderDir },
      dataVenda: { dataVenda: normalizedOrderDir },
      blingPedidoNum: { blingPedidoNum: normalizedOrderDir },
      detranEtiqueta: { detranEtiqueta: normalizedOrderDir },
      disponivel: { disponivel: normalizedOrderDir },
      moto: [
        { moto: { marca: normalizedOrderDir } },
        { moto: { modelo: normalizedOrderDir } },
      ],
    };
    const normalizedOrderBy = String(orderBy || 'cadastro');
    const prismaOrderBy = orderByMap[normalizedOrderBy] || orderByMap.cadastro;

    const etiquetasWhere: any = { ...where };
    delete etiquetasWhere.emPrejuizo;

    const [total, pecas, totalDisp, totalVend, etiquetas] = await Promise.all([
      prisma.peca.count({ where }),
      prisma.peca.findMany({
        where,
        include: { moto: { select: { marca: true, modelo: true, etiquetaSkuLabel: true } } },
        orderBy: prismaOrderBy,
        skip: (Number(page) - 1) * Number(per),
        take: Number(per),
      }),
      prisma.peca.count({ where: { ...where, disponivel: true } }),
      prisma.peca.count({ where: { ...where, disponivel: false, dataVenda: { not: null } } }),
      prisma.peca.findMany({
        where: etiquetasWhere,
        select: {
          detranEtiqueta: true,
        },
      }),
    ]);

    const totalEtiquetas = etiquetas.reduce((sum, item) => sum + countDetranEtiquetas(item.detranEtiqueta), 0);

    res.json({ total, totalDisp, totalVend, totalEtiquetas, page: Number(page), per: Number(per), data: pecas });
  } catch (e) { next(e); }
});

pecasRouter.get('/caixas', async (_req, res, next) => {
  try {
    const pecas = await prisma.peca.findMany({
      where: {
        disponivel: true,
        emPrejuizo: false,
      },
      select: {
        idPeca: true,
        localizacao: true,
      },
      orderBy: {
        localizacao: 'asc',
      },
    });

    const counters = new Map<string, { totalPecas: number; skus: Set<string> }>();
    let semLocalizacaoCount = 0;
    const semLocalizacaoSkus = new Set<string>();

    for (const peca of pecas) {
      const caixa = normalizePecaLocalizacao(peca.localizacao);
      const skuBase = String(peca.idPeca || '').replace(/-\d+$/, '');
      if (!caixa) {
        semLocalizacaoCount += 1;
        if (skuBase) semLocalizacaoSkus.add(skuBase);
        continue;
      }

      const current = counters.get(caixa) || { totalPecas: 0, skus: new Set<string>() };
      current.totalPecas += 1;
      if (skuBase) current.skus.add(skuBase);
      counters.set(caixa, current);
    }

    const data = Array.from(counters.entries())
      .map(([caixa, summary]) => ({
        caixa,
        totalPecas: summary.totalPecas,
        totalSkus: summary.skus.size,
      }))
      .sort((a, b) => a.caixa.localeCompare(b.caixa, 'pt-BR', { numeric: true, sensitivity: 'base' }));

    if (semLocalizacaoCount > 0) {
      data.unshift({
        caixa: CAIXA_SEM_LOCALIZACAO,
        totalPecas: semLocalizacaoCount,
        totalSkus: semLocalizacaoSkus.size,
      });
    }

    res.json({
      total: data.length,
      data,
    });
  } catch (e) {
    next(e);
  }
});

// GET /pecas/sugestao-id
pecasRouter.get('/sugestao-id', async (req, res, next) => {
  try {
    const motoId = Number(req.query.motoId);
    if (!Number.isInteger(motoId) || motoId <= 0) {
      return res.status(400).json({ error: 'Moto invalida para gerar sugestao' });
    }

    const sugestao = await suggestIdPecaForMoto(motoId);
    res.json(sugestao);
  } catch (e) { next(e); }
});

// POST /pecas
pecasRouter.post('/', async (req, res, next) => {
  try {
    const data = createPecaSchema.parse(req.body);
    const suggested = await suggestIdPecaForMoto(Number(data.motoId));
    const idPeca = data.idPeca ? normalizeIdPeca(data.idPeca) : suggested.sugestao;
    const existing = await prisma.peca.findUnique({ where: { idPeca } });
    if (existing) {
      return res.status(400).json({ error: 'ID da peca ja existe no sistema' });
    }

    const financials = calculatePecaFinancialValues(
      data,
      Number(data.precoML),
      Number(data.valorFrete),
      Number(data.valorTaxas),
    );
    const peca = await prisma.peca.create({
      data: {
        motoId: data.motoId,
        descricao: data.descricao,
        precoML: financials.precoML,
        valorLiq: financials.valorLiq,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        disponivel: data.disponivel,
        emPrejuizo: false,
        blingPedidoNum: data.blingPedidoNum ? String(data.blingPedidoNum).trim() : null,
        localizacao: normalizePecaLocalizacao(data.localizacao),
        idPeca,
        cadastro:  data.cadastro  ? new Date(data.cadastro)  : new Date(),
        dataVenda: data.dataVenda ? new Date(data.dataVenda) : null,
      }
    });
    res.status(201).json(peca);
  } catch (e) { next(e); }
});

// PUT /pecas/:id
pecasRouter.put('/:id', async (req, res, next) => {
  try {
    const data = updatePecaSchema.parse(req.body);
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, precoML: true, valorFrete: true, valorTaxas: true, emPrejuizo: true },
    });
    if (!current) return res.status(404).json({ error: 'Peca nao encontrada' });
    if (current.emPrejuizo) {
      return res.status(400).json({ error: 'Peca em prejuizo nao pode ser editada pela tela de estoque' });
    }

    const financials = calculatePecaFinancialValues(
      current,
      data.precoML !== undefined ? Number(data.precoML) : undefined,
      data.valorFrete !== undefined ? Number(data.valorFrete) : undefined,
      data.valorTaxas !== undefined ? Number(data.valorTaxas) : undefined,
    );
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        ...data,
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
        blingPedidoNum: data.blingPedidoNum !== undefined
          ? (data.blingPedidoNum ? String(data.blingPedidoNum).trim() : null)
          : undefined,
        localizacao: data.localizacao !== undefined
          ? normalizePecaLocalizacao(data.localizacao)
          : undefined,
        cadastro:  data.cadastro  ? new Date(data.cadastro)  : undefined,
        dataVenda: data.dataVenda ? new Date(data.dataVenda) : null,
      }
    });
    res.json(peca);
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/foto-capa
pecasRouter.patch('/:id/foto-capa', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Peca invalida' });
    }

    const payload = fotoCapaPayloadSchema.parse(req.body || {});
    const pecaAtual = await prisma.peca.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!pecaAtual) {
      return res.status(404).json({ error: 'Peca nao encontrada' });
    }

    let fotoCapaNome = payload.fotoCapaNome || null;
    let fotoCapaArquivo = payload.fotoCapaArquivo || null;

    if (fotoCapaArquivo) {
      const preparedImage = await compressDataUrlImage(fotoCapaArquivo);
      fotoCapaArquivo = preparedImage.dataUrl;
      fotoCapaNome = normalizeImageFileName(fotoCapaNome, preparedImage.extension);
    }

    const peca = await prisma.peca.update({
      where: { id },
      data: {
        fotoCapaNome,
        fotoCapaArquivo,
      },
    });

    res.json({
      id: peca.id,
      fotoCapaNome: peca.fotoCapaNome,
      fotoCapaArquivo: peca.fotoCapaArquivo,
    });
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/cancelar-venda
pecasRouter.patch('/:id/cancelar-venda', async (req, res, next) => {
  try {
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, precoML: true, valorFrete: true, valorTaxas: true }
    });
    if (!current) return res.status(404).json({ error: 'Peca nao encontrada' });

    const financials = calculatePecaFinancialValues(current);
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        disponivel: true,
        emPrejuizo: false,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
      }
    });

    res.json(peca);
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/vender
pecasRouter.patch('/:id/vender', async (req, res, next) => {
  try {
    const { dataVenda, pedidoNum, precoML, frete, taxaValor } = req.body;
    if (!pedidoNum || !String(pedidoNum).trim()) {
      return res.status(400).json({ error: 'Numero do pedido e obrigatorio' });
    }
    const current = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        idPeca: true,
        descricao: true,
        detranEtiqueta: true,
        motoId: true,
        disponivel: true,
        emPrejuizo: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        moto: { select: { marca: true, modelo: true, etiquetaSkuLabel: true } },
      }
    });
    if (!current) return res.status(404).json({ error: 'Peça não encontrada' });

    if (current.emPrejuizo) {
      return res.status(400).json({ error: 'Peca em prejuizo nao pode ser vendida pela tela de estoque' });
    }
    if (!current.disponivel) {
      return res.status(400).json({ error: 'Peca nao esta disponivel para venda' });
    }

    const financials = calculateManualSaleValues(
      current,
      precoML !== undefined ? Number(precoML) : undefined,
      frete !== undefined ? Number(frete) : undefined,
      taxaValor !== undefined ? Number(taxaValor) : undefined,
    );
    const peca = await prisma.peca.update({
      where: { id: Number(req.params.id) },
      data: {
        disponivel: false,
        emPrejuizo: false,
        dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
        blingPedidoId: null,
        blingPedidoNum: String(pedidoNum).trim(),
        precoML: financials.precoML,
        valorFrete: financials.valorFrete,
        valorTaxas: financials.valorTaxas,
        valorLiq: financials.valorLiq,
      }
    });
    let alertaDetranEmailEnviado = false;
    let alertaDetranEmailErro: string | null = null;
    try {
      const resultadoEmailDetran = await sendDetranBaixaEmailIfNeeded([
        {
          idPeca: current.idPeca,
          descricao: current.descricao,
          detranEtiqueta: current.detranEtiqueta || '',
          motoId: current.motoId,
          moto: current.moto ? `${current.moto.marca} ${current.moto.modelo}`.trim() : null,
        },
      ]);
      alertaDetranEmailEnviado = !!resultadoEmailDetran?.sent;
    } catch (error: any) {
      alertaDetranEmailErro = error?.message || String(error);
    }

    res.json({ ...peca, alertaDetranEmailEnviado, alertaDetranEmailErro });
  } catch (e) { next(e); }
});

// PATCH /pecas/:id/prejuizo
pecasRouter.patch('/:id/prejuizo', async (req, res, next) => {
  try {
    const payload = prejuizoPayloadSchema.parse(req.body || {});
    const motivo = String(payload.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Motivo do prejuizo e obrigatorio' });
    if (!PREJUIZO_MOTIVOS.has(motivo)) {
      return res.status(400).json({ error: 'Motivo do prejuizo invalido' });
    }

    const peca = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        idPeca: true,
        motoId: true,
        descricao: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        disponivel: true,
        emPrejuizo: true,
      },
    });
    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });
    if (peca.emPrejuizo) return res.status(400).json({ error: 'Peca ja esta em prejuizo' });
    if (!peca.disponivel) return res.status(400).json({ error: 'So e possivel marcar prejuizo para pecas em estoque' });

    const descricao = payload.descricao ? String(payload.descricao).trim() : peca.descricao;
    const financials = calculatePecaFinancialValues(
      peca,
      payload.precoML !== undefined ? Number(payload.precoML) : undefined,
      payload.valorFrete !== undefined ? Number(payload.valorFrete) : undefined,
      payload.valorTaxas !== undefined ? Number(payload.valorTaxas) : undefined,
    );

    const detalhe = `${peca.idPeca} - ${descricao}`;
    const result = await prisma.$transaction(async (tx) => {
      await tx.peca.update({
        where: { id: peca.id },
        data: {
          motoId: payload.motoId !== undefined ? Number(payload.motoId) : undefined,
          descricao,
          cadastro: payload.cadastro ? new Date(payload.cadastro) : undefined,
          precoML: financials.precoML,
          valorFrete: financials.valorFrete,
          valorTaxas: financials.valorTaxas,
          valorLiq: financials.valorLiq,
          disponivel: false,
          emPrejuizo: true,
          dataVenda: null,
          blingPedidoId: null,
          blingPedidoNum: null,
        },
      });

      const prejuizo = await tx.prejuizo.create({
        data: {
          data: new Date(),
          detalhe,
          motivo,
          observacao: payload.observacao ? String(payload.observacao).trim() : null,
          pecaId: peca.id,
          valor: financials.precoML,
          frete: financials.valorFrete,
        },
      });

      return prejuizo;
    });

    res.json(result);
  } catch (e) { next(e); }
});

// GET /pecas/:id
pecasRouter.get('/:id', async (req, res, next) => {
  try {
    const peca = await prisma.peca.findUnique({
      where: { id: Number(req.params.id) },
      include: { moto: true, prejuizo: true },
    });
    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });
    res.json(peca);
  } catch (e) { next(e); }
});

pecasRouter.post('/bulk-delete', async (req, res, next) => {
  try {
    if (!isBrunoAuthUser(req)) {
      return res.status(403).json({ error: 'Apenas o usuario Bruno pode deletar pecas em massa.' });
    }

    const parsed = bulkDeletePecasSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Informe ao menos uma peca valida para exclusao em massa.' });
    }

    const result = await prisma.peca.deleteMany({
      where: {
        id: { in: parsed.data.ids },
      },
    });

    res.json({ ok: true, deletedCount: result.count });
  } catch (e) { next(e); }
});

// DELETE /pecas/:id
pecasRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.peca.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /pecas/bulk-detran-cartela
// Atualiza detranEtiqueta + detranStatus de um lote de peças (cartela Detran)
// Body: { itens: [{idPeca, detranEtiqueta, detranStatus}] }
pecasRouter.post('/bulk-detran-cartela', async (req, res, next) => {
  try {
    const { itens } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) {
      return res.status(400).json({ error: 'itens obrigatorio' });
    }

    const resultados: any[] = [];
    for (const item of itens) {
      const { idPeca, detranEtiqueta, detranStatus } = item;
      if (!idPeca) continue;
      try {
        const peca = await prisma.peca.findUnique({ where: { idPeca: String(idPeca).toUpperCase() } });
        if (!peca) { resultados.push({ idPeca, ok: false, error: 'Nao encontrada' }); continue; }
        await prisma.peca.update({
          where: { id: peca.id },
          data: {
            detranEtiqueta: detranEtiqueta || null,
            detranStatus: detranStatus || null,
          },
        });
        resultados.push({ idPeca, ok: true });
      } catch (e: any) {
        resultados.push({ idPeca, ok: false, error: e.message });
      }
    }

    res.json({ ok: true, resultados, total: resultados.length, erros: resultados.filter(r => !r.ok).length });
  } catch (e) { next(e); }
});

// POST /pecas/recomprimir-fotos-capa
// Recomprime todas as fotoCapaArquivo existentes no banco com as novas configurações
// Só processa as acima de 150KB (meta atual)
pecasRouter.post('/recomprimir-fotos-capa', async (req, res, next) => {
  try {
    const ALVO_BYTES = 150 * 1024;

    // Busca todas as peças com foto capa
    const pecas = await prisma.peca.findMany({
      where: {
        fotoCapaArquivo: { not: null },
        NOT: { fotoCapaArquivo: '' },
      },
      select: { id: true, fotoCapaNome: true, fotoCapaArquivo: true },
    });

    // Filtra apenas as que estão acima do alvo
    const candidatas = pecas.filter(p => {
      const base64 = String(p.fotoCapaArquivo || '').split(',')[1] || '';
      const bytes = Math.round(base64.length * 0.75);
      return bytes > ALVO_BYTES;
    });

    let atualizadas = 0;
    let erros = 0;
    let ignoradas = 0;

    for (const peca of candidatas) {
      try {
        const prepared = await compressDataUrlImage(String(peca.fotoCapaArquivo));
        const base64After = prepared.dataUrl.split(',')[1] || '';
        const bytesAfter = Math.round(base64After.length * 0.75);

        // Só salva se houve redução
        if (bytesAfter < Math.round((String(peca.fotoCapaArquivo || '').split(',')[1] || '').length * 0.75)) {
          await prisma.peca.update({
            where: { id: peca.id },
            data: {
              fotoCapaArquivo: prepared.dataUrl,
              fotoCapaNome: normalizeImageFileName(peca.fotoCapaNome, prepared.extension),
            },
          });
          atualizadas++;
        } else {
          ignoradas++;
        }
      } catch {
        erros++;
      }
    }

    res.json({
      ok: true,
      total: candidatas.length,
      atualizadas,
      ignoradas,
      erros,
      mensagem: `${atualizadas} foto(s) recomprimida(s) de ${candidatas.length} candidatas`,
    });
  } catch (e) { next(e); }
});

// GET /pecas/:id/foto-capa — retorna apenas a foto capa de uma peça
pecasRouter.get('/:id/foto-capa', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
    const peca = await prisma.peca.findUnique({
      where: { id },
      select: { id: true, idPeca: true, fotoCapaArquivo: true, fotoCapaNome: true },
    });
    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });
    res.json({ id: peca.id, idPeca: peca.idPeca, fotoCapaArquivo: peca.fotoCapaArquivo || null, fotoCapaNome: peca.fotoCapaNome || null });
  } catch (e) { next(e); }
});
