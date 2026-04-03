import { Router } from 'express';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

export const blingRouter = Router();

const BLING_API   = 'https://www.bling.com.br/Api/v3';
const BLING_OAUTH = 'https://www.bling.com.br/Api/v3/oauth/token';

// ── Persistência da config ──────────────────────────────────────────────────
// Railway tem filesystem efêmero — usamos /tmp que sobrevive entre requests
// do mesmo container, e ENV vars como fallback de leitura.
const CFG_FILE = '/tmp/.bling_config.json';

async function getConfig(): Promise<any> {
  // 1. Tenta arquivo /tmp (persiste enquanto container vive)
  try {
    const raw = fs.readFileSync(CFG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {}
  // 2. Fallback vazio
  return { clientId: '', clientSecret: '', accessToken: '', refreshToken: '', connectedAt: null, prefixos: [] };
}

async function saveConfig(cfg: any) {
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Helper: requisição autenticada para Bling ───────────────────────────────
async function blingReq(pathUrl: string, options: any = {}) {
  const cfg = await getConfig();
  let token = cfg.accessToken;

  const doReq = async (tk: string) =>
    fetch(`${BLING_API}${pathUrl}`, {
      ...options,
      headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

  let resp = await doReq(token);

  // Token expirado → tenta renovar automaticamente
  if (resp.status === 401 && cfg.refreshToken) {
    token = await refreshAccessToken();
    resp = await doReq(token);
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Bling API ${resp.status}: ${err.slice(0, 200)}`);
  }
  return resp.json();
}

async function refreshAccessToken() {
  const cfg = await getConfig();
  if (!cfg.refreshToken) throw new Error('Sem refresh token. Reconecte o Bling.');
  const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const resp = await fetch(BLING_OAUTH, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refreshToken }).toString(),
  });
  if (!resp.ok) throw new Error('Falha ao renovar token Bling — reconecte.');
  const data = await resp.json() as any;
  await saveConfig({ ...cfg, accessToken: data.access_token, refreshToken: data.refresh_token });
  return data.access_token;
}

// ── Rotas de configuração ───────────────────────────────────────────────────

// GET /bling/config
blingRouter.get('/config', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      clientId:    cfg.clientId    || '',
      clientSecret: cfg.clientSecret ? '••••••••' : '',
      hasTokens:   !!(cfg.accessToken),
      connectedAt: cfg.connectedAt || null,
      prefixos:    cfg.prefixos    || [],
    });
  } catch (e) { next(e); }
});

// POST /bling/config
blingRouter.post('/config', async (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body;
    if (!clientId || !clientSecret)
      return res.status(400).json({ error: 'clientId e clientSecret são obrigatórios' });
    const cfg = await getConfig();
    await saveConfig({ ...cfg, clientId, clientSecret });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /bling/auth-url
blingRouter.get('/auth-url', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    if (!cfg.clientId) return res.status(400).json({ error: 'Configure o Client ID primeiro' });
    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;
    const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${cfg.clientId}&state=anbparts&redirect_uri=${encodeURIComponent(redirect)}`;
    res.json({ url });
  } catch (e) { next(e); }
});

// GET /bling/callback
blingRouter.get('/callback', async (req, res, next) => {
  try {
    const { code } = req.query as any;
    if (!code) return res.status(400).send('Code não recebido');
    const cfg = await getConfig();
    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;
    const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const resp = await fetch(BLING_OAUTH, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }).toString(),
    });
    if (!resp.ok) { const err = await resp.text(); return res.status(400).send('Erro ao trocar token: ' + err); }
    const data = await resp.json() as any;
    await saveConfig({ ...cfg, accessToken: data.access_token, refreshToken: data.refresh_token, connectedAt: new Date().toISOString() });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/bling?connected=true`);
  } catch (e) { next(e); }
});

// GET /bling/status
blingRouter.get('/status', async (req, res, next) => {
  try {
    const data = await blingReq('/empresas') as any;
    res.json({ ok: true, empresa: data?.data?.nome || 'Conectado' });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// DELETE /bling/disconnect
blingRouter.delete('/disconnect', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    await saveConfig({ ...cfg, accessToken: '', refreshToken: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Prefixos de/para ────────────────────────────────────────────────────────

// GET /bling/prefixos
blingRouter.get('/prefixos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.prefixos || []);
  } catch (e) { next(e); }
});

// POST /bling/prefixos
blingRouter.post('/prefixos', async (req, res, next) => {
  try {
    const { prefixos } = req.body;
    const cfg = await getConfig();
    await saveConfig({ ...cfg, prefixos });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Helper: resolve motoId pelo SKU usando prefixos (mais longo tem prioridade)
function resolverMotoId(sku: string, prefixos: any[]): number | null {
  if (!sku || !prefixos?.length) return null;
  const up = sku.toUpperCase();
  const sorted = [...prefixos].sort((a, b) => b.prefixo.length - a.prefixo.length);
  for (const { prefixo, motoId } of sorted) {
    if (up.startsWith(prefixo.toUpperCase())) return Number(motoId);
  }
  return null;
}

// ── Sincronização de produtos ───────────────────────────────────────────────

// POST /bling/sync/produtos
blingRouter.post('/sync/produtos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const prefixos = cfg.prefixos || [];
    const { motoIdFallback } = req.body;

    let pagina = 1, total = 0;
    const created: string[] = [], skipped: string[] = [], semMoto: string[] = [];

    while (true) {
      const data = await blingReq(`/produtos?pagina=${pagina}&limite=100&situacao=A`) as any;
      const produtos = data?.data || [];
      if (!produtos.length) break;

      for (const p of produtos) {
        const idPeca = `BL${String(p.id).padStart(8, '0')}`;
        const exists = await prisma.peca.findUnique({ where: { idPeca } });
        if (exists) { skipped.push(idPeca); continue; }

        const sku = p.codigo || p.sku || '';
        let motoId = resolverMotoId(sku, prefixos);
        if (!motoId && motoIdFallback) motoId = Number(motoIdFallback);
        if (!motoId) { semMoto.push(`${idPeca}(${sku || 'sem SKU'})`); continue; }

        await prisma.peca.create({ data: {
          idPeca, motoId,
          descricao: p.nome || 'Produto Bling',
          precoML:   Number(p.preco) || 0,
          valorLiq:  Number(p.preco) || 0,
          disponivel: true,
          cadastro:  new Date(),
        }});
        created.push(idPeca);
      }

      total += produtos.length;
      if (produtos.length < 100) break;
      pagina++;
    }

    res.json({ ok: true, total, created: created.length, skipped: skipped.length, semMoto: semMoto.length, semMotoExemplos: semMoto.slice(0, 5) });
  } catch (e) { next(e); }
});

// ── Sincronização de vendas (retorna lista para revisão manual) ─────────────

// POST /bling/sync/vendas
blingRouter.post('/sync/vendas', async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.body;
    let pagina = 1;
    const itens: any[] = [];

    while (true) {
      let url = `/pedidos/vendas?pagina=${pagina}&limite=100&situacao=9`;
      if (dataInicio) url += `&dataInicio=${dataInicio}`;
      if (dataFim)    url += `&dataFim=${dataFim}`;

      const data = await blingReq(url) as any;
      const pedidos = data?.data || [];
      if (!pedidos.length) break;

      for (const pedido of pedidos) {
        const det = await blingReq(`/pedidos/vendas/${pedido.id}`) as any;
        const dp = det?.data || {};
        const dataVenda = (dp.data || '').split('T')[0] || new Date().toISOString().split('T')[0];

        for (const item of (dp.itens || [])) {
          const idPeca = `BL${String(item.produto?.id || '').padStart(8, '0')}`;
          const peca = await prisma.peca.findUnique({
            where: { idPeca },
            include: { moto: { select: { marca: true, modelo: true } } }
          });

          itens.push({
            pedidoId:     pedido.id,
            pedidoNum:    dp.numero || String(pedido.id),
            dataVenda,
            idPeca,
            descricao:    item.produto?.nome || item.descricao || '',
            skuBling:     item.produto?.codigo || '',
            precoVenda:   Number(item.valor) || 0,
            encontrada:   !!peca,
            jaVendida:    peca ? !peca.disponivel : false,
            pecaId:       peca?.id || null,
            moto:         peca?.moto ? `${peca.moto.marca} ${peca.moto.modelo}` : null,
            precoMLAtual: peca ? Number(peca.precoML) : null,
          });
        }
      }

      if (pedidos.length < 100) break;
      pagina++;
    }

    res.json({ ok: true, total: itens.length, itens });
  } catch (e) { next(e); }
});

// POST /bling/baixar — confirma baixa de uma peça com data e preço
blingRouter.post('/baixar', async (req, res, next) => {
  try {
    const { pecaId, dataVenda, precoVenda } = req.body;
    if (!pecaId || !dataVenda)
      return res.status(400).json({ error: 'pecaId e dataVenda são obrigatórios' });

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        disponivel: false,
        dataVenda:  new Date(dataVenda),
        ...(precoVenda ? { precoML: Number(precoVenda) } : {}),
      }
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});
