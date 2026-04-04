import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const blingRouter = Router();

const BLING_API = 'https://www.bling.com.br/Api/v3';
const BLING_OAUTH = 'https://www.bling.com.br/Api/v3/oauth/token';
const DEFAULT_FRETE_PADRAO = 29.9;
const DEFAULT_TAXA_PADRAO_PCT = 17;
const STATUS_ID_CONCLUIDO = 9;
const STATUS_IDS_CANCELADO = new Set([12]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateFinancials(precoML: number, frete: number, taxaPct: number) {
  const taxaValor = roundMoney(precoML * taxaPct / 100);
  const valorLiq = roundMoney(precoML - frete - taxaValor);
  return { taxaValor, valorLiq };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractSituationText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(extractSituationText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    const preferred = ['nome', 'descricao', 'situacao', 'label', 'value', 'descricaoSituacao'];
    const parts: string[] = [];

    for (const key of preferred) {
      if (key in value) {
        const text = extractSituationText(value[key]);
        if (text) parts.push(text);
      }
    }

    for (const nested of Object.values(value)) {
      const text = extractSituationText(nested);
      if (text) parts.push(text);
    }

    return Array.from(new Set(parts)).join(' ');
  }
  return '';
}

function extractSituationIds(value: any, acc: number[] = []): number[] {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item) => extractSituationIds(item, acc));
    return acc;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if ((key === 'id' || key === 'valor' || key === 'codigo') && typeof nested === 'number') {
        acc.push(nested);
      }
      extractSituationIds(nested, acc);
    }
  }
  return acc;
}

function classifyOrderSituation(detail: any) {
  const source = detail?.situacao ?? detail?.situacaoPedido ?? detail?.situacoes ?? {};
  const rawText = extractSituationText(source)
    || extractSituationText(detail?.situacao)
    || extractSituationText(detail?.situacaoPedido)
    || extractSituationText(detail?.situacoes);
  const normalized = normalizeText(rawText);
  const ids = extractSituationIds(source);

  const isCancelado = ids.some((id) => STATUS_IDS_CANCELADO.has(id))
    || /cancel|anulad|reembols|estorn/.test(normalized);
  const isConcluido = ids.includes(STATUS_ID_CONCLUIDO)
    || /atendid|concluid|finaliz|faturad|entregue/.test(normalized);

  return {
    label: rawText || 'Sem situacao',
    isCancelado,
    isConcluido,
  };
}

function getProdutoDefaults(cfg: any) {
  return {
    fretePadrao: roundMoney(toNumber(cfg?.fretePadrao, DEFAULT_FRETE_PADRAO)),
    taxaPadraoPct: roundMoney(toNumber(cfg?.taxaPadraoPct, DEFAULT_TAXA_PADRAO_PCT)),
  };
}

async function getConfig(): Promise<any> {
  let cfg = await prisma.blingConfig.findFirst();
  if (!cfg) cfg = await prisma.blingConfig.create({ data: {} });

  return {
    ...cfg,
    prefixos: Array.isArray(cfg.prefixos) ? (cfg.prefixos as any[]) : [],
    ...getProdutoDefaults(cfg),
  };
}

async function saveConfig(data: any) {
  const cfg = await prisma.blingConfig.findFirst();
  if (cfg) {
    await prisma.blingConfig.update({ where: { id: cfg.id }, data });
  } else {
    await prisma.blingConfig.create({ data });
  }
}

async function blingReq(pathUrl: string, options: any = {}, retries = 3): Promise<any> {
  const cfg = await getConfig();
  let token = cfg.accessToken;

  const doReq = (currentToken: string) => fetch(`${BLING_API}${pathUrl}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
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
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
    }).toString(),
  });

  if (!resp.ok) throw new Error('Falha ao renovar token. Reconecte o Bling.');

  const data = await resp.json() as any;
  await saveConfig({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return data.access_token;
}

function resolverMotoId(sku: string, prefixos: any[]): number | null {
  if (!sku || !prefixos.length) return null;
  const normalizedSku = sku.toUpperCase();
  const ordered = [...prefixos].sort((a, b) => String(b.prefixo).length - String(a.prefixo).length);

  for (const { prefixo, motoId } of ordered) {
    if (normalizedSku.startsWith(String(prefixo).toUpperCase())) return Number(motoId);
  }

  return null;
}

function matchesSku(idPeca: string, codigo: string) {
  return idPeca === codigo || idPeca.startsWith(`${codigo}-`);
}

function findLinkedPecaByPedido(allPecas: any[], pedidoId: number | string, pedidoNum: string) {
  const candidates = allPecas.filter((peca) =>
    (pedidoId && String(peca.blingPedidoId || '') === String(pedidoId))
    || (pedidoNum && String(peca.blingPedidoNum || '') === String(pedidoNum)),
  );

  return candidates.sort((a, b) => {
    const soldA = a.disponivel ? 0 : 1;
    const soldB = b.disponivel ? 0 : 1;
    if (soldA !== soldB) return soldB - soldA;

    const diff = new Date(b.dataVenda || 0).getTime() - new Date(a.dataVenda || 0).getTime();
    return diff || b.id - a.id;
  })[0] || null;
}

function findSkuReferencePeca(allPecas: any[], skuBling: string, idBling: string) {
  const codigos = [skuBling, idBling].filter(Boolean);
  if (!codigos.length) return null;

  const candidates = allPecas.filter((peca) =>
    codigos.some((codigo) => matchesSku(peca.idPeca, codigo)),
  );

  return candidates.sort((a, b) => a.id - b.id)[0] || null;
}

function findAvailablePecaForVenda(
  allPecas: any[],
  skuBling: string,
  idBling: string,
  reservedIds: Set<number>,
) {
  const codigos = [skuBling, idBling].filter(Boolean);
  if (!codigos.length) return null;

  const candidates = allPecas
    .filter((peca) =>
      peca.disponivel
      && !reservedIds.has(peca.id)
      && codigos.some((codigo) => matchesSku(peca.idPeca, codigo)),
    )
    .sort((a, b) => a.id - b.id);

  return candidates[0] || null;
}

async function listPedidos(dataInicio?: string, dataFim?: string, situacoes?: number[]) {
  const pedidosMap = new Map<number, { id: number; situacao: ReturnType<typeof classifyOrderSituation> }>();
  let pagina = 1;

  while (true) {
    let url = `/pedidos/vendas?pagina=${pagina}&limite=100`;
    if (dataInicio) url += `&dataInicial=${dataInicio}`;
    if (dataFim) url += `&dataFinal=${dataFim}`;
    if (situacoes?.length) {
      for (const situacao of situacoes) {
        url += `&situacoes[]=${situacao}`;
      }
    }

    const data = await blingReq(url) as any;
    const pedidos = data?.data || [];
    if (!pedidos.length) break;

    for (const pedido of pedidos) {
      const id = Number(pedido?.id);
      if (id) {
        pedidosMap.set(id, {
          id,
          situacao: classifyOrderSituation(pedido),
        });
      }
    }

    if (pedidos.length < 100) break;
    pagina += 1;
    await sleep(300);
  }

  return Array.from(pedidosMap.values());
}

blingRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      clientId: cfg.clientId || '',
      clientSecret: cfg.clientSecret ? '********' : '',
      hasTokens: !!cfg.accessToken,
      connectedAt: cfg.connectedAt || null,
      prefixos: cfg.prefixos || [],
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/config', async (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body;
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'clientId e clientSecret sao obrigatorios' });
    }

    await saveConfig({
      clientId,
      clientSecret,
      accessToken: '',
      refreshToken: '',
      connectedAt: null,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/config-produtos', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      prefixos: cfg.prefixos || [],
      fretePadrao: cfg.fretePadrao,
      taxaPadraoPct: cfg.taxaPadraoPct,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/config-produtos', async (req, res, next) => {
  try {
    const prefixos = Array.isArray(req.body?.prefixos) ? req.body.prefixos : [];
    const fretePadrao = roundMoney(Math.max(0, toNumber(req.body?.fretePadrao, DEFAULT_FRETE_PADRAO)));
    const taxaPadraoPct = roundMoney(Math.max(0, toNumber(req.body?.taxaPadraoPct, DEFAULT_TAXA_PADRAO_PCT)));

    await saveConfig({
      prefixos,
      fretePadrao,
      taxaPadraoPct,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/auth-url', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    if (!cfg.clientId) return res.status(400).json({ error: 'Configure o Client ID primeiro' });

    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;

    const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${cfg.clientId}&state=anbparts&redirect_uri=${encodeURIComponent(redirect)}`;
    res.json({ url });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/callback', async (req, res, next) => {
  try {
    const { code } = req.query as any;
    if (!code) return res.status(400).send('Code nao recebido');

    const cfg = await getConfig();
    const redirect = process.env.BLING_REDIRECT_URI
      || `${process.env.BACKEND_URL || 'http://localhost:3333'}/bling/callback`;
    const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

    const resp = await fetch(BLING_OAUTH, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
      }).toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(400).send(`Erro: ${err}`);
    }

    const data = await resp.json() as any;
    await saveConfig({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      connectedAt: new Date(),
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/bling?connected=true`);
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/status', async (_req, res) => {
  try {
    await blingReq('/situacoes/modulos');
    res.json({ ok: true, empresa: 'Conectado' });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

blingRouter.delete('/disconnect', async (_req, res, next) => {
  try {
    await saveConfig({ accessToken: '', refreshToken: '', connectedAt: null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.get('/prefixos', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.prefixos || []);
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/prefixos', async (req, res, next) => {
  try {
    const { prefixos } = req.body;
    await saveConfig({ prefixos: Array.isArray(prefixos) ? prefixos : [] });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/sync/produtos', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const prefixos = cfg.prefixos || [];
    const { motoIdFallback, dataInicio, dataFim } = req.body;

    const existentes = await prisma.peca.findMany({ select: { idPeca: true } });
    const skusExistentes = new Set(existentes.map((peca) => peca.idPeca));

    let pagina = 1;
    const itens: any[] = [];

    while (true) {
      let url = `/produtos?pagina=${pagina}&limite=100&criterio=2`;
      if (dataInicio) url += `&dataInclusaoInicial=${dataInicio} 00:00:00`;
      if (dataFim) url += `&dataInclusaoFinal=${dataFim} 23:59:59`;

      const data = await blingReq(url) as any;
      const produtos = data?.data || [];
      if (!produtos.length) break;

      for (const produto of produtos) {
        const sku = produto.codigo || '';
        const idBling = `BL${String(produto.id).padStart(8, '0')}`;
        const jaExiste = skusExistentes.has(sku) || skusExistentes.has(idBling);

        let motoId = resolverMotoId(sku, prefixos);
        if (!motoId && motoIdFallback) motoId = Number(motoIdFallback);

        const moto = motoId
          ? await prisma.moto.findUnique({
            where: { id: motoId },
            select: { marca: true, modelo: true },
          })
          : null;

        const qtdEstoque = Number(produto.estoque?.saldoVirtualTotal || produto.estoque?.saldo || 0);

        itens.push({
          id: produto.id,
          sku,
          nome: produto.nome || '',
          preco: Number(produto.preco) || 0,
          qtdEstoque,
          motoId: motoId || null,
          moto: moto ? `${moto.marca} ${moto.modelo}` : null,
          jaExiste,
          semPrefixo: !motoId,
        });
      }

      if (produtos.length < 100) break;
      pagina += 1;
      await sleep(300);
    }

    res.json({ ok: true, total: itens.length, itens });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/importar-produto', async (req, res, next) => {
  try {
    const { id, sku, nome, preco, motoId, frete, taxaPct, qtd } = req.body;
    if (!motoId) return res.status(400).json({ error: 'motoId obrigatorio' });

    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const precoML = toNumber(preco);
    const freteN = roundMoney(toNumber(frete, defaults.fretePadrao) || defaults.fretePadrao);
    const taxa = roundMoney(toNumber(taxaPct, defaults.taxaPadraoPct) || defaults.taxaPadraoPct);
    const { taxaValor, valorLiq } = calculateFinancials(precoML, freteN, taxa);
    const quantidade = Math.max(1, Number(qtd) || 1);

    const skippedAll: boolean[] = [];
    for (let i = 0; i < quantidade; i += 1) {
      const skuBase = sku || `BL${String(id).padStart(8, '0')}`;
      const idPeca = i === 0 ? skuBase : `${skuBase}-${i + 1}`;
      const exists = await prisma.peca.findUnique({ where: { idPeca } });
      if (exists) {
        skippedAll.push(true);
        continue;
      }

      await prisma.peca.create({
        data: {
          idPeca,
          motoId: Number(motoId),
          descricao: nome || 'Produto Bling',
          precoML,
          valorFrete: freteN,
          valorTaxas: taxaValor,
          valorLiq,
          disponivel: true,
          cadastro: new Date(),
        },
      });

      skippedAll.push(false);
    }

    res.json({
      ok: true,
      skipped: skippedAll.every(Boolean),
      criados: skippedAll.filter((item) => !item).length,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/sync/vendas', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const { dataInicio, dataFim } = req.body;

    const todasPecas = await prisma.peca.findMany({
      select: {
        id: true,
        idPeca: true,
        disponivel: true,
        precoML: true,
        valorFrete: true,
        valorTaxas: true,
        valorLiq: true,
        dataVenda: true,
        blingPedidoId: true,
        blingPedidoNum: true,
        moto: { select: { marca: true, modelo: true } },
      },
    });
    const reservedVendaPecaIds = new Set<number>();
    const reservedCancelPecaIds = new Set<number>();

    const pedidosConcluidos = await listPedidos(dataInicio, dataFim, [STATUS_ID_CONCLUIDO]);
    const pedidosGerais = await listPedidos(dataInicio, dataFim);
    const pedidosGeraisMap = new Map(pedidosGerais.map((pedido) => [pedido.id, pedido]));
    const pedidosConcluidosMap = new Map(pedidosConcluidos.map((pedido) => [pedido.id, pedido]));
    const pedidoIds = Array.from(new Set([
      ...pedidosConcluidos.map((pedido) => pedido.id),
      ...pedidosGerais.map((pedido) => pedido.id),
    ]));
    const itens: any[] = [];

    for (const pedidoId of pedidoIds) {
      await sleep(150);

      const detalhe = await blingReq(`/pedidos/vendas/${pedidoId}`) as any;
      const pedido = detalhe?.data || {};
      const listSituacao = pedidosGeraisMap.get(pedidoId)?.situacao || pedidosConcluidosMap.get(pedidoId)?.situacao;
      const detailSituacao = classifyOrderSituation(pedido);
      const isCancelado = !!listSituacao?.isCancelado || detailSituacao.isCancelado;
      const statusLabel = listSituacao?.label && listSituacao.label !== 'Sem situacao'
        ? listSituacao.label
        : (detailSituacao.label || 'Sem situacao');
      const pedidoNum = pedido.numero || String(pedidoId);

      const dataVenda = (pedido.data || '').split('T')[0]
        || new Date().toISOString().split('T')[0];
      const taxaComissao = Number(pedido.taxas?.taxaComissao || 0);
      const custoFrete = Number(pedido.taxas?.custoFrete || 0);
      const valorBase = Number(pedido.taxas?.valorBase || 0);
      const taxaPct = valorBase > 0
        ? roundMoney((taxaComissao / valorBase) * 100)
        : 0;
      const freteBruto = Number(pedido.transporte?.frete || 0);
      const fretePositivo = custoFrete > 0 ? custoFrete : Math.abs(freteBruto);

      for (const item of pedido.itens || []) {
        const skuBling = item.produto?.codigo || item.codigo || item.sku || '';
        const idBling = item.produto?.id ? `BL${String(item.produto.id).padStart(8, '0')}` : '';
        const pecaVinculada = findLinkedPecaByPedido(todasPecas, pedidoId, pedidoNum);
        const pecaReferencia = findSkuReferencePeca(todasPecas, skuBling, idBling);

        let peca = pecaVinculada;

        if (isCancelado) {
          if (peca && reservedCancelPecaIds.has(peca.id)) {
            peca = null;
          }
          if (peca) reservedCancelPecaIds.add(peca.id);
        } else {
          if (!peca) {
            peca = findAvailablePecaForVenda(todasPecas, skuBling, idBling, reservedVendaPecaIds);
          }
          if (peca) reservedVendaPecaIds.add(peca.id);
        }

        const precoVenda = Number(item.valor) || 0;
        const taxaValorPedido = taxaComissao;
        const valorLiqPedido = roundMoney(precoVenda - fretePositivo - taxaValorPedido);

        const precoBaseCancelamento = toNumber(peca?.precoML, precoVenda);
        const valoresCancelamento = calculateFinancials(
          precoBaseCancelamento,
          defaults.fretePadrao,
          defaults.taxaPadraoPct,
        );

        itens.push({
          tipo: isCancelado ? 'CANCELAMENTO' : 'VENDA',
          statusLabel,
          pedidoId,
          pedidoNum,
          dataVenda,
          idPeca: peca?.idPeca || pecaReferencia?.idPeca || skuBling || idBling,
          descricao: item.produto?.nome || item.descricao || '',
          skuBling,
          precoVenda,
          frete: fretePositivo,
          taxaPct,
          taxaValor: taxaValorPedido,
          valorLiq: valorLiqPedido,
          encontrada: !!peca,
          baixaVinculada: isCancelado ? !!pecaVinculada : false,
          jaVendida: isCancelado ? false : (pecaVinculada ? !pecaVinculada.disponivel : false),
          jaEstornada: isCancelado ? (pecaVinculada ? pecaVinculada.disponivel : false) : false,
          pecaId: peca?.id || null,
          moto: (peca?.moto || pecaReferencia?.moto) ? `${(peca?.moto || pecaReferencia?.moto).marca} ${(peca?.moto || pecaReferencia?.moto).modelo}` : null,
          precoMLAtual: peca ? Number(peca.precoML) : null,
          fretePadrao: defaults.fretePadrao,
          taxaPadraoPct: defaults.taxaPadraoPct,
          taxaPadraoValor: valoresCancelamento.taxaValor,
          valorLiqPadrao: valoresCancelamento.valorLiq,
        });
      }
    }

    res.json({
      ok: true,
      total: itens.length,
      defaults,
      itens,
    });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/baixar', async (req, res, next) => {
  try {
    const { pecaId, pedidoId, pedidoNum, dataVenda, precoVenda, frete, taxaValor, valorLiq } = req.body;
    if (!pecaId || !dataVenda) {
      return res.status(400).json({ error: 'pecaId e dataVenda sao obrigatorios' });
    }

    const precoML = toNumber(precoVenda);
    const freteN = toNumber(frete);
    const taxas = toNumber(taxaValor);
    const vliq = valorLiq !== undefined
      ? toNumber(valorLiq)
      : roundMoney(precoML - freteN - taxas);

    await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        disponivel: false,
        dataVenda: new Date(dataVenda),
        blingPedidoId: pedidoId ? String(pedidoId) : null,
        blingPedidoNum: pedidoNum ? String(pedidoNum) : null,
        precoML,
        valorFrete: freteN,
        valorTaxas: taxas,
        valorLiq: vliq,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/aprovar-cancelamento', async (req, res, next) => {
  try {
    const { pecaId } = req.body;
    if (!pecaId) return res.status(400).json({ error: 'pecaId obrigatorio' });

    const cfg = await getConfig();
    const defaults = getProdutoDefaults(cfg);
    const peca = await prisma.peca.findUnique({
      where: { id: Number(pecaId) },
      select: { id: true, precoML: true },
    });

    if (!peca) return res.status(404).json({ error: 'Peca nao encontrada' });

    const precoML = toNumber(peca.precoML);
    const financials = calculateFinancials(precoML, defaults.fretePadrao, defaults.taxaPadraoPct);

    const updated = await prisma.peca.update({
      where: { id: Number(pecaId) },
      data: {
        disponivel: true,
        dataVenda: null,
        blingPedidoId: null,
        blingPedidoNum: null,
        valorFrete: defaults.fretePadrao,
        valorTaxas: financials.taxaValor,
        valorLiq: financials.valorLiq,
      },
    });

    res.json({
      ok: true,
      peca: updated,
      defaults,
    });
  } catch (e) {
    next(e);
  }
});
