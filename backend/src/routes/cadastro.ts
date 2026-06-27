import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { compressDataUrlImage, normalizeImageFileName } from '../lib/image';
import { buscarCadastroFotos, buscarCadastroFotosAnb, buscarCadastroFotosDrive, enviarCadastroFotosManual, processarCadastroFotos, verificarCadastroFotoSku, verificarFotosCadastroPeca, getPastaPreCadastroDoSku, apagarPastaDrive } from '../lib/fotos-cadastro';
import { blingReq, fetchProdutoLojaLinksByProductId, resolveBlingMercadoLivreItemId, resolveBlingMercadoLivreLinkWithFallback } from './bling';
import { criarPastaPreCadastro } from './google-drive';
import { mercadoLivreReq } from '../lib/mercado-livre';
import { nuvemReq, buscarProdutoNuvemshopPorSku } from './nuvemshop';

const CAMPOS_COMPLETOS_WHERE = {
  peso: { not: null as null },
  largura: { not: null as null },
  altura: { not: null as null },
  profundidade: { not: null as null },
  numeroPeca: { not: null as null },
  localizacao: { not: null as null },
  precoVenda: { gt: 0 },
} as const;

export const cadastroRouter = Router();

const BLING_NUMERO_PECA_CAMPO_ID = 2821431;
const BLING_DETRAN_CAMPO_ID = 5979929;
const BLING_MARCA_CAMPO_ID = 2821430;
const BLING_URL_REF_CAMPO_ID = 3066410;
const BLING_CATEGORIA_ID = 10703871;
const BLING_CONDICAO_NAO_ESPECIFICADO = 0;
const BLING_CONDICAO_NOVO = 1;
const BLING_CONDICAO_USADO = 2;

function hasCadastroAction(req: any, action: string) {
  const user = req.authUser || {};
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'bruno' || user.isAdmin) return true;
  const actions = user.permissions?.cadastro;
  return Array.isArray(actions) && actions.includes(action);
}

function requireCadastroAction(action: string) {
  return (req: any, res: any, next: any) => {
    if (hasCadastroAction(req, action)) return next();
    return res.status(403).json({ ok: false, error: 'Seu usuario nao tem permissao para executar esta acao.' });
  };
}

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

// Produto "Par": se o titulo tem a palavra inteira Par/Pares, cada unidade de estoque
// equivale a 2 pecas fisicas -> 2 etiquetas Detran por unidade (2x estoque).
function detranMultiplicadorPorTitulo(titulo: any) {
  return /\bpar(es)?\b/i.test(String(titulo || '')) ? 2 : 1;
}

function getDetranEtiquetasValidationMessage(detranEtiqueta: any, estoque: any, titulo?: any) {
  const etiquetas = parseDetranEtiquetas(detranEtiqueta);
  if (!etiquetas.length) return null;

  const qtdEstoque = Math.max(1, Number(estoque) || 1);
  const multiplicador = detranMultiplicadorPorTitulo(titulo);
  const esperadas = qtdEstoque * multiplicador;
  const notaPar = multiplicador > 1 ? ' — "Par": 2 etiquetas por unidade' : '';

  if (etiquetas.length < esperadas) {
    return `Falta o preenchimento de ${esperadas - etiquetas.length} etiqueta(s) Detran ainda para o esperado (${esperadas}${notaPar}).`;
  }
  if (etiquetas.length > esperadas) {
    return `Existem ${etiquetas.length - esperadas} etiqueta(s) Detran a mais para o esperado (${esperadas}${notaPar}).`;
  }

  return null;
}

// Bloco do motor: etiqueta de cartela terminando em 005, ou avulsa com tipo "Bloco do motor".
// Nesses casos o Número do Motor é obrigatório.
function ehBlocoDoMotor(detranEtiqueta: any, tipoPecaAvulsa: any) {
  const etiq = String(detranEtiqueta || '').trim();
  const tipo = String(tipoPecaAvulsa || '').trim();
  return /005$/.test(etiq) || tipo === 'Bloco do motor';
}

function getNumeroMotorValidationMessage(detranEtiqueta: any, tipoPecaAvulsa: any, numeroMotor: any) {
  if (ehBlocoDoMotor(detranEtiqueta, tipoPecaAvulsa) && !String(numeroMotor || '').trim()) {
    return 'Numero do Motor e obrigatorio para Bloco do motor (etiqueta de cartela final 005 ou avulsa com tipo Bloco do motor).';
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
    condicao: produtoAtual.condicao ?? BLING_CONDICAO_NAO_ESPECIFICADO,
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
    condicao: cadastro.condicao === 'novo' ? BLING_CONDICAO_NOVO : BLING_CONDICAO_USADO, // 1=Novo, 2=Usado (0=Não especificado)
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
    const { status, motoId, search, semDimensoes, comDimensoes, preCadastroCompleto, semNumeroPeca, page = '1', per = '200', somentePendentes } = req.query as any;
    const where: any = {};

    if (somentePendentes === 'true') {
      where.status = { not: 'cadastrado' };
    } else if (status) {
      where.status = status;
    }
    if (motoId) where.motoId = Number(motoId);
    if (search) {
      const normalizedSearch = String(search).trim();
      where.OR = [
        { idPeca: { startsWith: normalizedSearch, mode: 'insensitive' } },
        { descricao: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }
    if (semDimensoes === 'true') {
      where.OR = [...(where.OR || []), { largura: null }, { largura: 0 }, { altura: null }, { altura: 0 }, { profundidade: null }, { profundidade: 0 }];
    }
    if (comDimensoes === 'true') {
      where.AND = [...(where.AND || []),
        { peso: { not: null } }, { largura: { not: null } },
        { altura: { not: null } }, { profundidade: { not: null } },
      ];
    }
    if (preCadastroCompleto === 'true') {
      where.AND = [...(where.AND || []),
        { peso: { not: null } }, { largura: { not: null } },
        { altura: { not: null } }, { profundidade: { not: null } },
        { numeroPeca: { not: null } }, { localizacao: { not: null } },
        { precoVenda: { gt: 0 } }, { fotoCadastroVerificada: true },
      ];
    }
    if (semNumeroPeca === 'true') where.numeroPeca = null;

    const skip = (Number(page) - 1) * Number(per);
    const [total, data] = await Promise.all([
      prisma.cadastroPeca.count({ where }),
      prisma.cadastroPeca.findMany({
        where,
        include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(per),
      }),
    ]);

    res.json({ total, data });
  } catch (e) { next(e); }
});

// GET /cadastro/opcoes - dados leves para a tela de cadastro
cadastroRouter.get('/opcoes', async (_req, res, next) => {
  try {
    const [motos, caixasRows] = await Promise.all([
      prisma.moto.findMany({
        select: {
          id: true,
          marca: true,
          modelo: true,
          ano: true,
        },
        orderBy: { id: 'asc' },
      }),
      prisma.peca.findMany({
        where: {
          disponivel: true,
          emPrejuizo: false,
          localizacao: { not: null },
        },
        select: {
          localizacao: true,
        },
        orderBy: {
          localizacao: 'asc',
        },
      }),
    ]);

    const caixas = Array.from(
      new Set(
        caixasRows
          .map((item) => String(item.localizacao || '').trim())
          .filter(Boolean),
      ),
    );

    res.json({ motos, caixas });
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
cadastroRouter.post('/', requireCadastroAction('criar_pre_cadastro'), async (req, res, next) => {
  try {
    const { motoId, idPeca, descricao, descricaoPecaTitulo, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, numeroMotor, detranEtiqueta, tipoPecaAvulsa, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;

    if (!motoId || !idPeca || !descricao) return res.status(400).json({ error: 'motoId, idPeca e descricao sao obrigatorios' });
    if (!String(idPeca || '').trim()) return res.status(400).json({ error: 'SKU (idPeca) é obrigatorio' });
    const detranValidationMessage = getDetranEtiquetasValidationMessage(detranEtiqueta, estoque, descricao);
    if (detranValidationMessage) return res.status(400).json({ error: detranValidationMessage });
    const numeroMotorMsg = getNumeroMotorValidationMessage(detranEtiqueta, tipoPecaAvulsa, numeroMotor);
    if (numeroMotorMsg) return res.status(400).json({ error: numeroMotorMsg });

    const existing = await prisma.cadastroPeca.findUnique({ where: { idPeca } });
    if (existing) return res.status(400).json({ error: 'ID de peça já existe no cadastro' });

    const record = await (prisma as any).cadastroPeca.create({
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
        numeroMotor: numeroMotor ? String(numeroMotor).trim() : null,
        detranEtiqueta: detranEtiqueta ? String(detranEtiqueta).trim() : null,
        tipoPecaAvulsa: tipoPecaAvulsa ? String(tipoPecaAvulsa).trim() : null,
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
      // Cria pasta no Drive automaticamente (fire-and-forget — não bloqueia a resposta)
      const nomePasta = String(descricaoPecaTitulo || record.descricao).trim().slice(0, 60);
      criarPastaPreCadastro(record.idPeca, nomePasta).catch(() => null);
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
cadastroRouter.post('/copiar-peca/:pecaId', requireCadastroAction('criar_pre_cadastro'), async (req, res, next) => {
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
    const detranOrigem = normalizeNullableText(origem.detranEtiqueta, { uppercase: true });

    // Quantidade de novas unidades a criar (1..20).
    const quantidade = Math.max(1, Math.min(20, Math.trunc(Number(req.body?.quantidade) || 1)));

    // Localizacao confirmada na tela (cai pra da origem se nao vier).
    const localizacaoConfirmada = req.body?.localizacao !== undefined
      ? normalizeNullableText(req.body.localizacao)
      : normalizeNullableText(origem.localizacao);

    // Etiquetas: uma por unidade quando a origem tem etiqueta. Aceita `etiquetas[]` ou `detranEtiqueta` (compat).
    const rawEtiquetas: any[] = Array.isArray(req.body?.etiquetas)
      ? req.body.etiquetas
      : (req.body?.detranEtiqueta != null ? [req.body.detranEtiqueta] : []);
    const etiquetas = rawEtiquetas.map((e) => String(normalizeNullableText(e, { uppercase: true }) || '').trim());

    if (detranOrigem) {
      const preenchidas = etiquetas.slice(0, quantidade).filter(Boolean);
      if (preenchidas.length < quantidade) {
        return res.status(400).json({ error: `Informe ${quantidade} etiqueta(s) Detran (uma por unidade) para este SKU.` });
      }
      if (new Set(preenchidas).size !== preenchidas.length) {
        return res.status(400).json({ error: 'As etiquetas Detran das novas unidades nao podem se repetir entre si.' });
      }
      if (preenchidas.some((e) => e === detranOrigem)) {
        return res.status(400).json({ error: 'A etiqueta Detran das novas unidades nao pode repetir a etiqueta da origem.' });
      }
      for (const et of preenchidas) {
        const dup = await prisma.peca.findFirst({
          where: {
            id: { not: origem.id },
            detranEtiqueta: { equals: et, mode: 'insensitive' },
            OR: [
              { idPeca: { equals: baseSku, mode: 'insensitive' } },
              { idPeca: { startsWith: `${baseSku}-` } },
            ],
          },
          select: { idPeca: true },
        });
        if (dup) return res.status(400).json({ error: `A etiqueta Detran ${et} ja esta em uso na variacao ${dup.idPeca}.` });
      }
    }

    const { blingProdutoId, produto } = await resolveBlingProductStateForBaseSku(baseSku);

    // Cria as N novas unidades, copiando os dados da origem (incl. FOTO de capa) e a localizacao confirmada.
    const ids = await listRelatedSkuIdsForBase(baseSku);
    const criadas: { id: number; idPeca: string }[] = [];
    for (let i = 0; i < quantidade; i += 1) {
      const novoId = getNextVariantSku(baseSku, ids);
      ids.push(novoId.toUpperCase());
      const nova = await prisma.peca.create({
        data: {
          motoId: origem.motoId,
          idPeca: novoId,
          descricao: origem.descricao,
          localizacao: localizacaoConfirmada,
          detranEtiqueta: detranOrigem ? (etiquetas[i] || null) : null,
          fotoCapaNome: origem.fotoCapaNome,
          fotoCapaArquivo: origem.fotoCapaArquivo,
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
        select: { id: true, idPeca: true },
      });
      criadas.push(nova);
    }

    const detranConcat = await buildDetranEtiquetaConcatForBaseSku(baseSku);
    const blingPayload = buildBlingProdutoPayloadFromCurrent(produto, {
      largura: origem.largura != null ? Number(origem.largura) : null,
      altura: origem.altura != null ? Number(origem.altura) : null,
      profundidade: origem.profundidade != null ? Number(origem.profundidade) : null,
      pesoLiquido: origem.pesoLiquido != null ? Number(origem.pesoLiquido) : null,
      localizacao: localizacaoConfirmada,
      numeroPeca: normalizeNullableText(origem.numeroPeca),
      detranEtiqueta: detranConcat,
      estoqueDelta: quantidade,
    });

    let produtoAtualizadoNoBling = false;
    let estoqueDisponivel = 0;

    try {
      await blingReq(`/produtos/${blingProdutoId}`, {
        method: 'PUT',
        body: JSON.stringify(blingPayload),
      });
      produtoAtualizadoNoBling = true;

      // Saldo do Bling = quantidade DISPONIVEL no ANB para o SKU base (fonte da verdade = ANB).
      estoqueDisponivel = await prisma.peca.count({
        where: {
          OR: [
            { idPeca: { equals: baseSku, mode: 'insensitive' } },
            { idPeca: { startsWith: `${baseSku}-` } },
          ],
          disponivel: true,
          emPrejuizo: false,
        },
      });
      await lancarEstoqueNoBling({
        blingProdutoId,
        quantidade: estoqueDisponivel,
        preco: Number(origem.precoML || 0),
        observacoes: `Adicionar estoque - ${baseSku} (+${quantidade})`,
      });
    } catch (blingError: any) {
      await prisma.peca.deleteMany({ where: { id: { in: criadas.map((c) => c.id) } } }).catch(() => null);

      if (produtoAtualizadoNoBling) {
        try {
          const restorePayload = buildBlingProdutoPayloadFromCurrent(produto);
          await blingReq(`/produtos/${blingProdutoId}`, {
            method: 'PUT',
            body: JSON.stringify(restorePayload),
          });
        } catch (restoreError: any) {
          console.error('[adicionar-estoque] Falha ao reverter produto no Bling:', restoreError?.message);
        }
      }

      const failure = buildCadastroBlingErrorResponse(blingError);
      return res.status(failure.status).json({
        ...failure.body,
        error: `Falha ao adicionar estoque e sincronizar com o Bling: ${failure.body.error}`,
      });
    }

    res.status(201).json({
      ok: true,
      quantidade,
      criados: criadas.map((c) => c.idPeca),
      novoIdPeca: criadas[0]?.idPeca,
      detranEtiquetaEnviada: detranConcat,
      estoqueDisponivel,
    });
  } catch (e) { next(e); }
});

// POST /cadastro/fotos/buscar
cadastroRouter.post('/fotos/buscar', async (req, res, next) => {
  try {
    const result = await buscarCadastroFotos(req.body || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Erro ao buscar fotos.' });
  }
});

// POST /cadastro/fotos/anb
cadastroRouter.post('/fotos/anb', async (req, res, next) => {
  try {
    const result = await buscarCadastroFotosAnb(req.body || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Erro ao buscar materiais ANB.' });
  }
});

// POST /cadastro/fotos/verificar-sku
cadastroRouter.post('/fotos/verificar-sku', async (req, res, next) => {
  try {
    const result = await verificarCadastroFotoSku(req.body || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Erro ao verificar fotos do SKU.' });
  }
});

// POST /cadastro/fotos/processar
cadastroRouter.post('/fotos/processar', requireCadastroAction('enviar_fotos'), async (req, res, next) => {
  try {
    const { linhas } = req.body || {};
    const result = await processarCadastroFotos(linhas || []);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /cadastro/fotos/drive
cadastroRouter.post('/fotos/drive', async (req, res, next) => {
  try {
    const result = await buscarCadastroFotosDrive(req.body || {});
    res.json(result);
  } catch (e) { next(e); }
});

// POST /cadastro/fotos/enviar-manual
cadastroRouter.post('/fotos/enviar-manual', requireCadastroAction('enviar_fotos'), async (req, res, next) => {
  try {
    const result = await enviarCadastroFotosManual(req.body || {});
    res.json(result);
  } catch (e) { next(e); }
});

// PUT /cadastro/:id
cadastroRouter.put('/:id', requireCadastroAction('editar_pre_cadastro'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const atual = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Não encontrado' });
    if (atual.status === 'cadastrado') return res.status(400).json({ error: 'Cadastro já finalizado — não é possível editar' });

    const { descricao, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, numeroMotor, detranEtiqueta, tipoPecaAvulsa, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;
    const estoqueEfetivo = estoque !== undefined ? Number(estoque) : Number(atual.estoque);
    const detranEtiquetaEfetiva = detranEtiqueta !== undefined ? detranEtiqueta : atual.detranEtiqueta;
    const descricaoEfetiva = descricao !== undefined ? descricao : atual.descricao;
    const detranValidationMessage = getDetranEtiquetasValidationMessage(detranEtiquetaEfetiva, estoqueEfetivo, descricaoEfetiva);
    if (detranValidationMessage) return res.status(400).json({ error: detranValidationMessage });
    const tipoPecaAvulsaEfetivo = tipoPecaAvulsa !== undefined ? tipoPecaAvulsa : atual.tipoPecaAvulsa;
    const numeroMotorEfetivo = numeroMotor !== undefined ? numeroMotor : (atual as any).numeroMotor;
    const numeroMotorMsg = getNumeroMotorValidationMessage(detranEtiquetaEfetiva, tipoPecaAvulsaEfetivo, numeroMotorEfetivo);
    if (numeroMotorMsg) return res.status(400).json({ error: numeroMotorMsg });
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
    if (numeroMotor !== undefined) data.numeroMotor = numeroMotor || null;
    if (detranEtiqueta !== undefined) data.detranEtiqueta = detranEtiqueta || null;
    if (tipoPecaAvulsa !== undefined) data.tipoPecaAvulsa = tipoPecaAvulsa || null;
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
cadastroRouter.post('/:id/finalizar', requireCadastroAction('criar_bling'), async (req, res, next) => {
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
      const lojaRows = await fetchProdutoLojaLinksByProductId(Number(cadastro.blingProdutoId));
      mercadoLivreItemId = resolveBlingMercadoLivreItemId(null, b, lojaRows);
      mercadoLivreLink   = (await resolveBlingMercadoLivreLinkWithFallback(null, b, lojaRows)).link;
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
    const fotoCapaArquivoRaw = req.body?.fotoCapa ? String(req.body.fotoCapa) : null;
    const fotoCapaNomeRaw = req.body?.fotoCapaNome ? String(req.body.fotoCapaNome).trim() : null;

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
      let fotoCapaArquivo: string | null = null;
      let fotoCapaNome: string | null = null;

      if (fotoCapaArquivoRaw) {
        const preparedImage = await compressDataUrlImage(fotoCapaArquivoRaw);
        fotoCapaArquivo = preparedImage.dataUrl;
        fotoCapaNome = normalizeImageFileName(fotoCapaNomeRaw, preparedImage.extension);
      }

      // Lança peças no estoque com sufixos
      const qtd = Number(b.estoque?.saldoVirtualTotal || cadastro.estoque || 1);
      const ids = gerarIdsPeca(cadastro.idPeca, qtd);
      const pecasCriadas = [];

      // Split etiquetas detran por variação: "SP001 / SP002 / SP003" → ['SP001', 'SP002', 'SP003']
      const etiquetasArray = cadastro.detranEtiqueta
        ? cadastro.detranEtiqueta.split('/').map((e: string) => e.trim()).filter(Boolean)
        : [];

      // "Par" no titulo => 2 etiquetas por unidade (2x estoque). Senao, 1 por unidade.
      const detranMultiplicador = detranMultiplicadorPorTitulo(cadastro.descricao);
      const etiquetasEsperadas = ids.length * detranMultiplicador;

      // Validação: se há etiquetas, deve bater com a quantidade esperada
      if (etiquetasArray.length > 0 && etiquetasArray.length !== etiquetasEsperadas) {
        const notaPar = detranMultiplicador > 1 ? ' — "Par": 2 etiquetas por unidade' : '';
        return res.status(400).json({
          ok: false,
          error: `Quantidade de etiquetas Detran (${etiquetasArray.length}) não bate com o esperado (${etiquetasEsperadas}${notaPar}). Corrija no pré-cadastro antes de finalizar.`,
        });
      }

      for (let i = 0; i < ids.length; i++) {
        const idPeca = ids[i];
        const existing = await prisma.peca.findUnique({ where: { idPeca } });
        if (existing) continue;
        const peca = await (prisma as any).peca.create({
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
            numeroMotor: (cadastro as any).numeroMotor || null,
            tipoPecaAvulsa: cadastro.tipoPecaAvulsa || null,
            // Cada unidade recebe suas etiquetas: 1 normalmente, ou 2 juntas (" / ") se for "Par".
            detranEtiqueta: etiquetasArray.length > 0
              ? (etiquetasArray.slice(i * detranMultiplicador, i * detranMultiplicador + detranMultiplicador).join(' / ') || null)
              : null,
            cadastro: new Date(),
          },
        });
        if (fotoCapaArquivo) {
          await prisma.peca.update({
            where: { id: peca.id },
            data: {
              fotoCapaNome: fotoCapaNome || null,
              fotoCapaArquivo: fotoCapaArquivo,
            },
          });
        }
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
    const BLING_READONLY = ['id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'imagens', 'depositos', 'variacoes', 'estrutura', 'categorias', 'anexos'];
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

// ── POST /cadastro/sync-preco-plataformas ─────────────────────────────────────
// Sincroniza precoML com Bling, Mercado Livre e Nuvemshop.
// Body: { sku, precoML }
// Retorna: { ok, resultados: { bling, ml, nuvemshop } } — resultado individual por plataforma.
cadastroRouter.post('/sync-preco-plataformas', async (req, res, next) => {
  try {
    const sku     = String(req.body?.sku || '').trim().toUpperCase();
    const precoML = Number(req.body?.precoML);

    if (!sku)                                         return res.status(400).json({ ok: false, error: 'sku obrigatorio' });
    if (!Number.isFinite(precoML) || precoML < 0)    return res.status(400).json({ ok: false, error: 'precoML invalido' });

    const baseSku = getBaseSku(sku);
    const BLING_READONLY = ['id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'imagens', 'depositos', 'variacoes', 'estrutura', 'categorias', 'anexos'];

    type PlataformaResultado = { ok: boolean; error?: string };
    const resultados: Record<string, PlataformaResultado> = {};

    // ── 1. Bling ──────────────────────────────────────────────────────────────
    try {
      // Resolve blingProdutoId via CadastroPeca ou busca no Bling
      let blingProdutoId: string | null = null;
      const cadastro = await prisma.cadastroPeca.findFirst({
        where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
        select: { blingProdutoId: true },
      });
      if (cadastro?.blingProdutoId) {
        blingProdutoId = cadastro.blingProdutoId;
      } else {
        const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
        const found = (blingSearch?.data || []).find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
        if (found) blingProdutoId = String(found.id);
      }

      if (!blingProdutoId) {
        resultados.bling = { ok: false, error: 'Produto nao encontrado no Bling' };
      } else {
        const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
        const b = blingAtual?.data;
        if (!b) throw new Error('Produto nao carregado do Bling');
        const payload: any = { ...b };
        for (const f of BLING_READONLY) delete payload[f];
        payload.preco        = precoML;
        payload.unidade      = 'UN';
        payload.tipoProducao = 'T';
        payload.tributacao   = { ...(b.tributacao || {}), ncm: '87141000', cest: '01.076.00' };
        await blingReq(`/produtos/${blingProdutoId}`, { method: 'PUT', body: JSON.stringify(payload) });
        resultados.bling = { ok: true };
      }
    } catch (e: any) {
      resultados.bling = { ok: false, error: e?.message || 'Erro desconhecido' };
    }

    // ── 2. Mercado Livre ──────────────────────────────────────────────────────
    try {
      const pecaComML = await prisma.peca.findFirst({
        where: {
          OR: [
            { idPeca: { equals: baseSku, mode: 'insensitive' } },
            { idPeca: { startsWith: `${baseSku}-`, mode: 'insensitive' } },
          ],
          mercadoLivreItemId: { not: null },
        },
        select: { mercadoLivreItemId: true },
      });
      const mlItemId = pecaComML?.mercadoLivreItemId;
      if (!mlItemId) {
        resultados.ml = { ok: false, error: 'Anuncio ML nao encontrado para este SKU' };
      } else {
        await mercadoLivreReq(`/items/${encodeURIComponent(mlItemId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: precoML }),
        });
        resultados.ml = { ok: true };
      }
    } catch (e: any) {
      resultados.ml = { ok: false, error: e?.message || 'Erro desconhecido' };
    }

    // ── 3. Nuvemshop ──────────────────────────────────────────────────────────
    try {
      const produto = await buscarProdutoNuvemshopPorSku(baseSku, true);
      if (!produto) {
        resultados.nuvemshop = { ok: false, error: 'Produto nao encontrado no Nuvemshop' };
      } else {
        const variants: any[] = produto.variants || [];
        const variant = variants.find((v: any) =>
          String(v.sku || '').trim().toUpperCase() === baseSku
        );
        if (!variant) {
          resultados.nuvemshop = { ok: false, error: 'Variante com SKU nao encontrada no Nuvemshop' };
        } else {
          await nuvemReq(`/products/${produto.id}/variants/${variant.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: precoML.toFixed(2) }),
          });
          resultados.nuvemshop = { ok: true };
        }
      }
    } catch (e: any) {
      resultados.nuvemshop = { ok: false, error: e?.message || 'Erro desconhecido' };
    }

    const todosOk = Object.values(resultados).every(r => r.ok);
    console.log(`[sync-preco-plataformas] SKU ${baseSku} preço R$${precoML}:`, JSON.stringify(resultados));
    res.json({ ok: todosOk, resultados });
  } catch (e) { next(e); }
});

// DELETE /cadastro/:id
cadastroRouter.delete('/:id', requireCadastroAction('editar_pre_cadastro'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cadastro = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!cadastro) return res.status(404).json({ error: 'Não encontrado' });

    const forceDelete = req.query.force === 'true';
    if (forceDelete && !isBrunoAuthUser(req)) {
      return res.status(403).json({ error: 'Apenas o usuario Bruno pode eliminar linhas finalizadas do cadastro.' });
    }
    const confirmarFotos = req.query.confirmarFotos === 'true';
    const baseSku = getBaseSku(cadastro.idPeca);

    // 1) Pasta no Drive: se tiver fotos e o usuario ainda nao confirmou, pede confirmacao (nao apaga nada).
    let driveInfo: { pastaId: string | null; nome: string; fotos: number } = { pastaId: null, nome: '', fotos: 0 };
    try {
      driveInfo = await getPastaPreCadastroDoSku(baseSku);
    } catch (e: any) {
      console.error('[cadastro delete] erro ao consultar a pasta no Drive:', e?.message);
    }
    if (driveInfo.fotos > 0 && !confirmarFotos) {
      return res.status(409).json({
        ok: false,
        requiresConfirmation: true,
        fotos: driveInfo.fotos,
        message: `O SKU ${baseSku} tem ${driveInfo.fotos} foto(s) na pasta do Drive. Ao continuar, a pasta sera apagada (junto com o produto no Bling, se inativo, e o registro). Deseja continuar?`,
      });
    }

    // 2) Bling: apaga o produto somente se estiver INATIVO. O Bling exige marcar como
    //    EXCLUIDO (situacao 'E') ANTES de remover definitivamente (igual ao botao da lixeira).
    let blingDeletado = false;
    let blingMotivo = 'sem produto no Bling';
    if (cadastro.blingProdutoId) {
      let produtoAtual: any = null;
      try {
        const blingCheck = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
        produtoAtual = blingCheck?.data || null;
      } catch (e: any) {
        // GET falhou: produto provavelmente ja nao existe -> segue com Drive/local.
        console.log('[cadastro delete] Bling GET:', e?.message?.slice(0, 160));
      }
      const situacao = String(produtoAtual?.situacao || '').trim().toUpperCase();
      const existe = !!(produtoAtual?.id && String(produtoAtual.id) === String(cadastro.blingProdutoId));

      if (!existe) {
        blingMotivo = 'produto ja nao existe no Bling';
      } else if (situacao === 'I' || situacao === 'E') {
        try {
          // 1) Marca como excluido (situacao 'E'), se ainda nao estiver.
          if (situacao !== 'E') {
            try {
              await blingReq(`/produtos/${cadastro.blingProdutoId}/situacoes`, {
                method: 'PATCH',
                body: JSON.stringify({ situacao: 'E' }),
              });
            } catch {
              // Fallback: PUT completo com situacao 'E'.
              const payloadExcluir = buildBlingProdutoPayloadFromCurrent(produtoAtual);
              payloadExcluir.situacao = 'E';
              await blingReq(`/produtos/${cadastro.blingProdutoId}`, { method: 'PUT', body: JSON.stringify(payloadExcluir) });
            }
          }
          // 2) Remove definitivamente (agora permitido pelo Bling).
          await blingReq(`/produtos/${cadastro.blingProdutoId}`, { method: 'DELETE' });
          blingDeletado = true;
          blingMotivo = 'produto excluido e removido do Bling';
        } catch (e: any) {
          // Erro real: aborta TUDO (nao apaga Drive/local) e mostra o motivo do Bling.
          return res.status(400).json({
            ok: false,
            error: `Nao foi possivel apagar o produto no Bling: ${e?.message || 'erro desconhecido'}`,
          });
        }
      } else {
        blingMotivo = 'produto ativo no Bling — nao foi apagado la';
      }
    }

    // 3) Apaga a pasta no Drive (definitivo).
    let driveApagada = false;
    if (driveInfo.pastaId) {
      try {
        driveApagada = await apagarPastaDrive(driveInfo.pastaId);
      } catch (e: any) {
        console.error('[cadastro delete] erro ao apagar a pasta no Drive:', e?.message);
      }
    }

    // 4) Apaga o registro local.
    await prisma.cadastroPeca.delete({ where: { id } });

    res.json({ ok: true, blingDeletado, blingMotivo, driveApagada, fotos: driveInfo.fotos });
  } catch (e) { next(e); }
});

// GET /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.get('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUnique({
      where: { id: Number(req.params.motoId) },
      select: { id: true, descricaoModelo: true, etiquetaSkuLabel: true, sufixoTitulo: true },
    });
    res.json({ descricaoModelo: moto?.descricaoModelo || '', etiquetaSkuLabel: moto?.etiquetaSkuLabel || '', sufixoTitulo: moto?.sufixoTitulo || '' });
  } catch (e) { next(e); }
});

// PUT /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.put('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const { descricaoModelo, etiquetaSkuLabel, sufixoTitulo } = req.body;
    await prisma.moto.update({
      where: { id: Number(req.params.motoId) },
      data: {
        descricaoModelo:  descricaoModelo  ? String(descricaoModelo).trim()                     : null,
        etiquetaSkuLabel: etiquetaSkuLabel ? String(etiquetaSkuLabel).trim().toUpperCase()      : null,
        sufixoTitulo:     sufixoTitulo     ? String(sufixoTitulo).trim()                        : null,
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /cadastro/atualizar-bling-lote
// Atualiza o Bling com todos os dados do ANB para uma lista de SKUs
// Body: { skus: string[] }
cadastroRouter.post('/atualizar-bling-lote', async (req, res, next) => {
  try {
    const { skus } = req.body || {};
    if (!Array.isArray(skus) || !skus.length) {
      return res.status(400).json({ error: 'skus obrigatorio' });
    }

    const resultados: any[] = [];

    for (const skuRaw of skus) {
      const baseSku = getBaseSku(skuRaw);
      if (!baseSku) continue;

      try {
        // 1. Busca todas as variações do SKU base no ANB
        const pecas = await prisma.peca.findMany({
          where: {
            OR: [
              { idPeca: { equals: baseSku, mode: 'insensitive' } },
              { idPeca: { startsWith: `${baseSku}-` } },
            ],
          },
          select: {
            idPeca: true,
            descricao: true,
            precoML: true,
            valorFrete: true,
            valorTaxas: true,
            pesoLiquido: true,
            pesoBruto: true,
            largura: true,
            altura: true,
            profundidade: true,
           localizacao: true,
           detranEtiqueta: true,
           numeroPeca: true,
          },
        });

        if (!pecas.length) {
          resultados.push({ sku: baseSku, ok: false, error: 'SKU não encontrado no ANB' });
          continue;
        }

        // Usa a primeira variação como referência para campos compartilhados
        const peca = pecas[0];

        // Concatena etiquetas detran de todas as variações
        const detranConcat = pecas
          .map(p => (p.detranEtiqueta || '').trim())
          .filter(Boolean)
          .join(' / ') || null;

        // Numeropeca da primeira variação com valor
        const numeroPecaVal = pecas.find(p => p.numeroPeca)?.numeroPeca || null;

        // 2. Busca blingProdutoId
        let blingProdutoId: string | null = null;
        const cadastro = await prisma.cadastroPeca.findFirst({
          where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
          select: { blingProdutoId: true },
        });
        if (cadastro?.blingProdutoId) blingProdutoId = cadastro.blingProdutoId;
        if (!blingProdutoId) {
          // Tenta buscar direto no Bling
          try {
            const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
            const found = (blingSearch?.data || []).find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
            if (found) blingProdutoId = String(found.id);
          } catch {}
        }

        if (!blingProdutoId) {
          resultados.push({ sku: baseSku, ok: false, error: 'Produto não encontrado no Bling' });
          continue;
        }

        // 3. GET produto completo do Bling para não perder nada
        const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
        const b = blingAtual?.data;
        if (!b) {
          resultados.push({ sku: baseSku, ok: false, error: 'Produto não retornado pelo Bling' });
          continue;
        }

        // 4. Monta payload com todos os dados do ANB
        const BLING_READONLY = ['id', 'dataCriacao', 'dataAlteracao', 'imagemURL', 'imagens', 'depositos', 'variacoes', 'estrutura', 'categorias', 'anexos'];
        const payload: any = { ...b };
        for (const f of BLING_READONLY) delete payload[f];

        // Campos sempre fixos
        payload.unidade = 'UN';
        payload.tipoProducao = 'T';
        payload.condicao = BLING_CONDICAO_USADO;
        payload.tributacao = { ...(b.tributacao || {}), ncm: '87141000', cest: '01.076.00' };

        // Campos do ANB — só sobrepõe se tiver valor
        payload.nome = peca.descricao || b.nome;
        payload.preco = Number(peca.precoML || b.preco || 0);
        payload.pesoLiquido = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : Number(b.pesoLiquido || 0);
        payload.pesoBruto = peca.pesoBruto != null ? Number(peca.pesoBruto) : Number(b.pesoBruto || 0);
        payload.dimensoes = {
          largura: peca.largura != null ? Number(peca.largura) : Number(b.dimensoes?.largura || 0),
          altura: peca.altura != null ? Number(peca.altura) : Number(b.dimensoes?.altura || 0),
          profundidade: peca.profundidade != null ? Number(peca.profundidade) : Number(b.dimensoes?.profundidade || 0),
          unidadeMedida: b.dimensoes?.unidadeMedida || 2,
        };
        payload.estoque = {
          ...(b.estoque || {}),
          localizacao: peca.localizacao || b.estoque?.localizacao || '',
        };

        // Campos customizados — merge preservando existentes
        const ccExistentes: any[] = Array.isArray(b.camposCustomizados) ? b.camposCustomizados : [];
        const ccMap = new Map(ccExistentes.map((c: any) => [Number(c.idCampoCustomizado), c.valor]));
        if (detranConcat !== null) ccMap.set(5979929, detranConcat);
        if (numeroPecaVal !== null) ccMap.set(2821431, numeroPecaVal);
        payload.camposCustomizados = Array.from(ccMap.entries()).map(([id, valor]) => ({ idCampoCustomizado: id, valor }));

        // 5. PUT no Bling
        await blingReq(`/produtos/${blingProdutoId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        resultados.push({ sku: baseSku, ok: true, blingProdutoId });
      } catch (e: any) {
        resultados.push({ sku: baseSku, ok: false, error: e?.message });
      }

      // Pausa entre SKUs para não exceder rate limit do Bling
      await new Promise(r => setTimeout(r, 300));
    }

    const ok = resultados.filter(r => r.ok).length;
    const erros = resultados.filter(r => !r.ok).length;
    res.json({ ok: true, total: resultados.length, atualizados: ok, erros, resultados });
  } catch (e) { next(e); }
});

// POST /cadastro/verificar-fotos-drive
// Verifica fotos no Drive para todos os pré-cadastros com campos completos e atualiza fotoCadastroVerificada
cadastroRouter.post('/verificar-fotos-drive', async (req, res, next) => {
  try {
    const preCadastros = await prisma.cadastroPeca.findMany({
      where: { status: { not: 'cadastrado' }, ...CAMPOS_COMPLETOS_WHERE },
      select: { id: true, motoId: true, idPeca: true, fotoCadastroVerificada: true },
    });

    const resultados: { sku: string; temFoto: boolean; qtdFotos: number }[] = [];

    for (const pc of preCadastros) {
      try {
        const qtd = await verificarFotosCadastroPeca(pc.motoId, pc.idPeca);
        const temFoto = qtd >= 2;
        if (temFoto !== pc.fotoCadastroVerificada) {
          await prisma.cadastroPeca.update({ where: { id: pc.id }, data: { fotoCadastroVerificada: temFoto } });
        }
        resultados.push({ sku: pc.idPeca, temFoto, qtdFotos: qtd });
      } catch {
        resultados.push({ sku: pc.idPeca, temFoto: false, qtdFotos: 0 });
      }
      await new Promise(r => setTimeout(r, 200)); // evitar throttle Drive API
    }

    res.json({ ok: true, total: preCadastros.length, resultados });
  } catch (e) { next(e); }
});

// ── Cron: verificação de fotos de pré-cadastros toda madrugada às 01:00 (Sao Paulo) ──
const CADASTRO_DRIVE_SCHEDULER_INTERVAL_MS = 60 * 1000;
let cadastroDriveSchedulerRunning = false;
let cadastroDriveSchedulerLastKey = '';

function msUntilNextMinuteCadastro() {
  const now = new Date();
  return ((60 - now.getSeconds()) * 1000) - now.getMilliseconds() + 250;
}

function getCurrentSaoPauloTimeKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

async function tickCadastroDriveScheduler() {
  if (cadastroDriveSchedulerRunning) return;
  const timeKey = getCurrentSaoPauloTimeKey();
  if (!timeKey.endsWith('01:00')) return;
  if (cadastroDriveSchedulerLastKey === timeKey) return;
  cadastroDriveSchedulerLastKey = timeKey;
  cadastroDriveSchedulerRunning = true;
  try {
    const preCadastros = await prisma.cadastroPeca.findMany({
      where: { status: { not: 'cadastrado' }, ...CAMPOS_COMPLETOS_WHERE },
      select: { id: true, motoId: true, idPeca: true, fotoCadastroVerificada: true },
    });
    for (const pc of preCadastros) {
      try {
        const qtd = await verificarFotosCadastroPeca(pc.motoId, pc.idPeca);
        const temFoto = qtd >= 2;
        if (temFoto !== pc.fotoCadastroVerificada) {
          await prisma.cadastroPeca.update({ where: { id: pc.id }, data: { fotoCadastroVerificada: temFoto } });
        }
      } catch { /* ignora erros individuais */ }
      await new Promise(r => setTimeout(r, 300));
    }
  } finally {
    cadastroDriveSchedulerRunning = false;
  }
}

// GET /cadastro/config — configurações globais do módulo de cadastro
cadastroRouter.get('/config', async (_req, res, next) => {
  try {
    let cfg = await prisma.configuracaoGeral.findFirst();
    if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });
    res.json({ cadastroMotoIdDefault: (cfg as any).cadastroMotoIdDefault ?? null });
  } catch (e) { next(e); }
});

// POST /cadastro/config — salva configurações globais do módulo de cadastro
cadastroRouter.post('/config', async (req, res, next) => {
  try {
    const { cadastroMotoIdDefault } = req.body || {};
    const data: any = {};
    if (cadastroMotoIdDefault !== undefined) {
      data.cadastroMotoIdDefault = cadastroMotoIdDefault === null || cadastroMotoIdDefault === ''
        ? null
        : Number(cadastroMotoIdDefault);
    }
    await prisma.configuracaoGeral.updateMany({ data });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

setTimeout(() => {
  tickCadastroDriveScheduler().catch(() => {});
  setInterval(() => tickCadastroDriveScheduler().catch(() => {}), CADASTRO_DRIVE_SCHEDULER_INTERVAL_MS);
}, msUntilNextMinuteCadastro());
