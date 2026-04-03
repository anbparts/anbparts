import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const blingRouter = Router();

const BLING_API   = 'https://www.bling.com.br/Api/v3';
const BLING_OAUTH = 'https://www.bling.com.br/Api/v3/oauth/token';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Config helpers ──────────────────────────────────────────────────────────
async function getConfig(): Promise<any> {
  let cfg = await prisma.blingConfig.findFirst();
  if (!cfg) cfg = await prisma.blingConfig.create({ data: {} });
  return { ...cfg, prefixos: cfg.prefixos as any[] };
}

async function saveConfig(data: any) {
  const cfg = await prisma.blingConfig.findFirst();
  if (cfg) await prisma.blingConfig.update({ where: { id: cfg.id }, data });
  else await prisma.blingConfig.create({ data });
}

// ── Helper: requisição autenticada ─────────────────────────────────────────
async function blingReq(pathUrl: string, options: any = {}, retries = 3): Promise<any> {
  const cfg = await getConfig();
  let token = cfg.accessToken;

  const doReq = (tk: string) => fetch(`${BLING_API}${pathUrl}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  let resp = await doReq(token);

  if (resp.status === 401 && cfg.refreshToken) {
    token = await refreshAccessToken();
    resp = await doReq(token);
  }

  if (resp.status === 429 && retries > 0) {
    await sleep(2000);
    return blingReq(pathUrl, options, retries - 1);
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
  if (!resp.ok) throw new Error('Falha ao renovar token — reconecte o Bling.');
  const data = await resp.json() as any;
  await saveConfig({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return data.access_token;
}

// ── Rotas de config ─────────────────────────────────────────────────────────

blingRouter.get('/config', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      clientId:     cfg.clientId    || '',
      clientSecret: cfg.clientSecret ? '••••••••' : '',
      hasTokens:    !!(cfg.accessToken),
      connectedAt:  cfg.connectedAt || null,
      prefixos:     cfg.prefixos    || [],
    });
  } catch (e) { next(e); }
});

blingRouter.post('/config', async (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body;
    if (!clientId || !clientSecret)
      return res.status(400).json({ error: 'clientId e clientSecret são obrigatórios' });
    await saveConfig({ clientId, clientSecret, accessToken: '', refreshToken: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

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
    if (!resp.ok) { const err = await resp.text(); return res.status(400).send('Erro: ' + err); }
    const data = await resp.json() as any;
    await saveConfig({ accessToken: data.access_token, refreshToken: data.refresh_token, connectedAt: new Date() });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/bling?connected=true`);
  } catch (e) { next(e); }
});

blingRouter.get('/status', async (req, res, next) => {
  try {
    await blingReq('/situacoes/modulos');
    res.json({ ok: true, empresa: 'Conectado' });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

blingRouter.delete('/disconnect', async (req, res, next) => {
  try {
    await saveConfig({ accessToken: '', refreshToken: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Prefixos ────────────────────────────────────────────────────────────────

blingRouter.get('/prefixos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.prefixos || []);
  } catch (e) { next(e); }
});

blingRouter.post('/prefixos', async (req, res, next) => {
  try {
    const { prefixos } = req.body;
    await saveConfig({ prefixos });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

function resolverMotoId(sku: string, prefixos: any[]): number | null {
  if (!sku || !prefixos?.length) return null;
  const up = sku.toUpperCase();
  const sorted = [...prefixos].sort((a, b) => b.prefixo.length - a.prefixo.length);
  for (const { prefixo, motoId } of sorted) {
    if (up.startsWith(prefixo.toUpperCase())) return Number(motoId);
  }
  return null;
}

// ── Sync produtos ───────────────────────────────────────────────────────────

blingRouter.post('/sync/produtos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const prefixos = cfg.prefixos || [];
    const { motoIdFallback, dataInicio, dataFim } = req.body;
    let pagina = 1, total = 0;
    const created: string[] = [], skipped: string[] = [], semMoto: string[] = [];

    while (true) {
      let url = `/produtos?pagina=${pagina}&limite=100&situacao=A`;
      if (dataInicio) url += `&dataInicial=${dataInicio}`;
      if (dataFim)    url += `&dataFinal=${dataFim}`;

      const data = await blingReq(url) as any;
      const produtos = data?.data || [];
      if (!produtos.length) break;

      for (const p of produtos) {
        await sleep(200);
        const idPeca = `BL${String(p.id).padStart(8, '0')}`;
        const exists = await prisma.peca.findUnique({ where: { idPeca } });
        if (exists) { skipped.push(idPeca); continue; }

        const sku = p.codigo || p.sku || '';
        let motoId = resolverMotoId(sku, prefixos);
        if (!motoId && motoIdFallback) motoId = Number(motoIdFallback);
        if (!motoId) { semMoto.push(`${idPeca}(${sku || 'sem SKU'})`); continue; }

        await prisma.peca.create({ data: {
          idPeca, motoId,
          descricao:  p.nome || 'Produto Bling',
          precoML:    Number(p.preco) || 0,
          valorLiq:   Number(p.preco) || 0,
          disponivel: true,
          cadastro:   new Date(),
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

// ── Sync vendas ─────────────────────────────────────────────────────────────

blingRouter.post('/sync/vendas', async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.body;

    // Carrega todas as peças do banco de uma vez (evita N queries)
    const todasPecas = await prisma.peca.findMany({
      select: { id: true, idPeca: true, disponivel: true, precoML: true, moto: { select: { marca: true, modelo: true } } }
    });
    const pecaMap = new Map(todasPecas.map(p => [p.idPeca, p]));

    // Busca IDs dos pedidos concluídos no período
    let pagina = 1;
    const pedidosIds: number[] = [];

    while (true) {
      // Bling v3: filtros de data usam sufixo Inicial/Final
      let url = `/pedidos/vendas?pagina=${pagina}&limite=100&situacoes[]=9`;
      if (dataInicio) url += `&dataInicial=${dataInicio}`;
      if (dataFim)    url += `&dataFinal=${dataFim}`;

      console.log(`[Bling] GET ${BLING_API}${url}`);

      const data = await blingReq(url) as any;
      const pedidos = data?.data || [];
      console.log(`[Bling] Pedidos retornados: ${pedidos.length}`);

      if (!pedidos.length) break;
      pedidosIds.push(...pedidos.map((p: any) => p.id));
      if (pedidos.length < 100) break;
      pagina++;
      await sleep(300);
    }

    console.log(`[Bling] Total pedidos a detalhar: ${pedidosIds.length}`);

    // Busca detalhe de cada pedido
    const itens: any[] = [];
    for (const pedidoId of pedidosIds) {
      await sleep(150);
      const det = await blingReq(`/pedidos/vendas/${pedidoId}`) as any;
      const dp = det?.data || {};
      const dataVenda = (dp.data || '').split('T')[0] || new Date().toISOString().split('T')[0];

      for (const item of (dp.itens || [])) {
        const skuBling = item.produto?.codigo || item.codigo || item.sku || '';
        const idBling  = item.produto?.id ? `BL${String(item.produto.id).padStart(8, '0')}` : '';

        console.log(`[Bling] Item pedido ${pedidoId}: SKU="${skuBling}" idBling="${idBling}" campos=`, JSON.stringify(Object.keys(item)));

        // Busca pelo SKU (como peças são importadas do Excel) ou pelo ID do Bling
        const peca = pecaMap.get(skuBling) || pecaMap.get(idBling) || null;

        itens.push({
          pedidoId,
          pedidoNum:    dp.numero || String(pedidoId),
          dataVenda,
          idPeca:       peca?.idPeca || skuBling || idBling,
          descricao:    item.produto?.nome || item.descricao || '',
          skuBling,
          precoVenda:   Number(item.valor) || 0,
          encontrada:   !!peca,
          jaVendida:    peca ? !peca.disponivel : false,
          pecaId:       peca?.id || null,
          moto:         peca?.moto ? `${peca.moto.marca} ${peca.moto.modelo}` : null,
          precoMLAtual: peca ? Number(peca.precoML) : null,
        });
      }
    }

    res.json({ ok: true, total: itens.length, itens });
  } catch (e) { next(e); }
});

// ── Baixar venda ────────────────────────────────────────────────────────────

blingRouter.post('/baixar', async (req, res, next) => {
  try {
    const { pecaId, dataVenda, precoVenda } = req.body;
    if (!pecaId || !dataVenda)
      return res.status(400).json({ error: 'pecaId e dataVenda são obrigatórios' });
    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: { disponivel: false, dataVenda: new Date(dataVenda), ...(precoVenda ? { precoML: Number(precoVenda) } : {}) }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
