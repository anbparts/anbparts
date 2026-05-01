import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { syncDetranEtiquetaBling } from '../lib/sync-bling-detran';
import PDFDocument from 'pdfkit';
import { getConfiguracaoGeral } from '../lib/configuracoes-gerais';

export const motosRouter = Router();

const motoSchema = z.object({
  marca:             z.string().min(1),
  modelo:            z.string().min(1),
  ano:               z.number().int().optional().nullable(),
  cor:               z.string().optional().nullable(),
  placa:             z.string().optional().nullable(),
  chassi:            z.string().optional().nullable(),
  renavam:           z.string().optional().nullable(),
  dataCompra:        z.string().optional().nullable(),
  precoCompra:       z.number().default(0),
  origemCompra:      z.string().optional().nullable(),
  observacoes:       z.string().optional().nullable(),
  etiquetaSkuLabel:  z.string().optional().nullable(),
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
  'registroDetran',
  'laudoTecnicoEtiquetas',
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

const CONTRATO_DETALHES_MOTO_CATEGORIAS = [
  { categoria: 'Roda', itens: [
    { key: 'rodaDianteira', label: 'Roda Dianteira' },
    { key: 'rodaTraseira', label: 'Roda Traseira' },
    { key: 'pneuDianteiro', label: 'Pneu Dianteiro' },
    { key: 'pneuTraseiro', label: 'Pneu Traseiro' },
    { key: 'discoFreioDianteiro', label: 'Disco de Freio Dianteiro' },
    { key: 'discoFreioTraseiro', label: 'Disco de Freio Traseiro' },
  ] },
  { categoria: 'Suspensão', itens: [
    { key: 'suspensaoDianteira', label: 'Suspensão Dianteira' },
    { key: 'amortecedorTraseiro', label: 'Amortecedor Traseiro' },
  ] },
  { categoria: 'Dianteira', itens: [
    { key: 'farolDianteiro', label: 'Farol Dianteiro' },
    { key: 'carenagensFrontal', label: 'Carenagens Frontal' },
    { key: 'bolhaDianteira', label: 'Bolha Dianteira' },
  ] },
  { categoria: 'Lado Direito', itens: [
    { key: 'manoplaDireita', label: 'Manopla Direita' },
    { key: 'maneteFreioDianteiro', label: 'Manete de Freio Dianteiro' },
    { key: 'carenagensLadoDireito', label: 'Carenagens Lado Direito' },
    { key: 'pedaleiraDianteiraDireita', label: 'Pedaleira Dianteira Lado Direito' },
    { key: 'pedaleiraTraseiraDireita', label: 'Pedaleira Traseira Lado Direito' },
    { key: 'setaDianteiraDireita', label: 'Seta Dianteira Lado Direito' },
    { key: 'setaTraseiraDireita', label: 'Seta Traseira Lado Direito' },
    { key: 'punhoIgnicao', label: 'Punho de Ignição' },
    { key: 'retrovisorDireito', label: 'Retrovisor Lado Direito' },
  ] },
  { categoria: 'Lado Esquerdo', itens: [
    { key: 'manoplaEsquerda', label: 'Manopla Esquerda' },
    { key: 'maneteEmbreagemFreioTraseiro', label: 'Manete de Embreagem (ou Freio traseiro)' },
    { key: 'carenagensLadoEsquerdo', label: 'Carenagens Lado Esquerdo' },
    { key: 'pedaleiraDianteiraEsquerda', label: 'Pedaleira Dianteira Lado Esquerdo' },
    { key: 'pedaleiraTraseiraEsquerda', label: 'Pedaleira Traseira Lado Esquerdo' },
    { key: 'setaDianteiraEsquerda', label: 'Seta Dianteira Esquerda' },
    { key: 'setaTraseiraEsquerda', label: 'Seta Traseira Esquerda' },
    { key: 'punhoLuz', label: 'Punho de Luz' },
    { key: 'retrovisorEsquerdo', label: 'Retrovisor Lado Esquerdo' },
  ] },
  { categoria: 'Traseira', itens: [
    { key: 'carenagensRabeta', label: 'Carenagens Rabeta' },
    { key: 'lanternaTraseira', label: 'Lanterna Traseira' },
    { key: 'eixoCarda', label: 'Eixo Carda' },
  ] },
  { categoria: 'Geral', itens: [
    { key: 'pintura', label: 'Pintura' },
    { key: 'bancoMotorista', label: 'Banco do Motorista' },
    { key: 'bancoPassageiro', label: 'Banco do Passageiro' },
    { key: 'painel', label: 'Painel' },
    { key: 'tanque', label: 'Tanque' },
    { key: 'escapamento', label: 'Escapamento' },
    { key: 'buzina', label: 'Buzina' },
    { key: 'chaveIgnicao', label: 'Chave (ignição)' },
    { key: 'chassis', label: 'Chassis' },
    { key: 'motorFuncionando', label: 'Motor Funcionando' },
    { key: 'avariasBarulhos', label: 'Avarias ou barulhos' },
    { key: 'chaveReserva', label: 'Moto Possui Chave Reserva' },
    { key: 'manual', label: 'Moto Possui Manual' },
    { key: 'numeroChassisVisivel', label: 'Número do chassis visível' },
    { key: 'numeroMotorVisivel', label: 'Número do motor visível' },
  ] },
];

// GET /motos
motosRouter.get('/', async (req, res, next) => {
  try {
    const [motos, totalRelacionadasRows, disponiveisRows, vendidasRows, detranRows] = await Promise.all([
      prisma.moto.findMany({
        select: {
          id: true,
          marca: true,
          modelo: true,
          ano: true,
          cor: true,
          placa: true,
          chassi: true,
          renavam: true,
          dataCompra: true,
          precoCompra: true,
          origemCompra: true,
          observacoes: true,
          descricaoModelo: true,
          etiquetaSkuLabel: true,
          anexos: true,
        },
        orderBy: { id: 'asc' }
      }),
      prisma.peca.groupBy({
        by: ['motoId'],
        _count: { _all: true },
      }),
      prisma.peca.groupBy({
        by: ['motoId'],
        where: {
          disponivel: true,
          emPrejuizo: false,
        },
        _count: { _all: true },
        _sum: {
          precoML: true,
          valorLiq: true,
        },
      }),
      prisma.peca.groupBy({
        by: ['motoId'],
        where: {
          disponivel: false,
          emPrejuizo: false,
        },
        _count: { _all: true },
        _sum: {
          precoML: true,
          valorLiq: true,
        },
      }),
      prisma.peca.findMany({
        where: {
          detranEtiqueta: { not: null },
        },
        select: {
          motoId: true,
          detranEtiqueta: true,
          detranBaixada: true,
        },
      }),
    ]);

    const totalRelacionadasByMoto = new Map<number, number>();
    for (const row of totalRelacionadasRows) {
      totalRelacionadasByMoto.set(row.motoId, row._count._all);
    }

    const disponiveisByMoto = new Map<number, { qtd: number; precoML: number; valorLiq: number }>();
    for (const row of disponiveisRows) {
      disponiveisByMoto.set(row.motoId, {
        qtd: row._count._all,
        precoML: Number(row._sum.precoML || 0),
        valorLiq: Number(row._sum.valorLiq || 0),
      });
    }

    const vendidasByMoto = new Map<number, { qtd: number; precoML: number; valorLiq: number }>();
    for (const row of vendidasRows) {
      vendidasByMoto.set(row.motoId, {
        qtd: row._count._all,
        precoML: Number(row._sum.precoML || 0),
        valorLiq: Number(row._sum.valorLiq || 0),
      });
    }

    const detranByMoto = new Map<number, { total: number; ativas: number; baixadas: number }>();
    for (const row of detranRows) {
      const etiquetas = String(row.detranEtiqueta || '').trim();
      if (!normalizeDetranEtiqueta(etiquetas)) continue;

      const qtdEtiquetas = etiquetas.split('/').map((item) => item.trim()).filter(Boolean).length || 1;
      const current = detranByMoto.get(row.motoId) || { total: 0, ativas: 0, baixadas: 0 };

      current.total += qtdEtiquetas;
      if (row.detranBaixada) current.baixadas += qtdEtiquetas;
      else current.ativas += qtdEtiquetas;

      detranByMoto.set(row.motoId, current);
    }

    const result = motos.map(m => {
      const disponiveis = disponiveisByMoto.get(m.id) || { qtd: 0, precoML: 0, valorLiq: 0 };
      const vendidas = vendidasByMoto.get(m.id) || { qtd: 0, precoML: 0, valorLiq: 0 };
      const detran = detranByMoto.get(m.id) || { total: 0, ativas: 0, baixadas: 0 };
      const anexosCount = countMotoAnexos((m as any).anexos);

      // Receita = Preço ML das vendidas (valor bruto)
      const receita = vendidas.precoML;

      // Valor estoque = Preço ML das disponíveis
      const valorEst = disponiveis.precoML;

      // Lucro previsto = igual ao Excel:
      // (Valor Líq. vendidas + Valor Líq. em estoque) - Preço Compra
      // Valor Líquido = já descontado taxa ML + frete
      const vlVendidas  = vendidas.valorLiq;
      const vlEstoque   = disponiveis.valorLiq;
      const lucro       = (vlVendidas + vlEstoque) - Number(m.precoCompra);
      // Detran: conta etiquetas reais (split por '/') e inclui peças em prejuízo
      const detranCount = detran.total;
      const detranAtivas = detran.ativas;
      const detranBaixadas = detran.baixadas;

      // % recuperada = quanto do investimento já voltou (valor líq. vendidas / preço compra)
      const pctRecuperada = Number(m.precoCompra) > 0
        ? Math.round(vlVendidas / Number(m.precoCompra) * 100)
        : 0;

      return {
        id:             m.id,
        marca:          m.marca,
        modelo:         m.modelo,
        ano:            m.ano,
        cor:            m.cor,
        placa:          m.placa,
        chassi:         m.chassi,
        renavam:        m.renavam,
        dataCompra:     m.dataCompra,
        precoCompra:    Number(m.precoCompra),
        origemCompra:   m.origemCompra,
        observacoes:    m.observacoes,
        descricaoModelo: m.descricaoModelo,
        etiquetaSkuLabel: m.etiquetaSkuLabel,
        qtdDisp:        disponiveis.qtd,
        qtdVendidas:    vendidas.qtd,
        receitaTotal:   receita,
        valorEstoque:   valorEst,
        vlVendidas,
        vlEstoque,
        lucro,
        pctRecuperada,
        qtdRelacionadas: totalRelacionadasByMoto.get(m.id) || 0,
        detranCount,
        detranAtivas,
        detranBaixadas,
        temDetran: detranCount > 0,
        anexosCount,
        temAnexos: anexosCount > 0,
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next();

    const moto = await prisma.moto.findUniqueOrThrow({
      where: { id },
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

// GET /motos/:id/detran-cartela — carrega posições salvas
motosRouter.get('/:id/detran-cartela', async (req, res, next) => {
  try {
    const posicoes = await prisma.motoDetranPosicao.findMany({
      where: { motoId: Number(req.params.id) },
      orderBy: { posicao: 'asc' },
    });
    res.json({ ok: true, posicoes });
  } catch (e) { next(e); }
});

// POST /motos/:id/detran-cartela — salva todas as posições (upsert) + sync Bling
// Body: { posicoes: [{posicao, tipo, status, idPeca?, etiqueta?}] }
motosRouter.post('/:id/detran-cartela', async (req, res, next) => {
  try {
    const motoId = Number(req.params.id);
    const { posicoes } = req.body || {};
    if (!Array.isArray(posicoes)) return res.status(400).json({ error: 'posicoes obrigatorio' });

    const resultados: any[] = [];

    // 1. Agrupa etiquetas por SKU — mesmo SKU pode aparecer em múltiplas posições
    const etiquetasPorSku: Record<string, string[]> = {};
    for (const pos of posicoes) {
      const { idPeca, etiqueta } = pos;
      if (!idPeca) continue;
      const sku = String(idPeca).toUpperCase();
      if (!etiquetasPorSku[sku]) etiquetasPorSku[sku] = [];
      if (etiqueta) etiquetasPorSku[sku].push(etiqueta);
    }

    // 2. Salva cada posição no histórico MotoDetranPosicao
    for (const pos of posicoes) {
      const { posicao, tipo, status, idPeca, etiqueta } = pos;
      if (!posicao || !tipo) continue;

      const ehRemocao = idPeca && !etiqueta;
      await prisma.motoDetranPosicao.upsert({
        where: { motoId_posicao: { motoId, posicao: Number(posicao) } },
        create: {
          motoId, posicao: Number(posicao), tipo,
          status: status || null,
          idPeca: ehRemocao ? null : (idPeca || null),
          etiqueta: etiqueta || null,
        },
        update: {
          tipo, status: status || null,
          idPeca: ehRemocao ? null : (idPeca || null),
          etiqueta: etiqueta || null,
        },
      });
    }

    // 3. Atualiza Peca e Bling agrupando etiquetas por SKU
    const skusSyncados = new Set<string>();

    for (const pos of posicoes) {
      const { posicao, status, idPeca, etiqueta } = pos;
      if (!idPeca) continue;

      const sku = String(idPeca).toUpperCase();
      const baseSku = sku.replace(/-\d+$/, '');

      // Só processa uma vez por SKU
      if (skusSyncados.has(sku)) continue;
      skusSyncados.add(sku);

      const ehRemocao = !etiqueta;
      // Concatena todas as etiquetas desse SKU nesta cartela
      const etiquetasConcat = etiquetasPorSku[sku]?.join(' / ') || null;

      // Atualiza tabela Peca com as etiquetas concatenadas
      await prisma.peca.updateMany({
        where: { idPeca: sku },
        data: {
          detranEtiqueta: ehRemocao ? null : etiquetasConcat,
          detranStatus: ehRemocao ? null : (status || null),
        },
      });

      // Sync Bling (uma vez por SKU base)
      if (!skusSyncados.has(baseSku + '_bling')) {
        skusSyncados.add(baseSku + '_bling');
        const blingResult = await syncDetranEtiquetaBling(idPeca);
        resultados.push({ posicao, idPeca, ok: true, blingSync: blingResult.ok, blingError: blingResult.error });
      }
    }

    // Posições sem SKU (Inexistente)
    for (const pos of posicoes) {
      if (!pos.idPeca) {
        resultados.push({ posicao: pos.posicao, ok: true, semSku: true });
      }
    }

    res.json({ ok: true, resultados, total: posicoes.length });
  } catch (e) { next(e); }
});


// ── Helper: gera buffer PDF do contrato ───────────────────────────────────────
async function gerarPdfContrato(dados: Record<string, any>): Promise<Buffer> {
  const valorExtensoNormalizado = String(dados.valorExtenso || '').trim().replace(/\s+reais$/i, '');
  dados = { ...dados, valorExtenso: valorExtensoNormalizado };

  // Busca dados da empresa automaticamente
  const config = await getConfiguracaoGeral().catch(() => null);
  const empresaRazaoSocial = String(config?.empresaRazaoSocial || dados.razaoSocialComprador || 'ANBParts Comércio de Peças Usadas').trim();
  const empresaCnpj        = String(config?.empresaCnpj        || dados.cnpjComprador        || '').trim();
  const empresaEndereco    = String(config?.empresaEnderecoCompleto || dados.enderecoComprador || '').trim();
  const empresaTelefone    = String(config?.empresaTelefoneWhats || '').trim();
  const detalhesMoto = dados.detalhesMoto && typeof dados.detalhesMoto === 'object' && !Array.isArray(dados.detalhesMoto)
    ? dados.detalhesMoto as Record<string, unknown>
    : {};
  const temDetalhesMoto = Object.values(detalhesMoto).some((value) => String(value ?? '').trim());

  function formatDateBR(value: unknown) {
    const text = String(value || '').trim();
    if (!text) return '';

    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
  }

  function responsavelContrato(value: unknown) {
    const text = String(value || '').toLowerCase();
    if (text === 'comprador') return 'COMPRADOR';
    return 'VENDEDOR';
  }

  function parseCurrencyCents(value: unknown) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const normalized = text.replace(/\s/g, '').replace(/[^\d,.-]/g, '');

    if (normalized.includes(',')) {
      const digits = normalized.replace(/\D/g, '');
      return digits ? Number(digits) : 0;
    }

    if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
      return Number(normalized.replace(/\./g, '')) * 100;
    }

    if (/^\d+\.\d{1,2}$/.test(normalized)) {
      return Math.round(Number(normalized) * 100);
    }

    if (/^\d+$/.test(normalized)) {
      return Number(normalized) * 100;
    }

    const digits = text.replace(/\D/g, '');
    if (!digits) return 0;
    return Number(digits);
  }

  function formatCurrencyCents(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }

  function numeroPorExtenso(value: number): string {
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    if (value === 0) return 'zero';
    if (value < 10) return unidades[value];
    if (value < 20) return especiais[value - 10];
    if (value < 100) {
      const dezena = Math.floor(value / 10);
      const unidade = value % 10;
      return unidade ? `${dezenas[dezena]} e ${unidades[unidade]}` : dezenas[dezena];
    }
    if (value === 100) return 'cem';
    if (value < 1000) {
      const centena = Math.floor(value / 100);
      const resto = value % 100;
      return resto ? `${centenas[centena]} e ${numeroPorExtenso(resto)}` : centenas[centena];
    }

    const escalas = [
      { valor: 1000000000, singular: 'bilhão', plural: 'bilhões' },
      { valor: 1000000, singular: 'milhão', plural: 'milhões' },
      { valor: 1000, singular: 'mil', plural: 'mil' },
    ];

    for (const escala of escalas) {
      if (value >= escala.valor) {
        const maior = Math.floor(value / escala.valor);
        const resto = value % escala.valor;
        const maiorTexto = escala.valor === 1000 && maior === 1
          ? escala.singular
          : `${numeroPorExtenso(maior)} ${maior === 1 ? escala.singular : escala.plural}`;
        if (!resto) return maiorTexto;
        return `${maiorTexto} e ${numeroPorExtenso(resto)}`;
      }
    }

    return String(value);
  }

  function valorMoedaPorExtenso(cents: number) {
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    const partes: string[] = [];

    if (reais > 0) partes.push(`${numeroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
    if (centavos > 0) partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);

    return partes.length ? partes.join(' e ') : 'zero reais';
  }

  function joinListaContrato(items: string[]) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return `${items[0]} e ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  }

  function debitoContrato(label: string, valorKey: string, responsavelKey: string) {
    const valorCents = parseCurrencyCents(dados[valorKey]);
    if (valorCents <= 0) return null;
    const valorFormatado = formatCurrencyCents(valorCents);
    const valorExtenso = valorMoedaPorExtenso(valorCents);
    return {
      label,
      responsavel: responsavelContrato(dados[responsavelKey]),
      valorCents,
      textoItem: `${label} no valor de ${valorFormatado} (${valorExtenso})`,
    };
  }

  function detalheMotoValor(key: string) {
    return String(detalhesMoto[key] ?? '').trim() || '—';
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 65, right: 65 },
      info: { Title: 'Contrato de Compra e Venda de Motocicleta', Author: empresaRazaoSocial },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W    = 595.28 - 130;
    const GRAY = '#555555';
    const LIGHT = '#888888';
    const BLACK = '#111111';
    const BLUE  = '#1a3a6b';
    const LIGHT_HEADER_BG = '#e5e7eb';
    const LIGHT_HEADER_TEXT = '#334155';

    function sectionHeader(text: string) {
      doc.moveDown(0.6);
      doc.rect(65, doc.y, W, 1).fill('#333333');
      doc.moveDown(0.3);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(BLACK).text(text.toUpperCase(), { characterSpacing: 0.8 });
      doc.moveDown(0.4);
      doc.font('Helvetica').fillColor(GRAY).fontSize(10);
    }

    function field(label: string, value: string) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text(`${label}: `, { continued: true });
      doc.fontSize(9).font('Helvetica').fillColor(BLACK).text(value || '—');
    }

    function clauseTitle(num: string, title: string) {
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(BLACK).text(`CLÁUSULA ${num}ª — ${title}`);
      doc.moveDown(0.2);
      doc.font('Helvetica').fillColor(GRAY).fontSize(9);
    }

    function paragraph(text: string) {
      doc.fontSize(9).font('Helvetica').fillColor(GRAY).text(text, { align: 'justify', lineGap: 2 });
      doc.moveDown(0.3);
    }

    function ensureSpace(height = 24) {
      if (doc.y + height > 760) {
        doc.addPage();
        doc.x = 65;
        doc.y = 60;
      }
    }

    function renderAnexoDetalhesMoto() {
      if (!temDetalhesMoto) return;

      const grupoPorNome = (nome: string) => CONTRATO_DETALHES_MOTO_CATEGORIAS.find((grupo) => grupo.categoria === nome);
      const cardGap = 12;
      const cardW = (W - cardGap) / 2;
      const headerH = 15;
      const rowH = 13;
      const pad = 6;

      function truncateText(value: string, max: number) {
        const text = String(value || '');
        return text.length > max ? `${text.slice(0, max - 1)}...` : text;
      }

      function cardHeight(grupo: any, columns = 1) {
        const rows = Math.ceil((grupo?.itens?.length || 0) / columns);
        return headerH + (pad * 2) + (rows * rowH);
      }

      function renderDetalhesCard(grupo: any, x: number, y: number, width: number, columns = 1, targetHeight?: number) {
        if (!grupo) return 0;

        const height = targetHeight || cardHeight(grupo, columns);
        const innerW = width - (pad * 2);
        const colGap = columns > 1 ? 10 : 0;
        const colW = (innerW - (colGap * (columns - 1))) / columns;
        const rows = Math.ceil(grupo.itens.length / columns);

        doc.rect(x, y, width, height).fill('#ffffff').stroke('#cbd5e1');
        doc.rect(x, y, width, headerH).fill(LIGHT_HEADER_BG);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(LIGHT_HEADER_TEXT).text(grupo.categoria.toUpperCase(), x + 6, y + 4, { width: width - 12, lineBreak: false });

        grupo.itens.forEach((item: any, index: number) => {
          const col = Math.floor(index / rows);
          const row = index % rows;
          const rowX = x + pad + (col * (colW + colGap));
          const rowY = y + headerH + pad + (row * rowH);
          const labelW = columns > 1 ? colW * 0.62 : colW * 0.64;
          const valueW = colW - labelW - 4;
          const labelMax = columns > 1 ? 24 : 32;

          doc.rect(rowX, rowY - 1, colW, rowH).fill(row % 2 === 0 ? '#f8fafc' : '#ffffff');
          doc.fontSize(7.2).font('Helvetica-Bold').fillColor(GRAY).text(truncateText(item.label, labelMax), rowX + 3, rowY + 2, { width: labelW, lineBreak: false });
          doc.fontSize(7.2).font('Helvetica').fillColor(BLACK).text(truncateText(detalheMotoValor(item.key), columns > 1 ? 18 : 20), rowX + labelW + 4, rowY + 2, { width: valueW, lineBreak: false });
        });

        return height;
      }

      function renderParDetalhes(esquerda: string, direita: string) {
        const left = grupoPorNome(esquerda);
        const right = grupoPorNome(direita);
        if (!left || !right) return;
        const height = Math.max(cardHeight(left), cardHeight(right));
        ensureSpace(height + 10);
        const y = doc.y;
        renderDetalhesCard(left, 65, y, cardW, 1, height);
        renderDetalhesCard(right, 65 + cardW + cardGap, y, cardW, 1, height);
        doc.y = y + height + 10;
        doc.x = 65;
      }

      doc.addPage();
      doc.x = 65;
      doc.y = 60;
      doc.fontSize(13).font('Helvetica-Bold').fillColor(BLUE).text('ANEXO I — DETALHES DA MOTO', { align: 'center' });
      doc.moveDown(0.5);
      paragraph('Este anexo integra o presente contrato e registra a vistoria realizada pelas partes sobre os principais componentes da motocicleta, conforme informações preenchidas no ato da contratação.');

      renderParDetalhes('Roda', 'Suspensão');
      renderParDetalhes('Dianteira', 'Traseira');
      renderParDetalhes('Lado Direito', 'Lado Esquerdo');

      const geral = grupoPorNome('Geral');
      if (geral) {
        const height = cardHeight(geral, 2);
        ensureSpace(height + 10);
        renderDetalhesCard(geral, 65, doc.y, W, 2, height);
        doc.y += height + 10;
        doc.x = 65;
      }
    }

    // ── Cabeçalho ──────────────────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor(BLUE)
      .text('CONTRATO PARTICULAR DE COMPRA E VENDA DE MOTOCICLETA', { align: 'center' });
    doc.moveDown(0.4);
    doc.rect(65, doc.y, W, 1.5).fill(BLUE);
    doc.moveDown(0.6);

    doc.fontSize(9).font('Helvetica').fillColor(GRAY)
      .text(
        'Pelo presente instrumento particular, celebrado nos termos do Código Civil Brasileiro (Lei nº 10.406/2002), ' +
        'as partes abaixo qualificadas, reconhecendo-se mutuamente capazes e livres para contratar, ajustam a ' +
        'compra e venda da motocicleta descrita neste instrumento, nas condições a seguir estipuladas.',
        { align: 'justify', lineGap: 2 }
      );
    doc.moveDown(0.5);

    // ── Parte I: Vendedor ──────────────────────────────────────────────────────
    sectionHeader('PARTE I — IDENTIFICAÇÃO DO VENDEDOR');
    const colW = W / 2 - 10;
    const col2x = 65 + W / 2 + 10;
    let startY = doc.y;

    doc.x = 65; doc.y = startY;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text('Nome completo: ', { continued: true }).font('Helvetica').fillColor(BLACK).text(dados.nomeVendedor || '—', { width: colW });
    doc.x = 65;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text('CPF: ', { continued: true }).font('Helvetica').fillColor(BLACK).text(dados.cpfVendedor || '—', { width: colW });
    doc.x = 65;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text('RG / Órgão emissor: ', { continued: true }).font('Helvetica').fillColor(BLACK).text(`${dados.rgVendedor || '—'} / ${dados.orgaoEmissor || '—'}`, { width: colW });
    doc.x = 65;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text('Data de nascimento: ', { continued: true }).font('Helvetica').fillColor(BLACK).text(formatDateBR(dados.nascimentoVendedor) || '—', { width: colW });
    doc.x = 65;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY).text('Estado civil: ', { continued: true }).font('Helvetica').fillColor(BLACK).text(dados.estadoCivil || '—', { width: colW });
    const col1EndY = doc.y;

    doc.x = col2x; doc.y = startY;

    doc.x = 65;
    doc.y = Math.max(col1EndY, doc.y) + 4;
    field('Endereço', dados.enderecoVendedor || '—');
    field('Bairro', dados.bairroVendedor || '—');
    field('CEP', dados.cepVendedor || '—');
    field('Cidade / UF', dados.cidadeUfVendedor || '—');
    field('Profissão', dados.profissao || '—');
    field('Telefone', dados.telefone || '—');
    field('E-mail', dados.email || '—');

    // ── Parte II: Comprador (dados da empresa) ─────────────────────────────────
    sectionHeader('PARTE II — IDENTIFICAÇÃO DO COMPRADOR');
    field('Razão Social', empresaRazaoSocial);
    field('CNPJ', empresaCnpj || '—');
    field('Endereço', empresaEndereco || '—');
    if (empresaTelefone) field('Telefone / WhatsApp', empresaTelefone);
    field('Representado por', dados.nomeRepresentante || '—');
    if (dados.cpfRepresentante) field('CPF do representante', dados.cpfRepresentante);

    // ── Parte III: Veículo ─────────────────────────────────────────────────────
    sectionHeader('PARTE III — IDENTIFICAÇÃO DO VEÍCULO');
    const tHeaders = ['Campo', 'Informação', 'Campo', 'Informação'];
    const tRows = [
      ['Marca / Modelo', dados.marcaModelo || '—', 'Ano fab. / modelo', `${dados.anoFabricacao || '—'} / ${dados.anoModelo || '—'}`],
      ['Cor', dados.cor || '—', 'Categoria', dados.categoria || '—'],
      ['Placa', dados.placa || '—', 'Combustível', dados.combustivel || '—'],
      ['Chassi (VIN)', dados.chassi || '—', 'Número do Motor', dados.motor || '—'],
      ['RENAVAM', dados.renavam || '—', 'Estado geral', dados.estadoGeral || '—'],
    ];
    const tColW = [80, W / 2 - 80, 80, W / 2 - 80];
    let tY = doc.y;
    doc.rect(65, tY, W, 16).fill(LIGHT_HEADER_BG);
    let cx = 65;
    tHeaders.forEach((h, i) => {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(LIGHT_HEADER_TEXT).text(h.toUpperCase(), cx + 4, tY + 4, { width: tColW[i], lineBreak: false });
      cx += tColW[i];
    });
    tY += 16;
    tRows.forEach((row, ri) => {
      const rowH = 14;
      doc.rect(65, tY, W, rowH).fill(ri % 2 === 0 ? '#f7f7f7' : '#ffffff');
      cx = 65;
      row.forEach((cell, ci) => {
        doc.fontSize(8).font(ci % 2 === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(ci % 2 === 0 ? GRAY : BLACK).text(cell, cx + 4, tY + 3, { width: tColW[ci] - 6, lineBreak: false });
        cx += tColW[ci];
      });
      tY += rowH;
    });
    doc.y = tY + 6; doc.x = 65;

    if (temDetalhesMoto) {
      doc.fontSize(8.5).font('Helvetica').fillColor(GRAY).text('O Anexo I — Detalhes da Moto deste instrumento foi preenchido em conjunto pelo VENDEDOR e pelo COMPRADOR. Ambas as partes declaram estar plenamente de acordo com o detalhamento registrado, reconhecendo-o como fiel representação do estado real do bem.', { align: 'justify', lineGap: 2 });
    }

    // ── Parte IV: Cláusulas ────────────────────────────────────────────────────
    sectionHeader('PARTE IV — CLÁUSULAS E CONDIÇÕES');

    clauseTitle('1', 'DO OBJETO E FINALIDADE DA AQUISIÇÃO');
    paragraph('O presente contrato tem por objeto a compra e venda da motocicleta descrita na Parte III, que o VENDEDOR declara ser de sua legítima propriedade. O VENDEDOR tem plena ciência de que a motocicleta ora alienada destina-se ao desmonte e comercialização de suas peças e componentes pelo COMPRADOR, concordando expressamente com tal finalidade.');

    clauseTitle('2', 'DO PREÇO, NEGOCIAÇÃO E FORMA DE PAGAMENTO');
    paragraph('O preço da motocicleta foi livremente negociado entre as partes, com pleno conhecimento e concordância do VENDEDOR, sem qualquer pressão, coação ou estado de necessidade que o obrigasse a aceitar condições desfavoráveis.');
    const valorTexto = dados.valorReais
      ? `O VENDEDOR vende a motocicleta pelo valor de R$ ${dados.valorReais}${dados.valorExtenso ? ` (${dados.valorExtenso} reais)` : ''}, pago pelo COMPRADOR na seguinte forma: ${dados.formaPagamento || '—'}${dados.dadosPagamento ? ` — ${dados.dadosPagamento}` : ''}.`
      : 'O VENDEDOR vende a motocicleta pelo valor acordado entre as partes, pago conforme forma de pagamento combinada.';
    paragraph(valorTexto);
    paragraph('O VENDEDOR declara que o valor acima é justo e condizente com o estado e condições do veículo, dando ao COMPRADOR plena e irrevogável quitação após o recebimento, nada mais tendo a reclamar a qualquer título sobre este negócio.');

    clauseTitle('3', 'DA LEGITIMIDADE, TITULARIDADE E BOA-FÉ');
    paragraph('Nos termos do Código Civil Brasileiro, as partes obrigam-se a agir com boa-fé, lealdade e transparência. Em cumprimento a este princípio, o VENDEDOR declara expressamente:');
    ['a) Que é o legítimo proprietário e possuidor do veículo, com plenos poderes para aliená-lo, inexistindo qualquer impedimento legal, judicial ou contratual que impeça esta venda;',
     'b) Que o veículo não se encontra dado em garantia, penhorado, arrestado, sequestrado, gravado com alienação fiduciária, reserva de domínio, usufruto, ou qualquer outro ônus real ou pessoal;',
     'c) Que o veículo não é produto de crime, furto, roubo, receptação ou qualquer atividade ilícita, assumindo total e exclusiva responsabilidade penal e civil — incluindo perda do valor recebido e indenização por danos — caso tal situação se configure;',
     'd) Que não há ação judicial, inquérito policial ou procedimento administrativo em curso que recaia sobre o veículo e que possa prejudicar o COMPRADOR.'
    ].forEach((item) => { doc.fontSize(9).font('Helvetica').fillColor(GRAY).text(item, { align: 'justify', lineGap: 2, indent: 10 }); doc.moveDown(0.2); });
    doc.moveDown(0.2);

    clauseTitle('4', 'DO ESTADO DO VEÍCULO');
    paragraph('O COMPRADOR é empresa especializada em avaliação, aquisição e desmonte de motocicletas, tendo realizado vistoria técnica do veículo previamente à assinatura deste instrumento. A aquisição se dá no estado em que o veículo se encontra, conforme descrito na Parte III e confirmado pelo VENDEDOR. Não há garantia pós-venda sobre o estado geral do bem, dado que: (i) o preço foi negociado com pleno conhecimento das condições do veículo; e (ii) a destinação é o desmonte, e não a revenda do veículo inteiro. O VENDEDOR declara ter informado ao COMPRADOR, de boa-fé, todos os vícios, defeitos e limitações do veículo de que tinha conhecimento, não havendo omissão dolosa de sua parte.');

    clauseTitle('5', 'DOS DÉBITOS E ENCARGOS ANTERIORES');
    const debitosInformados = [
      debitoContrato('IPVA', 'debitoIpvaValor', 'debitoIpvaResponsavel'),
      debitoContrato('licenciamento', 'debitoLicenciamentoValor', 'debitoLicenciamentoResponsavel'),
      debitoContrato('multas de trânsito', 'debitoMultasValor', 'debitoMultasResponsavel'),
    ].filter(Boolean) as Array<NonNullable<ReturnType<typeof debitoContrato>>>;
    const vendedorDeclaraSemDebitos = dados.debitosDeclaracao === 'sem_debitos' || debitosInformados.length === 0;
    if (vendedorDeclaraSemDebitos) {
      paragraph('O VENDEDOR declara, sob sua responsabilidade civil e criminal, que até a data de assinatura deste contrato não existem débitos, encargos, restrições financeiras ou pendências incidentes sobre o veículo, incluindo, mas não se limitando a IPVA, licenciamento, multas de trânsito, taxas de DETRAN, gravames, alienação fiduciária, bloqueios administrativos ou judiciais e quaisquer cobranças de natureza anterior à presente venda.');
    } else {
      const debitosPorResponsavel = debitosInformados.reduce<Record<string, { labels: string[]; totalCents: number }>>((acc, debito) => {
        if (!acc[debito.responsavel]) acc[debito.responsavel] = { labels: [], totalCents: 0 };
        acc[debito.responsavel].labels.push(debito.label);
        acc[debito.responsavel].totalCents += debito.valorCents;
        return acc;
      }, {});

      const responsabilidades = Object.entries(debitosPorResponsavel).map(([responsavel, grupo]) => (
        `o pagamento referente a ${joinListaContrato(grupo.labels)} será de responsabilidade do ${responsavel}, totalizando ${formatCurrencyCents(grupo.totalCents)} (${valorMoedaPorExtenso(grupo.totalCents)})`
      ));

      paragraph(`As partes declaram ciência dos seguintes débitos e encargos identificados até a data de assinatura deste contrato: ${debitosInformados.map((debito) => debito.textoItem).join(', ')}.`);
      paragraph(`As partes acordam que ${joinListaContrato(responsabilidades)}.`);
    }
    paragraph('Todo e qualquer débito, encargo, multa, taxa, gravame, restrição, cobrança ou obrigação anterior à data deste contrato que não tenha sido descrito na cláusula acima permanecerá sob responsabilidade exclusiva do VENDEDOR.');
    paragraph('Caso qualquer débito anterior à data deste contrato venha a ser exigido do COMPRADOR, o VENDEDOR deverá ressarci-lo integralmente, inclusive quanto a principal, custas, despesas administrativas ou judiciais, acrescido de correção monetária pelo IPCA, juros de 1% ao mês e honorários advocatícios de 20%.');

    clauseTitle('6', 'DA GARANTIA CONTRA EVICÇÃO');
    paragraph('O VENDEDOR responde pela evicção do bem, nos termos do Código Civil Brasileiro, obrigando-se a indenizar o COMPRADOR de todas as perdas e danos — incluindo o valor pago, lucros cessantes, custas judiciais e honorários advocatícios — caso o veículo seja reivindicado por terceiros com fundamento em direito anterior à data deste contrato.');

    clauseTitle('7', 'DA AUSÊNCIA DE FRAUDE CONTRA CREDORES');
    paragraph('O VENDEDOR declara, nos termos do Código Civil Brasileiro, que esta alienação não constitui fraude contra credores nem fraude à execução, não se encontrando em estado de insolvência, e que após a venda remanescem bens suficientes para solver suas obrigações. Caso esta declaração se revele falsa, o VENDEDOR responderá por perdas e danos integrais perante o COMPRADOR.');

    clauseTitle('8', 'DA TRANSFERÊNCIA DE RESPONSABILIDADE');
    paragraph('A responsabilidade civil, administrativa e criminal sobre o veículo é transferida ao COMPRADOR a partir da data de assinatura deste instrumento. O VENDEDOR se compromete a comunicar a venda ao DETRAN no prazo legal de 30 (trinta) dias, isentando-se de responsabilidades por infrações cometidas após esta data. Em caso de descumprimento, o VENDEDOR ressarcirá o COMPRADOR de quaisquer débitos decorrentes de multas ou penalidades geradas no período.');

    const docsLabels: Record<string, string> = { crlv: 'CRLV', dut: 'CRV / DUT assinado', chave: 'Chave(s)', nf: 'NF de aquisição anterior', manual: 'Manual' };
    const docsEntregues: string[] = Array.isArray(dados.docsEntregues) ? dados.docsEntregues : [];
    const docsTexto = docsEntregues.length ? docsEntregues.map((d) => docsLabels[d] || d).join(', ') : '—';
    clauseTitle('9', 'DA DOCUMENTAÇÃO ENTREGUE');
    paragraph(`O VENDEDOR entrega ao COMPRADOR, neste ato, os seguintes documentos: ${docsTexto}. A entrega dos documentos é condição essencial para a eficácia deste contrato.`);

    clauseTitle('10', 'DA CAPACIDADE CIVIL E VALIDADE DO NEGÓCIO');
    paragraph('As partes declaram, nos termos do Código Civil Brasileiro, que este negócio jurídico atende a todos os requisitos de validade: (i) agentes capazes; (ii) objeto lícito, possível e determinado; (iii) forma não defesa em lei. O VENDEDOR declara ser maior de 18 anos, civilmente capaz, e que não age sob coação, dolo, erro ou estado de perigo que pudesse viciar sua manifestação de vontade.');

    clauseTitle('11', 'DA QUITAÇÃO');
    paragraph('Com o recebimento do valor descrito na Cláusula 2ª, o VENDEDOR dá ao COMPRADOR plena, geral e irrevogável quitação sobre o veículo ora transacionado, declarando nada mais ter a reclamar a qualquer título, seja judicial ou extrajudicialmente.');

    clauseTitle('12', 'DO FORO');
    paragraph('As partes elegem o foro da Comarca de Jundiaí / SP para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja, nos termos do Código de Processo Civil (Lei nº 13.105/2015).');

    renderAnexoDetalhesMoto();
    if (temDetalhesMoto) {
      doc.addPage();
      doc.x = 65;
      doc.y = 60;
    }

    // ── Parte V: Assinaturas ───────────────────────────────────────────────────
    sectionHeader('PARTE V — LOCAL, DATA E ASSINATURAS');
    doc.fontSize(9).font('Helvetica').fillColor(GRAY)
      .text('Por estarem assim justos e contratados, as partes assinam o presente instrumento em ', { continued: true })
      .font('Helvetica-Bold').fillColor(BLACK).text('2 (duas) vias de igual teor e forma', { continued: true })
      .font('Helvetica').fillColor(GRAY).text(', na presença das testemunhas abaixo.');
    doc.moveDown(0.4);

    doc.rect(65, doc.y, W, 36).fill('#fff8e1');
    const alertY = doc.y + 6;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#7a0000')
      .text('ATENÇÃO: O VENDEDOR declara que leu integralmente este contrato antes de assiná-lo, compreendeu seu conteúdo e teve plena oportunidade de esclarecer dúvidas, firmando-o de livre e espontânea vontade, sem qualquer coação ou pressão.',
        70, alertY, { width: W - 10, align: 'center' });
    doc.y = alertY + 34; doc.moveDown(0.5);

    field('Local e data', dados.localData || localDataContratoAtual());
    doc.moveDown(0.8);

    const sigY = doc.y;
    const halfW = W / 2 - 15;
    const compX = 65 + halfW + 30;

    doc.rect(65, sigY + 20, halfW, 0.7).fill('#333333');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK).text('VENDEDOR(A)', 65, sigY + 26, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(`Nome: ${dados.nomeVendedor || '________________________________'}`, 65, sigY + 38, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(`CPF: ${dados.cpfVendedor || '________________________'}`, 65, sigY + 50, { width: halfW, align: 'center' });

    doc.rect(compX, sigY + 20, halfW, 0.7).fill('#333333');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK).text(`COMPRADOR — ${empresaRazaoSocial}`, compX, sigY + 26, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(`Representante: ${dados.nomeRepresentante || '____________________'}`, compX, sigY + 38, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(`CPF: ${dados.cpfRepresentante || '________________________'}`, compX, sigY + 50, { width: halfW, align: 'center' });
    doc.y = sigY + 68; doc.moveDown(0.8);

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK).text('TESTEMUNHAS');
    doc.moveDown(0.3);
    const testY = doc.y;
    doc.rect(65, testY + 20, halfW, 0.7).fill('#aaaaaa');
    doc.fontSize(8.5).font('Helvetica').fillColor(GRAY).text('Testemunha 1', 65, testY + 26, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text('Nome: ________________________________', 65, testY + 38, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text('CPF: ________________________', 65, testY + 50, { width: halfW, align: 'center' });
    doc.rect(compX, testY + 20, halfW, 0.7).fill('#aaaaaa');
    doc.fontSize(8.5).font('Helvetica').fillColor(GRAY).text('Testemunha 2', compX, testY + 26, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text('Nome: ________________________________', compX, testY + 38, { width: halfW, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text('CPF: ________________________', compX, testY + 50, { width: halfW, align: 'center' });
    doc.y = testY + 70; doc.moveDown(0.6);

    doc.rect(65, doc.y, W, 0.5).fill('#cccccc');
    doc.moveDown(0.4);
    doc.fontSize(7).font('Helvetica').fillColor('#aaaaaa')
      .text('Template de referência — recomenda-se validação por advogado antes do uso oficial.  |  ' + empresaRazaoSocial + '  |  Baseado no Código Civil Brasileiro (Lei nº 10.406/2002)', { align: 'center' });

    doc.end();
  });
}

function slugArquivoContrato(value: unknown, fallback: string) {
  const slug = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function dataArquivoContrato(value: unknown) {
  const text = String(value ?? '').trim();
  const meses: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;

  const extenso = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (extenso) return `${extenso[3]}-${(meses[extenso[2]] || '00')}-${extenso[1].padStart(2, '0')}`;

  const date = new Date(text || Date.now());
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function localDataContratoAtual() {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'numeric', year: 'numeric' }).formatToParts(new Date());
  const dia = partes.find((parte) => parte.type === 'day')?.value || '01';
  const mes = Math.max(0, Number(partes.find((parte) => parte.type === 'month')?.value || '1') - 1);
  const ano = partes.find((parte) => parte.type === 'year')?.value || String(new Date().getFullYear());
  return `Jundiaí/SP - ${dia} de ${meses[mes] || 'janeiro'} de ${ano}`;
}

function nomeArquivoContratoPdf(dados: Record<string, any>, numeroContrato: unknown, dataCriacao?: unknown) {
  const numero = slugArquivoContrato(numeroContrato ?? 'novo', 'novo');
  const cliente = slugArquivoContrato(dados?.nomeVendedor, 'cliente');
  const moto = slugArquivoContrato(dados?.marcaModelo, 'moto');
  const data = dataArquivoContrato(dados?.localData || dataCriacao || Date.now());
  return `contrato-${numero}-${cliente}-${moto}-${data}.pdf`;
}

// ── CRUD Contratos ────────────────────────────────────────────────────────────

// Listar contratos
motosRouter.get('/contratos', async (_req, res, next) => {
  try {
    const contratos = await prisma.contrato.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, titulo: true, dados: true, criadoEm: true, atualizadoEm: true },
    });
    res.json({ ok: true, contratos });
  } catch (e) { next(e); }
});

// Buscar um contrato
motosRouter.get('/contratos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const contrato = await prisma.contrato.findUnique({ where: { id } });
    if (!contrato) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
    res.json({ ok: true, contrato });
  } catch (e) { next(e); }
});

// Criar contrato
motosRouter.post('/contratos', async (req, res, next) => {
  try {
    const dados = req.body?.dados || req.body || {};
    const titulo = req.body?.titulo || `Contrato - ${dados.nomeVendedor || 'Sem nome'} - ${dados.marcaModelo || 'Sem moto'}`;
    const contrato = await prisma.contrato.create({ data: { titulo, dados } });
    res.json({ ok: true, contrato });
  } catch (e) { next(e); }
});

// Atualizar contrato
motosRouter.put('/contratos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const dados = req.body?.dados || req.body || {};
    const titulo = req.body?.titulo || `Contrato - ${dados.nomeVendedor || 'Sem nome'} - ${dados.marcaModelo || 'Sem moto'}`;
    const contrato = await prisma.contrato.update({ where: { id }, data: { titulo, dados } });
    res.json({ ok: true, contrato });
  } catch (e) { next(e); }
});

// Deletar contrato
motosRouter.delete('/contratos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.contrato.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Gerar PDF de um contrato salvo
motosRouter.get('/contratos/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const contrato = await prisma.contrato.findUnique({ where: { id } });
    if (!contrato) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
    const pdf = await gerarPdfContrato(contrato.dados as Record<string, any>);
    const fileName = nomeArquivoContratoPdf(contrato.dados as Record<string, any>, id, contrato.criadoEm);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// Gerar PDF avulso (sem salvar)
motosRouter.post('/contrato/gerar', async (req, res, next) => {
  try {
    const dados = req.body || {};
    const pdf = await gerarPdfContrato(dados);
    const fileName = nomeArquivoContratoPdf(dados, 'novo');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  } catch (e) { next(e); }
});
