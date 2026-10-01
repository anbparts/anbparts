import { Router } from 'express';
import { getMagaluConfig, saveMagaluConfig, magaluExchangeCodeForToken, magaluReq } from '../lib/magalu-api';

export const magaluRouter = Router();

// GET /magalu/debug-raw?path=PATH — proxy direto pra API do Magalu (debug), mesmo padrao do
// /shopee/debug-raw — assina a chamada com o access_token salvo e devolve a resposta crua, pra
// diagnosticar sem depender de suposicao de formato/permissao.
magaluRouter.get('/debug-raw', async (req, res, next) => {
  try {
    const path = String(req.query.path || '');
    if (!path) return res.status(400).json({ error: 'path obrigatorio' });
    const data = await magaluReq(path);
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
