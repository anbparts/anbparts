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
} from '../lib/magalu-api';
import { baixarFotoDrivePorId, buscarFotosDriveSku } from '../lib/fotos-cadastro';
import { informarAnuncioMagaluNoBling } from './bling';
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
        categoriaAtual: (peca as any).magaluCategoriaId ? { id: (peca as any).magaluCategoriaId, caminho: (peca as any).magaluCategoriaId } : null,
        categoriaPendente: true,
      });
    }

    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

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
      include: { moto: { select: { marca: true, modelo: true } } },
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

    const criado = await magaluCreateSku({
      sku,
      title: peca.descricao.slice(0, 150),
      description: peca.descricao,
      brand: peca.moto?.marca || 'Generico',
      categoryId: categoriaId,
      weightKg: peso,
      heightCm: Number(peca.altura),
      lengthCm: Number(peca.profundidade),
      widthCm: Number(peca.largura),
      imageUrls,
    });

    await magaluSetPrice(sku, Number(peca.precoML));
    await magaluSetStock(sku, qtdDisponivel);

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
