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

    // Carrega SKUs já existentes no banco
    const existentes = await prisma.peca.findMany({ select: { idPeca: true } });
    const skusExistentes = new Set(existentes.map((p: any) => p.idPeca));

    let pagina = 1;
    const itens: any[] = [];

    while (true) {
      let url = `/produtos?pagina=${pagina}&limite=100&criterio=2`;
      if (dataInicio) url += `&dataInclusaoInicial=${dataInicio} 00:00:00`;
      if (dataFim)    url += `&dataInclusaoFinal=${dataFim} 23:59:59`;

      console.log(`[Bling Produtos] GET ${url}`);
      const data = await blingReq(url) as any;
      const produtos = data?.data || [];
      console.log(`[Bling Produtos] Retornou ${produtos.length} produtos`);
      if (!produtos.length) break;

      for (const p of produtos) {
        const sku     = p.codigo || '';
        const idBling = `BL${String(p.id).padStart(8, '0')}`;
        const jaExiste = skusExistentes.has(sku) || skusExistentes.has(idBling);

        let motoId = resolverMotoId(sku, prefixos);
        if (!motoId && motoIdFallback) motoId = Number(motoIdFallback);

        const moto = motoId
          ? await prisma.moto.findUnique({ where: { id: motoId }, select: { marca: true, modelo: true } })
          : null;

        const qtdEstoque = Number(p.estoque?.saldoVirtualTotal || p.estoque?.saldo || 0);

        itens.push({
          id:          p.id,
          sku,
          nome:        p.nome || '',
          preco:       Number(p.preco) || 0,
          qtdEstoque,
          motoId:      motoId || null,
          moto:        moto ? `${moto.marca} ${moto.modelo}` : null,
          jaExiste,
          semPrefixo:  !motoId,
        });
      }

      if (produtos.length < 100) break;
      pagina++;
      await sleep(300);
    }

    res.json({ ok: true, total: itens.length, itens });
  } catch (e) { next(e); }
});

// POST /bling/importar-produto — importa um produto aprovado individualmente
blingRouter.post('/importar-produto', async (req, res, next) => {
  try {
    const { id, sku, nome, preco, motoId, frete, taxaPct, qtd } = req.body;
    if (!motoId) return res.status(400).json({ error: 'motoId obrigatório' });

    const precoML  = Number(preco)   || 0;
    const freteN   = Number(frete)   || 29.90;
    const taxa     = Number(taxaPct) || 17;
    const taxaVal  = parseFloat((precoML * taxa / 100).toFixed(2));
    const valorLiq = parseFloat((precoML - freteN - taxaVal).toFixed(2));
    const quantidade = Number(qtd) || 1;

    // Cria uma linha por unidade em estoque
    const skippedAll: boolean[] = [];
    for (let i = 0; i < quantidade; i++) {
      const skuBase = sku || `BL${String(id).padStart(8, '0')}`;
      const idPeca  = i === 0 ? skuBase : `${skuBase}-${i + 1}`;
      const exists  = await prisma.peca.findUnique({ where: { idPeca } });
      if (exists) { skippedAll.push(true); continue; }

      await prisma.peca.create({ data: {
        idPeca, motoId: Number(motoId),
        descricao:   nome || 'Produto Bling',
        precoML,
        valorFrete:  freteN,
        valorTaxas:  taxaVal,
        valorLiq,
        disponivel:  true,
        cadastro:    new Date(),
      }});
      skippedAll.push(false);
    }

    res.json({ ok: true, skipped: skippedAll.every(s => s), criados: skippedAll.filter(s => !s).length });
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

      // Dados financeiros do Totais Marketplace do Bling
      const taxaComissao  = Number(dp.taxas?.taxaComissao || 0);   // Taxa ML em R$
      const custoFrete    = Number(dp.taxas?.custoFrete   || 0);   // Frete em R$ (positivo)
      const valorBase     = Number(dp.taxas?.valorBase    || 0);   // Preço ML base
      const taxaPct       = valorBase > 0 ? parseFloat((taxaComissao / valorBase * 100).toFixed(2)) : 0;
      // Frete: usa custoFrete do marketplace, ou frete do transporte se não houver
      const freteBruto    = Number(dp.transporte?.frete   || 0);
      const fretePositivo = custoFrete > 0 ? custoFrete : Math.abs(freteBruto);

      for (const item of (dp.itens || [])) {
        const skuBling = item.produto?.codigo || item.codigo || item.sku || '';
        const idBling  = item.produto?.id ? `BL${String(item.produto.id).padStart(8, '0')}` : '';

        // Busca pelo SKU exato primeiro, depois pelo prefixo (primeira unidade disponível)
        // Ex: SKU "PN0111" do Bling → busca PN0111, PN0111-2, PN0111-3... pega primeiro disponível
        let peca = pecaMap.get(skuBling) || pecaMap.get(idBling) || null;

        if (!peca && skuBling) {
          // Busca primeira unidade disponível com esse prefixo de SKU
          const candidatas = Array.from(pecaMap.values()).filter((p: any) =>
            (p.idPeca === skuBling || p.idPeca.startsWith(skuBling + '-')) && p.disponivel
          );
          if (candidatas.length > 0) peca = candidatas[0];
        }

        const precoVenda  = Number(item.valor) || 0;
        const taxaValor   = taxaComissao;  // já vem calculado pelo Bling
        const valorLiq    = parseFloat((precoVenda - fretePositivo - taxaValor).toFixed(2));

        itens.push({
          pedidoId,
          pedidoNum:    dp.numero || String(pedidoId),
          dataVenda,
          idPeca:       peca?.idPeca || skuBling || idBling,
          descricao:    item.produto?.nome || item.descricao || '',
          skuBling,
          precoVenda,
          frete:        fretePositivo,
          taxaPct,
          taxaValor,
          valorLiq,
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
    const { pecaId, dataVenda, precoVenda, frete, taxaValor, valorLiq } = req.body;
    if (!pecaId || !dataVenda)
      return res.status(400).json({ error: 'pecaId e dataVenda são obrigatórios' });

    const precoML = Number(precoVenda) || 0;
    const freteN  = Number(frete)      || 0;
    const taxas   = Number(taxaValor)  || 0;
    const vliq    = valorLiq !== undefined
      ? Number(valorLiq)
      : parseFloat((precoML - freteN - taxas).toFixed(2));

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        disponivel:  false,
        dataVenda:   new Date(dataVenda),
        precoML:     precoML,
        valorFrete:  freteN,
        valorTaxas:  taxas,
        valorLiq:    vliq,
      }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
