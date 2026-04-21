import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';

export const cadastroRouter = Router();

const BLING_NUMERO_PECA_CAMPO_ID = 2821431;
const BLING_DETRAN_CAMPO_ID = 5979929;
const BLING_MARCA_CAMPO_ID = 2821430;
const BLING_URL_REF_CAMPO_ID = 3066410;
const BLING_CATEGORIA_ID = 10703871;

function buildCadastroBlingErrorResponse(error: any) {
  const message = String(error?.message || 'Falha ao criar produto no Bling.');
  const isInputError = /Bling API 400|Bling API 404|Bling API 409|codigo.*exist|sku.*exist|já existe|ja existe|duplic/i.test(message);

  return {
    status: isInputError ? 400 : 502,
    body: {
      error: message,
      source: 'bling',
    },
  };
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function gerarIdsPeca(baseSku: string, quantidade: number): string[] {
  if (quantidade <= 1) return [baseSku];
  return [baseSku, ...Array.from({ length: quantidade - 1 }, (_, i) => `${baseSku}-${i + 2}`)];
}

function getBaseSku(value: any) {
  return String(value || '').replace(/-\d+$/, '').toUpperCase().trim();
}

function getSkuVariantOrder(idPeca: string) {
  const match = String(idPeca || '').trim().toUpperCase().match(/-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

async function buildDetranEtiquetaConcatForBaseSku(baseSku: string) {
  if (!baseSku) return '';

  const pecas = await prisma.peca.findMany({
    where: {
      OR: [
        { idPeca: { equals: baseSku, mode: 'insensitive' } },
        { idPeca: { startsWith: `${baseSku}-` } },
      ],
    },
    select: {
      idPeca: true,
      detranEtiqueta: true,
    },
  });

  return pecas
    .sort((a, b) => {
      const orderDiff = getSkuVariantOrder(a.idPeca) - getSkuVariantOrder(b.idPeca);
      if (orderDiff !== 0) return orderDiff;
      return String(a.idPeca || '').localeCompare(String(b.idPeca || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
    })
    .map((item) => String(item.detranEtiqueta || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function normalizeNullableText(value: any, options?: { uppercase?: boolean }) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return options?.uppercase ? text.toUpperCase() : text;
}

function parseDetranEtiquetas(value: any) {
  return String(value ?? '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDetranEtiquetasValidationMessage(detranEtiqueta: any, estoque: any) {
  const etiquetas = parseDetranEtiquetas(detranEtiqueta);
  if (!etiquetas.length) return null;

  const qtdEstoque = Math.max(1, Number(estoque) || 1);
  if (etiquetas.length < qtdEstoque) {
    return `Falta o preenchimento de ${qtdEstoque - etiquetas.length} etiqueta(s) Detran ainda para bater com o estoque (${qtdEstoque}).`;
  }
  if (etiquetas.length > qtdEstoque) {
    return `Existem ${etiquetas.length - qtdEstoque} etiqueta(s) Detran a mais para o estoque (${qtdEstoque}).`;
  }

  return null;
}

function isBrunoAuthUser(req: any) {
  return String(req?.authUser?.username || '').trim().toLowerCase() === 'bruno';
}

async function listRelatedSkuIdsForBase(baseSku: string) {
  if (!baseSku) return [];

  const [pecas, cadastros] = await Promise.all([
    prisma.peca.findMany({
      where: {
        OR: [
          { idPeca: { equals: baseSku, mode: 'insensitive' } },
          { idPeca: { startsWith: `${baseSku}-` } },
        ],
      },
      select: { idPeca: true },
    }),
    prisma.cadastroPeca.findMany({
      where: {
        OR: [
          { idPeca: { equals: baseSku, mode: 'insensitive' } },
          { idPeca: { startsWith: `${baseSku}-` } },
        ],
      },
      select: { idPeca: true },
    }),
  ]);

  return Array.from(new Set([...pecas, ...cadastros].map((item) => String(item.idPeca || '').trim().toUpperCase()).filter(Boolean)));
}

function getNextVariantSku(baseSku: string, existingIds: string[]) {
  const normalizedBaseSku = getBaseSku(baseSku);
  let maxOrder = existingIds.some((id) => getBaseSku(id) === normalizedBaseSku) ? 1 : 0;

  for (const id of existingIds) {
    if (getBaseSku(id) !== normalizedBaseSku) continue;
    maxOrder = Math.max(maxOrder, getSkuVariantOrder(id));
  }

  const nextOrder = Math.max(2, maxOrder + 1);
  return `${normalizedBaseSku}-${nextOrder}`;
}

async function resolveBlingProductStateForBaseSku(baseSku: string) {
  let blingProdutoId = '';

  const cadastro = await prisma.cadastroPeca.findFirst({
    where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
    select: { blingProdutoId: true },
  });
  if (cadastro?.blingProdutoId) {
    blingProdutoId = String(cadastro.blingProdutoId);
  }

  if (!blingProdutoId) {
    const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
    const blingItems = blingSearch?.data || [];
    const found = blingItems.find((produto: any) => String(produto.codigo || '').toUpperCase() === baseSku);
    if (found?.id) blingProdutoId = String(found.id);
  }

  if (!blingProdutoId) {
    throw new Error(`Produto nao encontrado no Bling para SKU base: ${baseSku}`);
  }

  const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
  const produto = blingAtual?.data;
  if (!produto) {
    throw new Error(`Falha ao carregar o produto ${baseSku} no Bling.`);
  }

  return {
    blingProdutoId,
    produto,
  };
}

function buildBlingProdutoPayloadFromCurrent(
  produtoAtual: any,
  overrides?: {
    largura?: number | null;
    altura?: number | null;
    profundidade?: number | null;
    pesoLiquido?: number | null;
    localizacao?: string | null;
    numeroPeca?: string | null;
    detranEtiqueta?: string | null;
    estoqueDelta?: number;
  },
) {
  const payload: any = {
    nome: produtoAtual.nome,
    codigo: produtoAtual.codigo,
    tipo: produtoAtual.tipo || 'P',
    formato: produtoAtual.formato || 'S',
    situacao: produtoAtual.situacao || 'A',
    preco: Number(produtoAtual.preco || 0),
    condicao: produtoAtual.condicao ?? 0,
    marca: produtoAtual.marca || '',
    pesoLiquido: overrides?.pesoLiquido != null ? Number(overrides.pesoLiquido) : Number(produtoAtual.pesoLiquido || 0),
    pesoBruto: overrides?.pesoLiquido != null ? Number(overrides.pesoLiquido) : Number(produtoAtual.pesoBruto || 0),
    volumes: produtoAtual.volumes || 1,
    descricaoCurta: produtoAtual.descricaoCurta || '',
    dimensoes: {
      largura: overrides?.largura != null ? Number(overrides.largura) : Number(produtoAtual.dimensoes?.largura || 0),
      altura: overrides?.altura != null ? Number(overrides.altura) : Number(produtoAtual.dimensoes?.altura || 0),
      profundidade: overrides?.profundidade != null ? Number(overrides.profundidade) : Number(produtoAtual.dimensoes?.profundidade || 0),
      unidadeMedida: produtoAtual.dimensoes?.unidadeMedida || 2,
    },
    estoque: {
      minimo: Math.max(0, Number(produtoAtual.estoque?.minimo || 0) + Number(overrides?.estoqueDelta || 0)),
      maximo: Math.max(0, Number(produtoAtual.estoque?.maximo || 0) + Number(overrides?.estoqueDelta || 0)),
      localizacao: overrides?.localizacao != null
        ? String(overrides.localizacao || '')
        : String(produtoAtual.estoque?.localizacao || ''),
    },
  };

  const ccExistentes: any[] = Array.isArray(produtoAtual.camposCustomizados) ? produtoAtual.camposCustomizados : [];
  const ccMap = new Map(ccExistentes.map((campo: any) => [Number(campo.idCampoCustomizado), campo.valor]));

  if (overrides?.numeroPeca !== undefined) {
    ccMap.set(BLING_NUMERO_PECA_CAMPO_ID, overrides.numeroPeca || '');
  }
  if (overrides?.detranEtiqueta !== undefined) {
    ccMap.set(BLING_DETRAN_CAMPO_ID, overrides.detranEtiqueta || '');
  }
  if (ccMap.size > 0) {
    payload.camposCustomizados = Array.from(ccMap.entries()).map(([idCampoCustomizado, valor]) => ({ idCampoCustomizado, valor }));
  }

  return payload;
}

async function getPrimeiroDepositoAtivoId() {
  try {
    const dep = await blingReq('/depositos?pagina=1&limite=1&situacoes[]=1');
    return Number(dep?.data?.[0]?.id || 0) || null;
  } catch {
    return null;
  }
}

async function lancarEstoqueNoBling(params: {
  blingProdutoId: string;
  quantidade: number;
  preco: number;
  observacoes: string;
}) {
  const estoquePayload: any = {
    produto: { id: Number(params.blingProdutoId) },
    operacao: 'B',
    preco: Number(params.preco) || 0,
    custo: 0,
    quantidade: Number(params.quantidade) || 0,
    observacoes: params.observacoes,
  };

  const depositoId = await getPrimeiroDepositoAtivoId();
  if (depositoId) {
    estoquePayload.deposito = { id: depositoId };
  }

  await blingReq('/estoques', {
    method: 'POST',
    body: JSON.stringify(estoquePayload),
  });
}

async function buildBlingPayload(cadastro: any, isUpdate: boolean) {
  const camposCustomizados: any[] = [];
  if (cadastro.numeroPeca) camposCustomizados.push({ idCampoCustomizado: BLING_NUMERO_PECA_CAMPO_ID, valor: cadastro.numeroPeca });
  if (cadastro.detranEtiqueta) camposCustomizados.push({ idCampoCustomizado: BLING_DETRAN_CAMPO_ID, valor: cadastro.detranEtiqueta });
  if (cadastro.moto?.marca) camposCustomizados.push({ idCampoCustomizado: BLING_MARCA_CAMPO_ID, valor: toTitleCase(cadastro.moto.marca) });
  if (cadastro.urlRef) camposCustomizados.push({ idCampoCustomizado: BLING_URL_REF_CAMPO_ID, valor: String(cadastro.urlRef) });

  let situacao = 'I';
  if (isUpdate && cadastro.blingProdutoId) {
    try {
      const produtoAtual = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
      situacao = String(produtoAtual?.data?.situacao || '').trim().toUpperCase() || 'I';
    } catch {
      situacao = 'I';
    }
  }

  const payload: any = {
    nome: cadastro.descricao,
    codigo: cadastro.idPeca,
    preco: Number(cadastro.precoVenda),
    unidade: 'UN',
    tipo: 'P',
    formato: 'S',
    tipoProducao: 'T',
    situacao,
    condicao: cadastro.condicao === 'novo' ? 1 : 2, // 1=Novo, 2=Usado (0=Não especificado)
    descricaoCurta: (cadastro.descricaoPeca || '').replace(/\r\n/g, '<br>').replace(/\n/g, '<br>'),
    marca: toTitleCase(cadastro.moto?.marca || ''),
    volumes: 1,
    pesoLiquido: Number(cadastro.peso || 0),
    pesoBruto: Number(cadastro.peso || 0),
    dimensoes: {
      largura: Number(cadastro.largura || 0),
      altura: Number(cadastro.altura || 0),
      profundidade: Number(cadastro.profundidade || 0),
      unidadeMedida: 1,
    },
    estoque: {
      minimo: Number(cadastro.estoque),
      maximo: Number(cadastro.estoque),
      localizacao: cadastro.localizacao || '',
    },
    categoria: { id: BLING_CATEGORIA_ID },
    tributacao: { ncm: '87141000', cest: '01.076.00' },
  };

  if (camposCustomizados.length) payload.camposCustomizados = camposCustomizados;
  return payload;
}

async function enviarParaBling(cadastro: any) {
  const isUpdate = !!cadastro.blingProdutoId;
  const payload = await buildBlingPayload(cadastro, isUpdate);

  let blingResp: any;
  let blingProdutoId = cadastro.blingProdutoId || '';

  if (isUpdate) {
    blingResp = await blingReq(`/produtos/${blingProdutoId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    blingResp = await blingReq('/produtos', { method: 'POST', body: JSON.stringify(payload) });
    blingProdutoId = String(blingResp?.data?.id || '');
  }

  // Estoque
  if (blingProdutoId && Number(cadastro.estoque) > 0) {
    try {
      const estoquePayload: any = {
        produto: { id: Number(blingProdutoId) },
        operacao: 'B',
        preco: Number(cadastro.precoVenda) || 0,
        custo: 0,
        quantidade: Number(cadastro.estoque),
        observacoes: `Estoque inicial - ${cadastro.idPeca}`,
      };
      try {
        const dep = await blingReq('/depositos?pagina=1&limite=1&situacoes[]=1');
        const depId = Number(dep?.data?.[0]?.id || 0);
        if (depId) estoquePayload.deposito = { id: depId };
      } catch { /* sem permissão */ }
      await blingReq('/estoques', { method: 'POST', body: JSON.stringify(estoquePayload) });
    } catch (e: any) { console.error('[cadastro] Erro estoque:', e?.message); }
  }

  return blingProdutoId;
}

// GET /cadastro
cadastroRouter.get('/', async (req, res, next) => {
  try {
    const { status, motoId, search, semDimensoes, semNumeroPeca, page = '1', per = '200', somentePendentes } = req.query as any;
    const where: any = {};

    if (somentePendentes === 'true') {
      where.status = { not: 'cadastrado' };
    } else if (status) {
      where.status = status;
    }
    if (motoId) where.motoId = Number(motoId);
    if (search) {
      where.OR = [
        { idPeca: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (semDimensoes === 'true') {
      where.OR = [...(where.OR || []), { largura: null }, { largura: 0 }, { altura: null }, { altura: 0 }, { profundidade: null }, { profundidade: 0 }];
    }
    if (semNumeroPeca === 'true') where.numeroPeca = null;

    const skip = (Number(page) - 1) * Number(per);
    const [total, data] = await Promise.all([
      prisma.cadastroPeca.count({ where }),
      prisma.cadastroPeca.findMany({
        where,
        include: { moto: { select: { id: true, marca: true, modelo: true, ano: true, descricaoModelo: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(per),
      }),
    ]);

    res.json({ total, data });
  } catch (e) { next(e); }
});

// GET /cadastro/proximo-id/:motoId
cadastroRouter.get('/proximo-id/:motoId', async (req, res, next) => {
  try {
    const motoId = Number(req.params.motoId);
    const cfg = await prisma.blingConfig.findFirst();
    const prefixos: any[] = (cfg?.prefixos as any) || [];
    const prefixoObj = prefixos.find((p: any) => Number(p.motoId) === motoId);
    const prefixo = prefixoObj?.prefixo ? String(prefixoObj.prefixo).toUpperCase().trim() : null;
    if (!prefixo) return res.json({ prefixo: null, proximo: null, sugestao: null });

    const [pecas, cadastros] = await Promise.all([
      prisma.peca.findMany({ where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] }, select: { idPeca: true } }),
      prisma.cadastroPeca.findMany({ where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] }, select: { idPeca: true } }),
    ]);

    const todos = [...pecas, ...cadastros].map((p) => p.idPeca);
    let maiorNum = 0;
    for (const id of todos) {
      const match = id.match(/_(\d+)/);
      if (match) { const num = parseInt(match[1], 10); if (num > maiorNum) maiorNum = num; }
    }

    const proximo = maiorNum + 1;
    const sugestao = `${prefixo}_${String(proximo).padStart(4, '0')}`;
    res.json({ prefixo, proximo, sugestao });
  } catch (e) { next(e); }
});

// POST /cadastro - criar pré-cadastro e enviar ao Bling
cadastroRouter.post('/', async (req, res, next) => {
  try {
    const { motoId, idPeca, descricao, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, detranEtiqueta, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;

    if (!motoId || !idPeca || !descricao) return res.status(400).json({ error: 'motoId, idPeca e descricao sao obrigatorios' });
    const detranValidationMessage = getDetranEtiquetasValidationMessage(detranEtiqueta, estoque);
    if (detranValidationMessage) return res.status(400).json({ error: detranValidationMessage });

    const existing = await prisma.cadastroPeca.findUnique({ where: { idPeca } });
    if (existing) return res.status(400).json({ error: 'ID de peça já existe no cadastro' });

    const record = await prisma.cadastroPeca.create({
      data: {
        motoId: Number(motoId),
        idPeca: String(idPeca).toUpperCase().trim(),
        descricao: String(descricao).trim().slice(0, 60),
        descricaoPeca: descricaoPeca ? String(descricaoPeca).trim() : null,
        precoVenda: Number(precoVenda) || 0,
        condicao: condicao || 'usado',
        peso: peso != null ? Number(peso) : null,
        largura: largura != null ? Number(largura) : null,
        altura: altura != null ? Number(altura) : null,
        profundidade: profundidade != null ? Number(profundidade) : null,
        numeroPeca: numeroPeca ? String(numeroPeca).trim() : null,
        detranEtiqueta: detranEtiqueta ? String(detranEtiqueta).trim() : null,
        localizacao: localizacao ? String(localizacao).trim() : null,
        estoque: Number(estoque) || 1,
        categoriaMLId: categoriaMLId || null,
        categoriaMLNome: categoriaMLNome || null,
        urlRef: urlRef ? String(urlRef).trim() : null,
        status: 'pre_cadastro',
      },
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    // Enviar ao Bling
    try {
      const blingProdutoId = await enviarParaBling(record);
      const updated = await prisma.cadastroPeca.update({ where: { id: record.id }, data: { blingProdutoId } });
      res.status(201).json({ ...updated, _blingOk: true });
    } catch (blingErr: any) {
      await prisma.cadastroPeca.delete({ where: { id: record.id } }).catch(() => null);
      const failure = buildCadastroBlingErrorResponse(blingErr);
      return res.status(failure.status).json(failure.body);
    }
  } catch (e) { next(e); }
});

// GET /cadastro/copiar-peca/:pecaId/preview
cadastroRouter.get('/copiar-peca/:pecaId/preview', async (req, res, next) => {
  try {
    const pecaId = Number(req.params.pecaId);
    const origem = await prisma.peca.findUnique({
      where: { id: pecaId },
      include: {
        moto: {
          select: {
            id: true,
            marca: true,
            modelo: true,
            ano: true,
          },
        },
      },
    });

    if (!origem) {
      return res.status(404).json({ error: 'Peca de origem nao encontrada' });
    }
    if (origem.emPrejuizo) {
      return res.status(400).json({ error: 'Pecas em prejuizo nao podem ser copiadas.' });
    }

    const baseSku = getBaseSku(origem.idPeca);
    const existingIds = await listRelatedSkuIdsForBase(baseSku);
    const novoIdPeca = getNextVariantSku(baseSku, existingIds);

    res.json({
      ok: true,
      baseSku,
      novoIdPeca,
      totalVariacoes: existingIds.length,
      detranObrigatorio: Boolean(String(origem.detranEtiqueta || '').trim()),
      limpaVenda: Boolean(origem.dataVenda || origem.blingPedidoId || origem.blingPedidoNum),
      origem: {
        id: origem.id,
        idPeca: origem.idPeca,
        descricao: origem.descricao,
        localizacao: origem.localizacao,
        detranEtiqueta: origem.detranEtiqueta,
        numeroPeca: origem.numeroPeca,
        precoML: origem.precoML,
        valorLiq: origem.valorLiq,
        valorFrete: origem.valorFrete,
        valorTaxas: origem.valorTaxas,
        pesoLiquido: origem.pesoLiquido,
        pesoBruto: origem.pesoBruto,
        largura: origem.largura,
        altura: origem.altura,
        profundidade: origem.profundidade,
        moto: origem.moto,
      },
    });
  } catch (e) { next(e); }
});

// POST /cadastro/copiar-peca/:pecaId - cria nova variacao no estoque e sincroniza Bling
cadastroRouter.post('/copiar-peca/:pecaId', async (req, res, next) => {
  try {
    const pecaId = Number(req.params.pecaId);
    const origem = await prisma.peca.findUnique({
      where: { id: pecaId },
      include: {
        moto: {
          select: {
            id: true,
            marca: true,
            modelo: true,
            ano: true,
          },
        },
      },
    });

    if (!origem) {
      return res.status(404).json({ error: 'Peca de origem nao encontrada' });
    }
    if (origem.emPrejuizo) {
      return res.status(400).json({ error: 'Pecas em prejuizo nao podem ser copiadas.' });
    }

    const baseSku = getBaseSku(origem.idPeca);
    const existingIds = await listRelatedSkuIdsForBase(baseSku);
    const novoIdPeca = getNextVariantSku(baseSku, existingIds);
    const detranOrigem = normalizeNullableText(origem.detranEtiqueta, { uppercase: true });
    const novaEtiquetaDetran = normalizeNullableText(req.body?.detranEtiqueta, { uppercase: true });

    if (detranOrigem && !novaEtiquetaDetran) {
      return res.status(400).json({ error: 'Informe uma nova etiqueta Detran para copiar este SKU.' });
    }
    if (detranOrigem && novaEtiquetaDetran === detranOrigem) {
      return res.status(400).json({ error: 'A nova etiqueta Detran nao pode repetir a etiqueta da variacao de origem.' });
    }

    if (novaEtiquetaDetran) {
      const detranDuplicada = await prisma.peca.findFirst({
        where: {
          id: { not: origem.id },
          detranEtiqueta: { equals: novaEtiquetaDetran, mode: 'insensitive' },
          OR: [
            { idPeca: { equals: baseSku, mode: 'insensitive' } },
            { idPeca: { startsWith: `${baseSku}-` } },
          ],
        },
        select: { idPeca: true },
      });

      if (detranDuplicada) {
        return res.status(400).json({ error: `A etiqueta Detran ${novaEtiquetaDetran} ja esta em uso na variacao ${detranDuplicada.idPeca}.` });
      }
    }

    const { blingProdutoId, produto } = await resolveBlingProductStateForBaseSku(baseSku);

    const novaPeca = await prisma.peca.create({
      data: {
        motoId: origem.motoId,
        idPeca: novoIdPeca,
        descricao: origem.descricao,
        localizacao: normalizeNullableText(origem.localizacao),
        detranEtiqueta: novaEtiquetaDetran,
        mercadoLivreItemId: origem.mercadoLivreItemId || null,
        mercadoLivreLink: origem.mercadoLivreLink || null,
        precoML: Number(origem.precoML || 0),
        valorLiq: Number(origem.valorLiq || 0),
        valorFrete: Number(origem.valorFrete || 0),
        valorTaxas: Number(origem.valorTaxas || 0),
        disponivel: true,
        emPrejuizo: false,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        pesoLiquido: origem.pesoLiquido != null ? Number(origem.pesoLiquido) : null,
        pesoBruto: origem.pesoBruto != null ? Number(origem.pesoBruto) : (origem.pesoLiquido != null ? Number(origem.pesoLiquido) : null),
        largura: origem.largura != null ? Number(origem.largura) : null,
        altura: origem.altura != null ? Number(origem.altura) : null,
        profundidade: origem.profundidade != null ? Number(origem.profundidade) : null,
        numeroPeca: normalizeNullableText(origem.numeroPeca),
        cadastro: new Date(),
      },
      include: {
        moto: {
          select: {
            id: true,
            marca: true,
            modelo: true,
            ano: true,
          },
        },
      },
    });

    const detranConcat = await buildDetranEtiquetaConcatForBaseSku(baseSku);
    const blingPayload = buildBlingProdutoPayloadFromCurrent(produto, {
      largura: origem.largura != null ? Number(origem.largura) : null,
      altura: origem.altura != null ? Number(origem.altura) : null,
      profundidade: origem.profundidade != null ? Number(origem.profundidade) : null,
      pesoLiquido: origem.pesoLiquido != null ? Number(origem.pesoLiquido) : null,
      localizacao: normalizeNullableText(origem.localizacao),
      numeroPeca: normalizeNullableText(origem.numeroPeca),
      detranEtiqueta: detranConcat,
      estoqueDelta: 1,
    });

    let produtoAtualizadoNoBling = false;

    try {
      await blingReq(`/produtos/${blingProdutoId}`, {
        method: 'PUT',
        body: JSON.stringify(blingPayload),
      });
      produtoAtualizadoNoBling = true;

      const saldoAtual = Number(produto.estoque?.saldoVirtualTotal || 0);
      await lancarEstoqueNoBling({
        blingProdutoId,
        quantidade: saldoAtual + 1,
        preco: Number(origem.precoML || 0),
        observacoes: `Copia SKU - ${novoIdPeca}`,
      });
    } catch (blingError: any) {
      await prisma.peca.delete({ where: { id: novaPeca.id } }).catch(() => null);

      if (produtoAtualizadoNoBling) {
        try {
          const restorePayload = buildBlingProdutoPayloadFromCurrent(produto);
          await blingReq(`/produtos/${blingProdutoId}`, {
            method: 'PUT',
            body: JSON.stringify(restorePayload),
          });
        } catch (restoreError: any) {
          console.error('[copiar-sku] Falha ao reverter produto no Bling:', restoreError?.message);
        }
      }

      const failure = buildCadastroBlingErrorResponse(blingError);
      return res.status(failure.status).json({
        ...failure.body,
        error: `Falha ao copiar SKU e sincronizar com o Bling: ${failure.body.error}`,
      });
    }

    res.status(201).json({
      ok: true,
      novoIdPeca,
      detranEtiquetaEnviada: detranConcat,
      peca: novaPeca,
    });
  } catch (e) { next(e); }
});

// PUT /cadastro/:id
cadastroRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const atual = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Não encontrado' });
    if (atual.status === 'cadastrado') return res.status(400).json({ error: 'Cadastro já finalizado — não é possível editar' });

    const { descricao, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, detranEtiqueta, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;
    const estoqueEfetivo = estoque !== undefined ? Number(estoque) : Number(atual.estoque);
    const detranEtiquetaEfetiva = detranEtiqueta !== undefined ? detranEtiqueta : atual.detranEtiqueta;
    const detranValidationMessage = getDetranEtiquetasValidationMessage(detranEtiquetaEfetiva, estoqueEfetivo);
    if (detranValidationMessage) return res.status(400).json({ error: detranValidationMessage });
    const data: any = {};
    if (descricao !== undefined) data.descricao = String(descricao).trim().slice(0, 60);
    if (descricaoPeca !== undefined) data.descricaoPeca = descricaoPeca || null;
    if (precoVenda !== undefined) data.precoVenda = Number(precoVenda);
    if (condicao !== undefined) data.condicao = condicao;
    if (peso !== undefined) data.peso = peso != null ? Number(peso) : null;
    if (largura !== undefined) data.largura = largura != null ? Number(largura) : null;
    if (altura !== undefined) data.altura = altura != null ? Number(altura) : null;
    if (profundidade !== undefined) data.profundidade = profundidade != null ? Number(profundidade) : null;
    if (numeroPeca !== undefined) data.numeroPeca = numeroPeca || null;
    if (detranEtiqueta !== undefined) data.detranEtiqueta = detranEtiqueta || null;
    if (localizacao !== undefined) data.localizacao = localizacao || null;
    if (estoque !== undefined) data.estoque = Number(estoque);
    if (categoriaMLId !== undefined) data.categoriaMLId = categoriaMLId || null;
    if (categoriaMLNome !== undefined) data.categoriaMLNome = categoriaMLNome || null;
    if (urlRef !== undefined) data.urlRef = urlRef || null;

    const record = await prisma.cadastroPeca.update({
      where: { id },
      data,
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    // Re-enviar ao Bling
    try {
      await enviarParaBling(record);
      res.json({ ...record, _blingOk: true });
    } catch (blingErr: any) {
      res.json({ ...record, _blingOk: false, _blingErro: blingErr?.message });
    }
  } catch (e) { next(e); }
});

// POST /cadastro/:id/finalizar — busca dados do Bling e lança no estoque
cadastroRouter.post('/:id/finalizar', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cadastro = await prisma.cadastroPeca.findUnique({
      where: { id },
      include: { moto: { select: { id: true, marca: true, modelo: true } } },
    });
    if (!cadastro) return res.status(404).json({ error: 'Não encontrado' });
    if (!cadastro.blingProdutoId) return res.status(400).json({ error: 'Produto não foi enviado ao Bling ainda' });

    // Busca dados atuais do produto no Bling
    const blingData = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
    const b = blingData?.data || {};

    // Busca link do anúncio ML no Bling
    let mercadoLivreLink: string | null = null;
    let mercadoLivreItemId: string | null = null;
    try {
      const lojaML = 205204423; // ID loja ML hardcoded
      const lojasData = await blingReq(`/produtos/lojas?pagina=1&limite=100&idProduto=${cadastro.blingProdutoId}`);
      const lojas = lojasData?.data || [];
      const lojaLink = lojas.find((l: any) => Number(l.loja?.id) === lojaML);
      if (lojaLink?.idAnuncio) {
        const anuncioData = await blingReq(`/anuncios/${lojaLink.idAnuncio}?tipoIntegracao=MercadoLivre&idLoja=${lojaML}`);
        const anuncio = anuncioData?.data;
        if (anuncio?.link) mercadoLivreLink = String(anuncio.link);
        if (anuncio?.idAnuncio) mercadoLivreItemId = String(anuncio.idAnuncio);
      }
    } catch { /* sem anuncio ainda */ }

    // Busca config de taxa e frete
    const cfgProdutos = await prisma.blingConfig.findFirst();
    const fretePadrao = Number((cfgProdutos as any)?.fretePadrao || 29.9);
    const taxaPadraoPct = Number((cfgProdutos as any)?.taxaPadraoPct || 17);

    const precoML = Number(b.preco || cadastro.precoVenda);
    const frete = req.body.frete != null ? Number(req.body.frete) : fretePadrao;
    const taxaPct = req.body.taxaPct != null ? Number(req.body.taxaPct) : taxaPadraoPct;
    const valorTaxas = parseFloat((precoML * taxaPct / 100).toFixed(2));
    const valorLiq = parseFloat((precoML - frete - valorTaxas).toFixed(2));

    // Monta diff entre Bling e ANB
    const diff: Record<string, { bling: any; anb: any }> = {};
    if (b.nome && b.nome !== cadastro.descricao) diff.descricao = { bling: b.nome, anb: cadastro.descricao };
    if (b.preco && Number(b.preco) !== Number(cadastro.precoVenda)) diff.precoVenda = { bling: b.preco, anb: cadastro.precoVenda };
    const bPeso = b.pesoLiquido || 0;
    if (bPeso && Number(bPeso) !== Number(cadastro.peso || 0)) diff.peso = { bling: bPeso, anb: cadastro.peso };
    const bLargura = b.dimensoes?.largura || 0;
    if (bLargura && Number(bLargura) !== Number(cadastro.largura || 0)) diff.largura = { bling: bLargura, anb: cadastro.largura };
    const bAltura = b.dimensoes?.altura || 0;
    if (bAltura && Number(bAltura) !== Number(cadastro.altura || 0)) diff.altura = { bling: bAltura, anb: cadastro.altura };
    const bProf = b.dimensoes?.profundidade || 0;
    if (bProf && Number(bProf) !== Number(cadastro.profundidade || 0)) diff.profundidade = { bling: bProf, anb: cadastro.profundidade };

    if (req.body.confirmar) {
      // Lança peças no estoque com sufixos
      const qtd = Number(b.estoque?.saldoVirtualTotal || cadastro.estoque || 1);
      const ids = gerarIdsPeca(cadastro.idPeca, qtd);
      const pecasCriadas = [];

      // Split etiquetas detran por variação: "SP001 / SP002 / SP003" → ['SP001', 'SP002', 'SP003']
      const etiquetasArray = cadastro.detranEtiqueta
        ? cadastro.detranEtiqueta.split('/').map((e: string) => e.trim()).filter(Boolean)
        : [];

      // Validação: se há etiquetas, deve bater com a quantidade
      if (etiquetasArray.length > 0 && etiquetasArray.length !== ids.length) {
        return res.status(400).json({
          ok: false,
          error: `Quantidade de etiquetas Detran (${etiquetasArray.length}) não bate com o estoque (${ids.length}). Corrija no pré-cadastro antes de finalizar.`,
        });
      }

      for (let i = 0; i < ids.length; i++) {
        const idPeca = ids[i];
        const existing = await prisma.peca.findUnique({ where: { idPeca } });
        if (existing) continue;
        const peca = await prisma.peca.create({
          data: {
            motoId: cadastro.motoId,
            idPeca,
            descricao: b.nome || cadastro.descricao,
            precoML,
            valorLiq,
            valorFrete: frete,
            valorTaxas,
            disponivel: true,
            emPrejuizo: false,
            localizacao: b.estoque?.localizacao || cadastro.localizacao || null,
            mercadoLivreLink: mercadoLivreLink || null,
            mercadoLivreItemId: mercadoLivreItemId || null,
            pesoLiquido: bPeso || Number(cadastro.peso || 0),
            pesoBruto: bPeso || Number(cadastro.peso || 0),
            largura: bLargura || Number(cadastro.largura || 0),
            altura: bAltura || Number(cadastro.altura || 0),
            profundidade: bProf || Number(cadastro.profundidade || 0),
            numeroPeca: cadastro.numeroPeca || null,
            // Cada variação recebe sua etiqueta, ou a concatenada se só há 1
            detranEtiqueta: etiquetasArray.length > 0 ? (etiquetasArray[i] || null) : null,
            cadastro: new Date(),
          },
        });
        pecasCriadas.push(peca);
      }

      await prisma.cadastroPeca.update({ where: { id }, data: { status: 'cadastrado' } });
      return res.json({ ok: true, pecasCriadas, diff });
    }

    // Só preview — retorna dados do Bling + diff + cálculo financeiro
    res.json({
      ok: true,
      preview: {
        descricao: b.nome || cadastro.descricao,
        precoML,
        frete,
        taxaPct,
        valorTaxas,
        valorLiq,
        peso: bPeso,
        largura: bLargura,
        altura: bAltura,
        profundidade: bProf,
        localizacao: b.estoque?.localizacao || cadastro.localizacao,
        estoque: b.estoque?.saldoVirtualTotal || cadastro.estoque,
        detranEtiqueta: cadastro.detranEtiqueta || null,
        fretePadrao,
        taxaPadraoPct,
        mercadoLivreLink,
        mercadoLivreItemId,
      },
      diff,
    });
  } catch (e) { next(e); }
});

// POST /cadastro/sync-bling-peca — atualiza campos físicos de uma peça diretamente no Bling
// Aceita blingProdutoId direto OU sku para buscar automaticamente
cadastroRouter.post('/sync-bling-peca', async (req, res, next) => {
  try {
    let {
      blingProdutoId,
      sku,
      largura,
      altura,
      profundidade,
      pesoLiquido,
      localizacao,
      detranEtiqueta,
      numeroPeca,
      concatDetranEtiquetasVariacoes,
      precoML,
      descricao,
    } = req.body;
    const baseSku = getBaseSku(sku);

    // Se veio SKU mas não blingProdutoId, resolve pelo CadastroPeca
    if (!blingProdutoId && sku) {
      const cadastro = await prisma.cadastroPeca.findFirst({
        where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
        select: { blingProdutoId: true },
      });
      if (cadastro?.blingProdutoId) {
        blingProdutoId = cadastro.blingProdutoId;
      } else {
        // Tenta buscar direto no Bling pelo código/SKU
        const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
        const blingItems = blingSearch?.data || [];
        const found = blingItems.find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
        if (found) blingProdutoId = String(found.id);
      }
    }

    if (!blingProdutoId) {
      return res.status(404).json({ ok: false, error: `Produto não encontrado no Bling para SKU: ${sku}` });
    }

    // Busca produto atual no Bling para manter campos obrigatórios
    const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
    const b = blingAtual?.data;
    if (!b) return res.status(404).json({ error: 'Produto não encontrado no Bling' });

    // Monta payload: copia produto inteiro do Bling, sobrepõe só o que veio na requisição
    const BLING_READONLY = ['id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'depositos', 'variacoes', 'estrutura'];
    const payload: any = { ...b };
    for (const f of BLING_READONLY) delete payload[f];

    // Campos SEMPRE fixos — independente do que estiver no Bling
    payload.unidade = 'UN';
    payload.tipoProducao = 'T';
    payload.tributacao = { ...(b.tributacao || {}), ncm: '87141000', cest: '01.076.00' };

    // Sobrepõe só os campos que vieram na requisição
    if (descricao != null) payload.nome = String(descricao);
    if (precoML != null) payload.preco = Number(precoML);
    if (pesoLiquido != null) { payload.pesoLiquido = Number(pesoLiquido); payload.pesoBruto = Number(pesoLiquido); }
    if (largura != null || altura != null || profundidade != null) {
      payload.dimensoes = {
        largura: largura != null ? Number(largura) : Number(b.dimensoes?.largura || 0),
        altura: altura != null ? Number(altura) : Number(b.dimensoes?.altura || 0),
        profundidade: profundidade != null ? Number(profundidade) : Number(b.dimensoes?.profundidade || 0),
        unidadeMedida: b.dimensoes?.unidadeMedida || 2,
      };
    }
    if (localizacao != null) {
      payload.estoque = {
        ...b.estoque,
        localizacao: String(localizacao || ''),
      };
    }

    // Campos customizados — merge com os existentes no Bling, sobrepõe só os que vieram
    const ccExistentes: any[] = Array.isArray(b.camposCustomizados) ? b.camposCustomizados : [];
    const ccMap = new Map(ccExistentes.map((c: any) => [Number(c.idCampoCustomizado), c.valor]));
    const shouldConcatDetranEtiquetas = Boolean(concatDetranEtiquetasVariacoes && baseSku);
    const detranEtiquetaParaBling = shouldConcatDetranEtiquetas
      ? await buildDetranEtiquetaConcatForBaseSku(baseSku)
      : (detranEtiqueta || '');
    if (numeroPeca !== undefined) ccMap.set(2821431, numeroPeca || '');
    if (detranEtiqueta !== undefined || shouldConcatDetranEtiquetas) {
      ccMap.set(5979929, detranEtiquetaParaBling);
    }
    if (ccMap.size > 0) {
      payload.camposCustomizados = Array.from(ccMap.entries()).map(([id, valor]) => ({ idCampoCustomizado: id, valor }));
    }

    console.log('[sync-bling-peca] PUT produto', blingProdutoId);
    await blingReq(`/produtos/${blingProdutoId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    res.json({ ok: true, detranEtiquetaEnviada: detranEtiquetaParaBling });
  } catch (e: any) {
    console.error('[sync-bling-peca] Erro:', e?.message);
    res.status(400).json({ ok: false, error: e?.message });
  }
});

// DELETE /cadastro/:id
cadastroRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cadastro = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!cadastro) return res.status(404).json({ error: 'Não encontrado' });
    // Se forceDelete=true, pula a verificação do Bling
    const forceDelete = req.query.force === 'true';

    if (forceDelete && !isBrunoAuthUser(req)) {
      return res.status(403).json({ error: 'Apenas o usuario Bruno pode eliminar linhas finalizadas do cadastro.' });
    }

    if (cadastro.blingProdutoId && !forceDelete) {
      let existeNoBling = false;
      let blingDebug: any = null;
      try {
        const blingCheck = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
        blingDebug = blingCheck;
        // Bling pode retornar produto "inativo/excluído" com situacao='E' — não bloquear nesses casos
        const situacao = String(blingCheck?.data?.situacao || '');
        const temId = blingCheck?.data?.id && String(blingCheck.data.id) === String(cadastro.blingProdutoId);
        if (temId && situacao !== 'E' && situacao !== 'I') {
          existeNoBling = true;
        }
      } catch (e: any) {
        console.log('[cadastro delete] Bling check erro (produto não existe):', e?.message?.slice(0, 100));
        existeNoBling = false;
      }
      console.log('[cadastro delete] blingProdutoId:', cadastro.blingProdutoId, '| existeNoBling:', existeNoBling, '| debug:', JSON.stringify(blingDebug?.data?.situacao));
      if (existeNoBling) {
        return res.status(400).json({ error: 'Este pré-cadastro já foi replicado ao Bling e o produto ainda existe lá. Delete o produto no Bling primeiro, ou use a opção "Forçar exclusão".' });
      }
    }
    await prisma.cadastroPeca.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.get('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUnique({
      where: { id: Number(req.params.motoId) },
      select: { id: true, descricaoModelo: true, etiquetaSkuLabel: true },
    });
    res.json({ descricaoModelo: moto?.descricaoModelo || '', etiquetaSkuLabel: moto?.etiquetaSkuLabel || '' });
  } catch (e) { next(e); }
});

// PUT /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.put('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const { descricaoModelo, etiquetaSkuLabel } = req.body;
    await prisma.moto.update({
      where: { id: Number(req.params.motoId) },
      data: {
        descricaoModelo: descricaoModelo ? String(descricaoModelo).trim() : null,
        etiquetaSkuLabel: etiquetaSkuLabel ? String(etiquetaSkuLabel).trim().toUpperCase() : null,
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
