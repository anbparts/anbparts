import { Router } from 'express';
import { getShopeeConfig, saveShopeeConfig, shopeeExchangeCodeForToken, shopeeReq, shopeeAddItem, shopeeGetLogisticChannel } from '../lib/shopee-api';
import { prepararImagensShopeeParaNovoItem } from '../lib/fotos-cadastro';
import { informarAnuncioShopeeNoBling } from './bling';
import { prisma } from '../lib/prisma';

export const shopeeRouter = Router();

function getBaseSku(value: any) {
  return String(value || '').trim().toUpperCase().replace(/-\d+$/, '');
}

// GET /shopee/debug-raw?path=PATH — proxy direto pra API da Shopee (debug), mesmo padrao do
// /bling/debug-raw — assina a chamada como Shop API (access_token/shop_id) e devolve a resposta
// crua, pra diagnosticar sem depender de suposicao de nome de campo/host/permissao.
shopeeRouter.get('/debug-raw', async (req, res, next) => {
  try {
    const path = String(req.query.path || '');
    if (!path) return res.status(400).json({ error: 'path obrigatorio' });
    const data = await shopeeReq(path);
    res.json(data);
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// GET /shopee/status — usado pela tela de Configuracao pra mostrar se a loja esta conectada.
shopeeRouter.get('/status', async (_req, res, next) => {
  try {
    const config = await getShopeeConfig();
    res.json({
      ok: true,
      environment: config.environment,
      connected: !!config.accessToken,
      shopId: config.shopId || null,
      connectedAt: config.connectedAt,
    });
  } catch (e) { next(e); }
});

// POST /shopee/config — troca o ambiente (sandbox|live) antes de gerar o link de autorizacao no
// Console da Shopee (App List > Authorize). O partner_id/key veem de env (SHOPEE_PARTNER_ID/KEY).
shopeeRouter.post('/config', async (req, res, next) => {
  try {
    const environment = req.body?.environment === 'live' ? 'live' : 'sandbox';
    const config = await saveShopeeConfig({ environment });
    res.json({ ok: true, environment: config.environment });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// GET /shopee/callback — a Shopee redireciona pra ca depois que o vendedor autoriza (Console >
// App List > Authorize, com Redirect URL = https://sistema.anbparts.com.br/api/shopee/callback).
// Recebe ?code=...&shop_id=..., troca pelo primeiro par access_token/refresh_token e salva.
shopeeRouter.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const shopId = String(req.query.shop_id || '');
    if (!code || !shopId) {
      return res.redirect(`${getFrontendBase()}/config-shopee?erro=${encodeURIComponent('code ou shop_id ausente no retorno da Shopee')}`);
    }

    const config = await getShopeeConfig();
    const payload = await shopeeExchangeCodeForToken(code, shopId, config.environment);

    const expiresAt = new Date(Date.now() + Number(payload.expire_in || 0) * 1000);
    await saveShopeeConfig({
      shopId,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt,
      connectedAt: new Date(),
    });

    res.redirect(`${getFrontendBase()}/config-shopee?conectado=1`);
  } catch (e: any) {
    res.redirect(`${getFrontendBase()}/config-shopee?erro=${encodeURIComponent(e?.message || 'Erro ao conectar Shopee')}`);
  }
});

// GET /shopee/categorias — lista toda a tabela ShopeeCategoria (as ~90 categorias ja mapeadas),
// pra alimentar o buscador dinamico de categoria na aba Anuncio. Ordenado por caminho completo.
shopeeRouter.get('/categorias', async (_req, res, next) => {
  try {
    const categorias = await prisma.shopeeCategoria.findMany({
      orderBy: [{ categoria: 'asc' }, { subcategoria: 'asc' }, { nivel3: 'asc' }, { nivel4: 'asc' }],
    });
    res.json({
      ok: true,
      categorias: categorias.map((c: any) => ({
        id: c.id,
        categoria: c.categoria,
        subcategoria: c.subcategoria,
        nivel3: c.nivel3,
        nivel4: c.nivel4,
        permitido: c.permitido,
        caminho: [c.categoria, c.subcategoria, c.nivel3, c.nivel4].filter(Boolean).join(' > '),
        generica: c.nivel4 === 'Outros',
      })),
    });
  } catch (e) { next(e); }
});

// POST /shopee/anuncio/buscar — body: { skus: string[] }. Pra cada SKU base informado, devolve os
// dados pra montar a linha da aba Anuncio: descricao/preco/peso/categoria atual (com detalhe se
// ela e' bloqueada ou generica) e se o SKU ja tem anuncio Shopee (pra vir desmarcado/destacado).
shopeeRouter.post('/anuncio/buscar', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => getBaseSku(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    const categorias = await prisma.shopeeCategoria.findMany();
    const categoriaPorId = new Map(categorias.map((c: any) => [String(c.id), c]));

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
      const cat = peca.shopeeCategoriaId ? categoriaPorId.get(peca.shopeeCategoriaId) : null;
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
        shopeeItemId: peca.shopeeItemId || null,
        jaTemAnuncio: !!peca.shopeeItemId,
        categoriaAtual: cat ? {
          id: cat.id,
          caminho: [cat.categoria, cat.subcategoria, cat.nivel3, cat.nivel4].filter(Boolean).join(' > '),
          nivel4: cat.nivel4,
          permitido: cat.permitido,
          generica: cat.nivel4 === 'Outros',
        } : null,
      });
    }

    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

// POST /shopee/anuncio/criar — body: { sku, categoriaId }. Cria o anuncio na Shopee pra 1 SKU:
// sobe as fotos do Drive, chama add_item com os campos minimos confirmados como obrigatorios na
// doc oficial, salva o item_id na Peca e avisa o Bling (mesmo mecanismo do "Avisar Bling" manual).
// Processado 1 SKU por vez pelo frontend (fila), nao em lote — evita payload gigante e deixa
// acompanhar o progresso/erro de cada SKU individualmente.
shopeeRouter.post('/anuncio/criar', async (req, res, next) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    const categoriaIdOverride = req.body?.categoriaId != null ? Number(req.body.categoriaId) : null;
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });

    const peca = await prisma.peca.findFirst({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      include: { moto: { select: { marca: true } } },
      orderBy: { idPeca: 'asc' },
    });
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB' });
    if (peca.shopeeItemId) return res.status(400).json({ error: `SKU ja possui anuncio Shopee (item ${peca.shopeeItemId}) — apague manualmente antes de recriar.` });

    const categoriaId = categoriaIdOverride || Number(peca.shopeeCategoriaId || 0);
    if (!categoriaId) return res.status(400).json({ error: 'SKU sem categoria Shopee definida' });
    const categoria = await prisma.shopeeCategoria.findUnique({ where: { id: categoriaId } });
    if (!categoria) return res.status(400).json({ error: `Categoria ${categoriaId} nao existe na nossa tabela ShopeeCategoria` });
    if (!categoria.permitido) return res.status(400).json({ error: `Categoria "${categoria.nivel4}" esta bloqueada na Shopee (permitido=false) — escolha outra antes de criar o anuncio.` });

    const qtdDisponivel = await prisma.peca.count({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }], disponivel: true },
    });
    if (!qtdDisponivel) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU' });

    const imageIdList = await prepararImagensShopeeParaNovoItem(peca.motoId, sku);
    if (!imageIdList.length) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU — o anuncio precisa de pelo menos 1 imagem.' });

    const canal = await shopeeGetLogisticChannel();

    const peso = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : 0);
    if (!peso) return res.status(400).json({ error: 'SKU sem peso cadastrado (obrigatorio pra criar anuncio na Shopee).' });
    if (!peca.largura || !peca.altura || !peca.profundidade) return res.status(400).json({ error: 'SKU sem dimensoes completas (largura/altura/profundidade) cadastradas.' });
    if (!Number(peca.precoML)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });

    const criado = await shopeeAddItem({
      itemName: peca.descricao.slice(0, 120),
      description: peca.descricao,
      price: Number(peca.precoML),
      weightKg: peso,
      packageHeightCm: Number(peca.altura),
      packageLengthCm: Number(peca.profundidade),
      packageWidthCm: Number(peca.largura),
      categoryId: categoriaId,
      imageIdList,
      itemSku: sku,
      stock: qtdDisponivel,
      logisticId: canal.logistic_id,
      marcaMoto: (peca as any).moto?.marca || null,
    });

    let blingResultado: any = null;
    let blingErro: string | null = null;
    try {
      blingResultado = await informarAnuncioShopeeNoBling(sku, criado.itemId);
    } catch (e: any) {
      blingErro = e?.message || String(e);
      // Mesmo sem conseguir avisar o Bling, o anuncio ja foi criado na Shopee — grava o item_id
      // localmente de qualquer forma, pra nao perder a referencia.
      await prisma.peca.updateMany({
        where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
        data: { shopeeItemId: criado.itemId },
      });
    }

    res.json({
      ok: true,
      sku,
      shopeeItemId: criado.itemId,
      categoriaId,
      fotosEnviadas: imageIdList.length,
      canalLogistica: canal.nome,
      bling: blingResultado,
      blingErro,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao criar anuncio na Shopee' });
  }
});
