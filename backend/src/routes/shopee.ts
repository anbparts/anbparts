import { Router } from 'express';
import { getShopeeConfig, saveShopeeConfig, shopeeExchangeCodeForToken, shopeeExchangeResendCode, shopeeLinkReenviarCodigo, shopeeDiagnostico, shopeeReq, shopeeAddItem, shopeeGetLogisticChannel } from '../lib/shopee-api';
import { prepararImagensShopeeParaNovoItem } from '../lib/fotos-cadastro';
import { informarAnuncioShopeeNoBling, findBlingProductsByCodes, fetchBlingProductDetailById } from './bling';
import { prisma } from '../lib/prisma';
import { carregarAnuncioBase, gravarIdsAnuncio } from '../lib/anuncioBase';
import { exigirFotosOficiais, garantirProdutoAtivoNoBling } from '../lib/anuncioPreparar';

export const shopeeRouter = Router();

function getBaseSku(value: any) {
  return String(value || '').trim().toUpperCase().replace(/-\d+$/, '');
}

// Converte o HTML da descricao do Bling pra texto puro MANTENDO as quebras de linha (a Shopee
// aceita \n na description) — <br>/</p>/</div> viram quebra de linha antes de tirar as outras tags,
// senao o texto perde a formatacao em paragrafos (ficava tudo numa linha so).
function htmlParaTextoComQuebras(html: string) {
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

// GET /shopee/diagnostico?ambiente=live|sandbox — testa partner_id/key/host do servidor (nao devolve a chave).
shopeeRouter.get('/diagnostico', async (req, res) => {
  try {
    const config = await getShopeeConfig();
    const ambiente = req.query.ambiente === 'sandbox' ? 'sandbox' : req.query.ambiente === 'live' ? 'live' : config.environment;
    res.json(await shopeeDiagnostico(ambiente));
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

function getFrontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// GET /shopee/status — usado pela tela de Configuracao pra mostrar se a loja esta conectada.
// GET /shopee/meu-ip — IP publico de SAIDA deste servidor (pra preencher a whitelist de IP do Go Live
// da Shopee). No Railway sem IP estatico ele pode mudar entre deploys.
shopeeRouter.get('/meu-ip', async (_req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j: any = await r.json();
    res.json({ ip: j?.ip || null });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao obter IP de saida' });
  }
});

shopeeRouter.get('/status', async (_req, res, next) => {
  try {
    const config = await getShopeeConfig();
    res.json({
      ok: true,
      environment: String(config.environment).startsWith('live') ? 'live' : config.environment,
      host: config.environment === 'live-global' ? 'global (partner.shopeemobile.com)' : config.environment === 'live' ? 'brasil (openplatform.shopee.com.br)' : 'sandbox',
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

// POST /shopee/desconectar — limpa os tokens salvos (o seller precisa autorizar de novo depois).
shopeeRouter.post('/desconectar', async (_req, res, next) => {
  try {
    await saveShopeeConfig({ shopId: '', accessToken: '', refreshToken: '', expiresAt: null, connectedAt: null });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

// GET /shopee/callback — a Shopee redireciona pra ca depois que o vendedor autoriza (Console >
// App List > Authorize, com Redirect URL = https://sistema.anbparts.com.br/api/shopee/callback).
// Recebe ?code=...&shop_id=..., troca pelo primeiro par access_token/refresh_token e salva.
// O `code` vale uma unica troca: se o navegador/proxy chamar o callback 2x com o mesmo code, a 2a
// chamada receberia "code expired or used" e mascararia o sucesso da 1a. Por isso a troca por code e'
// compartilhada (mesma Promise) e o resultado fica guardado alguns minutos.
const shopeeCallbackPorCode = new Map<string, { promise: Promise<void>; chamadas: number }>();

// Registro do ULTIMO callback (sem guardar o code inteiro): permite ver pelo navegador o que a Shopee respondeu de verdade
// (mensagem + request_id) e o IP de saida do servidor naquele momento — pra comparar com a whitelist de IP do app.
let ultimoCallback: any = null;
// GET /shopee/link-reenviar — gera o link (valido 5 min) pra reenviar o code de autorizacao pelo painel de dev.
shopeeRouter.get('/link-reenviar', async (_req, res) => {
  try {
    const config = await getShopeeConfig();
    // Mesma Redirect URL cadastrada no console (dominio precisa bater com "Live Redirect URL Domain").
    const redirect = 'https://sistema.anbparts.com.br/api/shopee/callback';
    res.json({ ok: true, ambiente: config.environment, redirect, link: shopeeLinkReenviarCodigo(config.environment, redirect) });
  } catch (e: any) { res.status(400).json({ error: e?.message }); }
});

shopeeRouter.get('/ultimo-callback', (_req, res) => { res.json({ ultimoCallback }); });

shopeeRouter.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    const shopId = String(req.query.shop_id || '');
    const mainAccountId = String(req.query.main_account_id || '');
    console.log(`[shopee/callback] query keys=${Object.keys(req.query).join(',')} code_len=${code.length} shop_id=${shopId || '-'} main_account_id=${mainAccountId || '-'}`);
    const ehResend = code.startsWith('resend');
    ultimoCallback = { quando: new Date().toISOString(), chavesQuery: Object.keys(req.query), codePrefixo: code.slice(0, 8), codeTamanho: code.length, shopId: shopId || null, mainAccountId: mainAccountId || null, ehResend, resultado: 'processando' };
    fetch('https://api.ipify.org?format=json').then((r2) => r2.json()).then((j: any) => { if (ultimoCallback) ultimoCallback.ipSaida = j?.ip || null; }).catch(() => null);
    if (!code || (!shopId && !mainAccountId && !ehResend)) {
      return res.redirect(`${getFrontendBase()}/config-shopee?erro=${encodeURIComponent('code ou shop_id ausente no retorno da Shopee')}`);
    }

    let entrada = shopeeCallbackPorCode.get(code);
    if (entrada) {
      entrada.chamadas += 1;
      console.log(`[shopee/callback] mesmo code recebido de novo (chamada ${entrada.chamadas}) — reaproveitando o resultado da 1a`);
    } else {
      const promise = (async () => {
        const config = await getShopeeConfig();
        const payload = ehResend
          ? await shopeeExchangeResendCode(code, config.environment)
          : await shopeeExchangeCodeForToken(code, shopId, config.environment, mainAccountId);
        const expiresAt = new Date(Date.now() + Number(payload.expire_in || 0) * 1000);
        await saveShopeeConfig({
          shopId: shopId || String(payload.shop_id_list?.[0] || ''),
          environment: payload.ambienteUsado || config.environment,
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt,
          connectedAt: new Date(),
        });
      })();
      entrada = { promise, chamadas: 1 };
      shopeeCallbackPorCode.set(code, entrada);
      setTimeout(() => shopeeCallbackPorCode.delete(code), 10 * 60 * 1000);
    }

    await entrada.promise;
    if (ultimoCallback) ultimoCallback.resultado = 'ok';
    res.redirect(`${getFrontendBase()}/config-shopee?conectado=1`);
  } catch (e: any) {
    console.error(`[shopee/callback] erro: ${e?.message}`);
    if (ultimoCallback) { ultimoCallback.resultado = 'erro'; ultimoCallback.erro = String(e?.message || e); }
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
      // Peca (ja finalizada) OU pre-cadastro — ver lib/anuncioBase.ts.
      const peca = await carregarAnuncioBase(sku);
      if (!peca) {
        linhas.push({ sku, encontrado: false, erro: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });
        continue;
      }
      const qtdDisponivel = peca.estoque;
      const cat = peca.shopeeCategoriaId ? categoriaPorId.get(peca.shopeeCategoriaId) : null;
      linhas.push({
        sku,
        origem: peca.origem,
        fotosProcessadas: peca.fotosOficiais > 0,
        fotosQtd: peca.fotosOficiais,
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

    const peca = await carregarAnuncioBase(sku);
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro)' });
    exigirFotosOficiais(peca);
    if (peca.shopeeItemId) return res.status(400).json({ error: `SKU ja possui anuncio Shopee (item ${peca.shopeeItemId}) — apague manualmente antes de recriar.` });

    const categoriaId = categoriaIdOverride || Number(peca.shopeeCategoriaId || 0);
    if (!categoriaId) return res.status(400).json({ error: 'SKU sem categoria Shopee definida' });
    const categoria = await prisma.shopeeCategoria.findUnique({ where: { id: categoriaId } });
    if (!categoria) return res.status(400).json({ error: `Categoria ${categoriaId} nao existe na nossa tabela ShopeeCategoria` });
    if (!categoria.permitido) return res.status(400).json({ error: `Categoria "${categoria.nivel4}" esta bloqueada na Shopee (permitido=false) — escolha outra antes de criar o anuncio.` });

    const qtdDisponivel = peca.estoque;
    if (!qtdDisponivel) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU' });

    // O produto nasce INATIVO no Bling (pre-cadastro): ativa ANTES de ler a descricao do Bling
    // (produto inativo nao aparece na busca por codigo) e de criar o anuncio.
    await garantirProdutoAtivoNoBling(peca);

    // So sobe 1 foto pra criacao (minimo exigido pela Shopee) — o resto fica a cargo da aba Fotos
    // Anuncios, que ja detecta itens com poucas fotos e completa depois. Isso evita empilhar o
    // upload de ate 9 fotos na mesma chamada que ja precisa ir ate o Bling buscar a descricao.
    const imageIdList = await prepararImagensShopeeParaNovoItem(peca.motoId, sku, 1);
    if (!imageIdList.length) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU — o anuncio precisa de pelo menos 1 imagem.' });

    const canal = await shopeeGetLogisticChannel();

    const peso = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : 0);
    if (!peso) return res.status(400).json({ error: 'SKU sem peso cadastrado (obrigatorio pra criar anuncio na Shopee).' });
    if (!peca.largura || !peca.altura || !peca.profundidade) return res.status(400).json({ error: 'SKU sem dimensoes completas (largura/altura/profundidade) cadastradas.' });
    if (!Number(peca.precoML)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });

    // Descricao completa vem do Bling (mesmo campo/tratamento usado no fluxo de anuncio-criar via
    // integracao do Bling: descricaoCurta, com html removido) — o texto local (peca.descricao) e'
    // curto demais (usado so como titulo). Se o Bling nao tiver nada, cai pro texto local mesmo.
    let descricaoBling = '';
    try {
      const produtosByCode = await findBlingProductsByCodes([sku], { forceRefresh: true });
      const produtoBling = produtosByCode.get(sku);
      if (produtoBling?.id) {
        const detail = await fetchBlingProductDetailById(Number(produtoBling.id), { forceRefresh: true });
        descricaoBling = htmlParaTextoComQuebras((detail as any)?.descricaoCurta || (produtoBling as any)?.descricaoCurta || '');
      }
    } catch (e) {
      // Bling fora do ar/produto nao encontrado nao pode travar a criacao do anuncio — cai pro
      // texto local como fallback.
    }

    const criado = await shopeeAddItem({
      itemName: peca.descricao.slice(0, 120),
      description: descricaoBling || peca.descricao,
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

    // O anuncio ja foi criado na Shopee — grava o item_id (pre-cadastro e pecas) ANTES de avisar o
    // Bling, pra nao perder a referencia se o aviso falhar.
    await gravarIdsAnuncio(sku, { shopeeItemId: criado.itemId });

    let blingResultado: any = null;
    let blingErro: string | null = null;
    try {
      blingResultado = await informarAnuncioShopeeNoBling(sku, criado.itemId);
    } catch (e: any) {
      blingErro = e?.message || String(e);
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
