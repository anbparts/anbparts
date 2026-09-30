import { Router } from 'express';
import { getShopeeConfig, saveShopeeConfig, shopeeExchangeCodeForToken } from '../lib/shopee-api';

export const shopeeRouter = Router();

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
