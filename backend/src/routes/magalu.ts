import { Router } from 'express';
import {
  getMagaluConfig,
  saveMagaluConfig,
  magaluExchangeCodeForToken,
  magaluReq,
  magaluCreateSku,
  magaluSetPrice,
  magaluSetStock,
  magaluUpdateSkuImages,
  magaluGetSku,
  magaluAguardarSku,
  magaluTracesPorCodigo,
  magaluValidacaoSku,
  magaluMontarDatasheet,
  magaluAtualizarConteudoSku,
} from '../lib/magalu-api';
import { baixarFotoDrivePorId, buscarFotosDriveSku } from '../lib/fotos-cadastro';
import { informarAnuncioMagaluNoBling, findBlingProductsByCodes, fetchBlingProductDetailById } from './bling';
import { prisma } from '../lib/prisma';

export const magaluRouter = Router();

function getBaseSku(value: any) {
  return String(value || '').trim().toUpperCase().replace(/-\d+$/, '');
}

// GET /magalu/imagem/:id — proxy PUBLICO (ver middlewares/auth.ts, PUBLIC_PATH_PREFIXES) que serve
// uma foto do Drive crua. Existe porque a API do Magalu (ao contrario da Shopee) nao tem upload de
// imagem — o SKU so aceita `images[].reference` como URL publica, que o servidor deles busca por
// fora. Essa rota vira exatamente essa URL publica (ela mesma baixa do Drive autenticado e repassa).
magaluRouter.get('/imagem/:id', async (req, res) => {
  try {
    const { buffer, mimeType } = await baixarFotoDrivePorId(String(req.params.id || ''));
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e: any) {
    res.status(404).send('Imagem nao encontrada');
  }
});

// GET /magalu/debug-raw?path=PATH&host=https://services.magalu.com — proxy direto pra API do
// Magalu (debug), mesmo padrao do /shopee/debug-raw — assina a chamada com o access_token salvo e
// devolve a resposta crua. `host` e opcional, pra testar um host diferente do padrao do ambiente
// (ex: categorias pode estar em services.magalu.com em vez de api.magalu.com).
magaluRouter.get('/debug-raw', async (req, res, next) => {
  try {
    const path = String(req.query.path || '');
    if (!path) return res.status(400).json({ error: 'path obrigatorio' });
    const hostOverride = String(req.query.host || '') || undefined;
    const data = await magaluReq(path, { hostOverride });
    res.json(data);
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// GET /magalu/categorias/sincronizar?root=<uuid> — puxa a sub-arvore inteira de uma categoria raiz
// (default: "Veiculos e Pecas") via /categories/hierarchy?category_id=..., paginando de 100 em 100,
// e regrava a tabela espelho MagaluCategoria. Marca "folha" (sem filhos). So essa raiz e' gravada
// por vez; chamar de novo com outro root= acrescenta/atualiza (nao apaga as outras raizes).
const MAGALU_RAIZ_VEICULOS_E_PECAS = 'e038eb01-ec02-4ab5-a057-bf94644ec958';
magaluRouter.get('/categorias/sincronizar', async (req, res) => {
  try {
    const root = String(req.query.root || MAGALU_RAIZ_VEICULOS_E_PECAS).trim();
    const todas: any[] = [];
    for (let offset = 0, pagina = 0; pagina < 100; pagina += 1, offset += 100) {
      const data = await magaluReq(`/seller/v1/portfolios/categories/hierarchy?category_id=${encodeURIComponent(root)}&_limit=100&_offset=${offset}`);
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      todas.push(...results);
      if (results.length < 100) break;
    }
    if (!todas.length) return res.status(404).json({ error: 'Nenhuma categoria retornada pra essa raiz.' });

    const paisComFilhos = new Set(todas.map((c) => c.parent_id).filter(Boolean));
    const unicas = new Map<string, any>();
    for (const c of todas) unicas.set(String(c.id), c);
    const dados = Array.from(unicas.values()).map((c) => ({
      id: String(c.id),
      nome: String(c.name || ''),
      parentId: c.parent_id ? String(c.parent_id) : null,
      path: String(c.path || c.name || ''),
      folha: !paisComFilhos.has(c.id),
    }));

    await prisma.$transaction([
      prisma.magaluCategoria.deleteMany({ where: { id: { in: dados.map((d) => d.id) } } }),
      prisma.magaluCategoria.createMany({ data: dados }),
    ]);

    res.json({ ok: true, root, total: dados.length, folhas: dados.filter((d) => d.folha).length });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao sincronizar categorias Magalu' });
  }
});

// GET /magalu/categorias?folhas=1 — lista o espelho (so folhas por padrao), pro seletor da aba Anuncio.
magaluRouter.get('/categorias', async (req, res, next) => {
  try {
    const somenteFolhas = String(req.query.folhas ?? '1') !== '0';
    const tipo = String(req.query.tipo || '');
    const q = String(req.query.q || '').trim();
    const categorias = await prisma.magaluCategoria.findMany({
      where: {
        ...(tipo === 'pais' ? { folha: false } : (somenteFolhas ? { folha: true } : {})),
        ...(q ? { path: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { path: 'asc' },
    });
    if (String(req.query.formato || '') === 'txt') {
      const prefixo = 'Veículos e Peças/';
      res.type('text/plain').send(categorias.map((c: any) => (String(c.path).startsWith(prefixo) ? String(c.path).slice(prefixo.length) : c.path)).join('\n'));
      return;
    }
    const prefixoCaminho = 'Veículos e Peças/';
    res.json({
      ok: true,
      categorias: categorias.map((c: any) => {
        const caminho = String(c.path).startsWith(prefixoCaminho) ? String(c.path).slice(prefixoCaminho.length) : String(c.path);
        return { id: c.id, nome: c.nome, path: c.path, folha: c.folha, caminho, nivel4: c.nome, permitido: true, generica: caminho.endsWith('Kit de Peças para Motocicletas') };
      }),
    });
  } catch (e) { next(e); }
});

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getBackendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
}

// A redirect_uri precisa ser EXATAMENTE a mesma usada na criacao do client via CLI IDM
// (--redirect-uris) e na troca do code por token — por isso fica centralizada aqui.
function getRedirectUri() {
  return `${getBackendBase()}/magalu/callback`;
}

// Escopos que vamos usar (Produtos: SKU/Preco/Estoque/Categorias/Autopecas + Pedidos) — confirmados
// nas tabelas "Escopos necessarios" de /docs/apis/products/overview, /docs/apis/orders/overview e
// /docs/apis/categories/overview. O client criado via CLI IDM precisa ter esses mesmos escopos
// liberados (--scopes/--scopes-default). Nao incluimos open:portfolio-scores-seller:read (so serve
// pra consultar a metrica de "relevancia de conteudo" do anuncio — nao e usado em nada do nosso
// fluxo de criacao/preco/estoque/categoria, e e' o unico que fica pendente de aprovacao manual).
const MAGALU_SCOPES_LIST = [
  'open:portfolio-skus-seller:read',
  'open:portfolio-skus-seller:write',
  'open:portfolio-prices-seller:read',
  'open:portfolio-prices-seller:write',
  'open:portfolio-stocks-seller:read',
  'open:portfolio-stocks-seller:write',
  'open:portfolio-vehicles-seller:read',
  'open:portfolio-vehicles-compatibility-seller:write',
  'open:order-order-seller:read',
  'open:order-delivery-seller:read',
  'open:order-delivery-seller:write',
  'open:order-invoice-seller:read',
  'open:portfolio-categories-seller:read',
  'open:portfolio-categories-channel:read',
  'open:trace:read',
];
const MAGALU_SCOPES = MAGALU_SCOPES_LIST.join(' ');

// GET /magalu/auth-url — monta a URL manual de consentimento (doc: "Geracao Manual de URL de
// Consentimento"), pra tela de Configuracao so precisar redirecionar o navegador.
magaluRouter.get('/auth-url', async (_req, res, next) => {
  try {
    const config = await getMagaluConfig();
    if (!config.clientId) return res.status(400).json({ error: 'Client ID do Magalu nao configurado.' });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: getRedirectUri(),
      scope: MAGALU_SCOPES,
      response_type: 'code',
      choose_tenants: 'true',
    });
    res.json({ ok: true, url: `https://id.magalu.com/login?${params.toString()}` });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// GET /magalu/status — usado pela tela de Configuracao pra mostrar se o client esta conectado.
magaluRouter.get('/status', async (_req, res, next) => {
  try {
    const config = await getMagaluConfig();
    res.json({
      ok: true,
      environment: config.environment,
      clientId: config.clientId || null,
      connected: !!config.accessToken,
      connectedAt: config.connectedAt,
      redirectUri: getRedirectUri(),
      scopes: MAGALU_SCOPES,
    });
  } catch (e) { next(e); }
});

// POST /magalu/config — salva client_id/client_secret (gerados via CLI IDM, ver Conf. Magalu) e o
// ambiente (sandbox|live).
magaluRouter.post('/config', async (req, res, next) => {
  try {
    const data: Record<string, any> = {};
    if (req.body?.environment !== undefined) data.environment = req.body.environment === 'live' ? 'live' : 'sandbox';
    if (req.body?.clientId !== undefined) data.clientId = req.body.clientId;
    if (req.body?.clientSecret !== undefined) data.clientSecret = req.body.clientSecret;
    const config = await saveMagaluConfig(data);
    res.json({ ok: true, environment: config.environment, clientId: config.clientId });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// POST /magalu/desconectar — limpa os tokens salvos (precisa autorizar de novo depois).
magaluRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await saveMagaluConfig({ accessToken: '', refreshToken: '', expiresAt: null, connectedAt: null });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// GET /magalu/callback — o ID Magalu redireciona pra ca depois que o seller autoriza (via botao
// "Autorizar com o ID Magalu" ou URL de consentimento manual). Recebe ?code=...&state=..., troca
// pelo primeiro par access_token/refresh_token e salva.
magaluRouter.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    if (!code) {
      return res.redirect(`${getFrontendBase()}/config-magalu?erro=${encodeURIComponent('code ausente no retorno do Magalu')}`);
    }

    const payload = await magaluExchangeCodeForToken(code, getRedirectUri());

    const expiresAt = new Date(Date.now() + Number(payload.expires_in || 0) * 1000);
    await saveMagaluConfig({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt,
      connectedAt: new Date(),
    });

    res.redirect(`${getFrontendBase()}/config-magalu?conectado=1`);
  } catch (e: any) {
    res.redirect(`${getFrontendBase()}/config-magalu?erro=${encodeURIComponent(e?.message || 'Erro ao conectar Magalu')}`);
  }
});

// POST /magalu/anuncio/buscar — body: { skus: string[] }. Mesmo formato do /shopee/anuncio/buscar,
// pra alimentar a mesma fila multi-marketplace da aba Anuncio. `categoriaAtual` sempre null e
// `categoriaPendente: true` por enquanto — o mapeamento de categorias do Magalu ainda nao foi feito
// (depende do endpoint de Categorias ficar provisionado na conta, ver reference_magalu_api).
magaluRouter.post('/anuncio/buscar', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => getBaseSku(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    const categoriasMagalu = await prisma.magaluCategoria.findMany({ select: { id: true, nome: true, path: true } });
    const categoriaPorId = new Map<string, { id: string; nome: string; path: string }>(categoriasMagalu.map((c: any) => [String(c.id), c] as [string, { id: string; nome: string; path: string }]));
    const prefixo = 'Veículos e Peças/';

    const linhas = [];
    for (const sku of skus) {
      const peca = await prisma.peca.findFirst({
        where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
        include: { moto: { select: { marca: true, modelo: true, ano: true } } },
        orderBy: { idPeca: 'asc' },
      });
      if (!peca) {
        linhas.push({ sku, encontrado: false, erro: 'SKU nao encontrado no ANB (ou nao disponivel).' });
        continue;
      }
      const cat = (peca as any).magaluCategoriaId ? categoriaPorId.get((peca as any).magaluCategoriaId) : null;
      const caminhoCat = cat ? (String(cat.path).startsWith(prefixo) ? String(cat.path).slice(prefixo.length) : String(cat.path)) : null;
      const qtdDisponivel = await prisma.peca.count({
        where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }], disponivel: true },
      });
      linhas.push({
        sku,
        encontrado: true,
        descricao: peca.descricao,
        moto: peca.moto,
        preco: Number(peca.precoML || 0),
        peso: peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : null),
        largura: peca.largura != null ? Number(peca.largura) : null,
        altura: peca.altura != null ? Number(peca.altura) : null,
        profundidade: peca.profundidade != null ? Number(peca.profundidade) : null,
        estoque: qtdDisponivel,
        magaluItemId: (peca as any).magaluItemId || null,
        jaTemAnuncio: !!(peca as any).magaluItemId,
        categoriaAtual: cat ? {
          id: cat.id,
          nivel4: cat.nome,
          caminho: caminhoCat,
          permitido: true,
          generica: String(caminhoCat).endsWith('Kit de Peças para Motocicletas'),
        } : null,
        categoriaPendente: !cat,
      });
    }

    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

// Converte o HTML da descricao do Bling em texto puro mantendo quebras de linha (mesma ideia do
// htmlParaTextoComQuebras da Shopee).
function htmlParaTextoSimples(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Origem do Bling (codigo da NF-e, tributacao.origem) -> origin do Magalu (national|imported).
// 0,3,4,5,8 = nacional (inclui conteudo importado); 1,2,6,7 = estrangeira.
function origemBlingParaMagalu(origem: any): 'national' | 'imported' | null {
  const n = Number(origem);
  if (!Number.isFinite(n)) return null;
  return [0, 3, 4, 5, 8].includes(n) ? 'national' : [1, 2, 6, 7].includes(n) ? 'imported' : null;
}

// Monta o conteudo que o Magalu exige pra liberar a publicacao: descricao (50 a 7000 chars), ficha
// tecnica da categoria, NCM e origem. Descricao/NCM/origem vem do Bling (se estiver conectado);
// sem Bling, usa texto proprio montado a partir dos dados da peca.
async function montarConteudoMagalu(peca: any, sku: string, categoriaId: string, peso: number) {
  let descricaoBling = '';
  let ncm: string | null = null;
  let origin: 'national' | 'imported' | null = null;
  try {
    const produtos = await findBlingProductsByCodes([sku], { forceRefresh: true });
    const produtoBling = produtos.get(sku);
    if (produtoBling?.id) {
      const detail: any = await fetchBlingProductDetailById(Number(produtoBling.id), { forceRefresh: true });
      descricaoBling = htmlParaTextoSimples(detail?.descricaoCurta || produtoBling?.descricaoCurta || '');
      const ncmBruto = String(detail?.tributacao?.ncm || '').replace(/\D/g, '');
      if (/^\d{8}$/.test(ncmBruto)) ncm = ncmBruto;
      origin = origemBlingParaMagalu(detail?.tributacao?.origem);
    }
  } catch {
    // Bling fora do ar/desconectado nao pode travar a criacao: segue sem NCM/origem do Bling.
  }

  const moto = peca.moto || {};
  const motoTexto = [moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ');
  let description = descricaoBling || String(peca.descricao || '');
  if (description.length < 200) {
    const extra = [
      motoTexto ? `Moto/Modelo: ${motoTexto}` : '',
      peca.numeroPeca ? `Código da peça (PN): ${peca.numeroPeca}` : '',
      'Peça original usada, em bom estado de conservação. Consulte as fotos antes de comprar.',
    ].filter(Boolean).join('\n');
    description = `${description}\n\n${extra}`.trim();
  }

  const largura = Number(peca.largura);
  const altura = Number(peca.altura);
  const profundidade = Number(peca.profundidade);
  const pesoTxt = `${String(peso).replace('.', ',')}kg`;
  const datasheet = await magaluMontarDatasheet(categoriaId, {
    'marca': moto.marca || null,
    'modelo': peca.numeroPeca || moto.modelo || null,
    'peso do produto': pesoTxt,
    'peso do produto com embalagem': pesoTxt,
    'largura do produto': `${largura}cm`,
    'altura do produto': `${altura}cm`,
    'profundidade do produto': `${profundidade}cm`,
    'dimensoes do produto com embalagem': `${largura}x${altura}x${profundidade}cm`,
    'conteudo da embalagem': `1 ${String(peca.descricao || '').slice(0, 100)}`,
  });

  // O campo de descricao do Magalu aceita HTML (o editor do portal tem negrito/listas): texto puro
  // com \n perde as quebras (confirmado lendo o SKU de volta), entao converte pra <br>.
  const descricaoHtml = description.replace(/\r?\n/g, '<br>');
  return { description: descricaoHtml.slice(0, 7000), datasheet, ncm, origin };
}

// POST /magalu/anuncio/criar — body: { sku, categoriaId }. Cria o SKU no Magalu (sobe 1 foto do
// Drive via proxy publico, cria SKU + preco + estoque, separado porque la sao 3 chamadas distintas
// — nao e' tudo no mesmo POST como na Shopee), salva o item_id na Peca e avisa o Bling. Mesmo padrao
// do /shopee/anuncio/criar: processado 1 SKU por vez pelo frontend (fila), nao em lote.
// `categoriaId` e' obrigatorio no body por enquanto (cola manualmente o UUID da categoria Magalu —
// o mapeamento automatico por SKU ainda nao existe, ver categoriaPendente no /anuncio/buscar acima).
magaluRouter.post('/anuncio/criar', async (req, res, next) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    const categoriaId = String(req.body?.categoriaId || '').trim();
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId obrigatorio (UUID da categoria Magalu) — mapeamento automatico ainda pendente.' });

    const peca = await prisma.peca.findFirst({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      include: { moto: { select: { marca: true, modelo: true, ano: true } } },
      orderBy: { idPeca: 'asc' },
    });
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB' });
    if ((peca as any).magaluItemId) return res.status(400).json({ error: `SKU ja possui anuncio Magalu (item ${(peca as any).magaluItemId}) — apague manualmente antes de recriar.` });

    const qtdDisponivel = await prisma.peca.count({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }], disponivel: true },
    });
    if (!qtdDisponivel) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU' });

    const peso = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : 0);
    if (!peso) return res.status(400).json({ error: 'SKU sem peso cadastrado (obrigatorio pra criar SKU no Magalu).' });
    if (!peca.largura || !peca.altura || !peca.profundidade) return res.status(400).json({ error: 'SKU sem dimensoes completas (largura/altura/profundidade) cadastradas.' });
    if (!Number(peca.precoML)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });

    // So 1 foto (capa) pra criacao, mesmo criterio adotado na Shopee — evita pesar essa etapa; o
    // resto das fotos fica por conta da aba Fotos Anuncios.
    const drive = await buscarFotosDriveSku(peca.motoId, sku);
    const fotoCapa = drive.fotos[0];
    if (!fotoCapa) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU — o SKU precisa de pelo menos 1 imagem.' });
    const imageUrls = [`${getBackendBase()}/magalu/imagem/${encodeURIComponent(fotoCapa.id)}`];

    // Retomavel: se o SKU ja existe no Magalu (ex: tentativa anterior criou o SKU mas falhou em
    // preco/estoque, e o ANB nao gravou o ID), nao recria — segue pra preco/estoque.
    const jaExisteNoMagalu = await magaluGetSku(sku).then(() => true).catch(() => false);
    const conteudo = await montarConteudoMagalu(peca, sku, categoriaId, peso);
    const criado = jaExisteNoMagalu
      ? { sku, traceId: null as string | null }
      : await magaluCreateSku({
        sku,
        title: peca.descricao.slice(0, 150),
        description: conteudo.description,
        datasheet: conteudo.datasheet,
        ncm: conteudo.ncm,
        origin: conteudo.origin,
        brand: peca.moto?.marca || 'Generico',
        categoryId: categoriaId,
        weightKg: peso,
        heightCm: Number(peca.altura),
        lengthCm: Number(peca.profundidade),
        widthCm: Number(peca.largura),
        imageUrls,
      });

    await magaluAguardarSku(sku);
    // v2: etapas rotuladas pra apontar exatamente onde falhou (preco x estoque).
    try {
      await magaluSetPrice(sku, Number(peca.precoML));
    } catch (e: any) {
      throw new Error(`SKU criado no Magalu, mas falhou ao definir PRECO: ${e?.message || e}`);
    }
    try {
      await magaluSetStock(sku, qtdDisponivel);
    } catch (e: any) {
      throw new Error(`SKU criado no Magalu, mas falhou ao definir ESTOQUE: ${e?.message || e}`);
    }

    let blingResultado: any = null;
    let blingErro: string | null = null;
    try {
      blingResultado = await informarAnuncioMagaluNoBling(sku, criado.sku);
    } catch (e: any) {
      blingErro = e?.message || String(e);
      await prisma.peca.updateMany({
        where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
        data: { magaluItemId: criado.sku } as any,
      });
    }

    res.json({
      ok: true,
      sku,
      magaluItemId: criado.sku,
      traceId: criado.traceId,
      categoriaId,
      fotosEnviadas: imageUrls.length,
      bling: blingResultado,
      blingErro,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao criar SKU no Magalu' });
  }
});

// POST /magalu/anuncio/atualizar — body: { sku, categoriaId? }. Reenvia (PATCH parcial) o conteudo
// exigido pela moderacao do Magalu (descricao, ficha tecnica, NCM, origem) pra um SKU JA existente,
// sem recriar. Usado pra corrigir anuncios bloqueados/em rascunho.
magaluRouter.post('/anuncio/atualizar', async (req, res) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const peca = await prisma.peca.findFirst({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      include: { moto: { select: { marca: true, modelo: true, ano: true } } },
      orderBy: { idPeca: 'asc' },
    });
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB' });
    const categoriaId = String(req.body?.categoriaId || (peca as any).magaluCategoriaId || '').trim();
    if (!categoriaId) return res.status(400).json({ error: 'SKU sem categoria Magalu.' });
    const peso = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : 0);

    const conteudo = await montarConteudoMagalu(peca, sku, categoriaId, peso);
    const parcial: Record<string, any> = {
      description: conteudo.description,
      datasheet: conteudo.datasheet,
      ...(conteudo.ncm ? { ncm: conteudo.ncm } : {}),
      ...(conteudo.origin ? { origin: conteudo.origin } : {}),
    };
    const resposta = await magaluAtualizarConteudoSku(sku, parcial);
    res.json({ ok: true, sku, enviado: { descricaoChars: conteudo.description.length, datasheet: conteudo.datasheet, ncm: conteudo.ncm, origin: conteudo.origin }, resposta });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao atualizar SKU no Magalu' });
  }
});

// POST /magalu/anuncio/completar-fotos — body: { sku }. Usado pela aba Fotos Anuncios: pega todas
// as fotos do Drive do SKU (ate o limite de imagens que o Magalu aceitar) e substitui via PATCH
// parcial (so o campo images), igual ao padrao de "trocar todas as fotos" ja usado nos outros
// marketplaces. Nao faz merge com fotos existentes porque a API do Magalu nao expoe um jeito de
// anexar — o PATCH de images substitui a lista inteira (mesmo comportamento documentado da Shopee).
const MAGALU_MAX_FOTOS = 8; // Nao encontrado limite oficial documentado — adotamos o mesmo teto da Shopee ate confirmar o real.
magaluRouter.post('/anuncio/completar-fotos', async (req, res, next) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });

    const peca = await prisma.peca.findFirst({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      orderBy: { idPeca: 'asc' },
    });
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB' });
    if (!(peca as any).magaluItemId) return res.status(400).json({ error: 'SKU ainda nao tem anuncio criado no Magalu.' });

    const drive = await buscarFotosDriveSku(peca.motoId, sku);
    if (!drive.fotos.length) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU.' });

    const fotos = drive.fotos.slice(0, MAGALU_MAX_FOTOS);
    const imageUrls = fotos.map((f) => `${getBackendBase()}/magalu/imagem/${encodeURIComponent(f.id)}`);

    await magaluUpdateSkuImages(sku, imageUrls);

    res.json({ ok: true, sku, fotosEnviadas: imageUrls.length });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao completar fotos no Magalu' });
  }
});

// GET /magalu/traces?code=<sku> — resultado das operacoes assincronas daquele SKU (motivo de recusa).
magaluRouter.get('/traces', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code obrigatorio' });
  const traces = await magaluTracesPorCodigo(code);
  if (traces === null) return res.status(400).json({ error: 'Nao foi possivel consultar traces (escopo open:trace:read nao liberado no client?).' });
  res.json({ ok: true, code, traces });
});

// GET /magalu/anuncio/validacao?sku=X — por que o SKU esta em DRAFT / o que foi reprovado.
magaluRouter.get('/anuncio/validacao', async (req, res) => {
  try {
    const sku = getBaseSku(req.query.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    res.json(await magaluValidacaoSku(sku));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao consultar validacao' });
  }
});

// GET /magalu/anuncio/status?sku=X — consulta o SKU direto na Magalu (usado pra conferir quantas
// fotos ja tem antes de completar, mesmo padrao do shopeeGetItemBaseInfo).
magaluRouter.get('/anuncio/status', async (req, res, next) => {
  try {
    const sku = getBaseSku(req.query.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const data = await magaluGetSku(sku);
    res.json({ ok: true, sku, imagens: (data?.images || []).length, status: data?.status || null, urlMarketplace: data?.url_marketplace || null });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao consultar SKU no Magalu' });
  }
});
