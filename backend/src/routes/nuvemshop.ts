import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const nuvemshopRouter = Router();

async function getConfig() {
  let cfg = await prisma.configuracaoGeral.findFirst();
  if (!cfg) cfg = await prisma.configuracaoGeral.create({ data: {} });
  return cfg;
}

// GET /nuvemshop/config
nuvemshopRouter.get('/config', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({
      appId: cfg.nuvemshopAppId || '',
      clientSecret: cfg.nuvemshopClientSecret ? '********' : '',
      accessToken: cfg.nuvemshopAccessToken ? '********' : '',
      storeId: cfg.nuvemshopStoreId || '',
      configured: !!(cfg.nuvemshopAccessToken && cfg.nuvemshopStoreId),
    });
  } catch (e) {
    next(e);
  }
});

// POST /nuvemshop/config
nuvemshopRouter.post('/config', async (req, res, next) => {
  try {
    const { appId, clientSecret, accessToken, storeId } = req.body;
    const cfg = await getConfig();

    const data: any = {};
    if (appId !== undefined) data.nuvemshopAppId = String(appId || '');
    if (clientSecret !== undefined && clientSecret !== '********') data.nuvemshopClientSecret = String(clientSecret || '');
    if (accessToken !== undefined && accessToken !== '********') data.nuvemshopAccessToken = String(accessToken || '');
    if (storeId !== undefined) data.nuvemshopStoreId = String(storeId || '');

    await prisma.configuracaoGeral.update({ where: { id: cfg.id }, data });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /nuvemshop/testar-conexao
nuvemshopRouter.post('/testar-conexao', async (_req, res, next) => {
  try {
    const cfg = await getConfig();
    const accessToken = cfg.nuvemshopAccessToken;
    const storeId = cfg.nuvemshopStoreId;

    if (!accessToken || !storeId) {
      return res.json({ ok: false, error: 'Access token e Store ID nao configurados.' });
    }

    const response = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}/store`, {
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'User-Agent': 'ANB Parts (contato@anbparts.com.br)',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.json({ ok: false, error: `Erro ${response.status}: ${text.slice(0, 200)}` });
    }

    const data = await response.json() as any;
    res.json({
      ok: true,
      loja: data.name || data.original_domain || storeId,
      storeId,
    });
  } catch (e: any) {
    next(e);
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function nuvemReq(path: string, options: RequestInit = {}) {
  const cfg = await getConfig();
  const accessToken = cfg.nuvemshopAccessToken;
  const storeId = cfg.nuvemshopStoreId;
  if (!accessToken || !storeId) throw new Error('Nuvemshop nao configurado');
  const res = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}${path}`, {
    ...options,
    headers: {
      'Authentication': `bearer ${accessToken}`,
      'User-Agent': 'ANB Parts (contato@anbparts.com.br)',
      'Content-Type': 'application/json',
      ...((options.headers as any) || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nuvemshop ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function resolverMotoIdPorPrefixo(sku: string, prefixos: any[]): number | null {
  if (!sku || !prefixos.length) return null;
  const normalizedSku = sku.toUpperCase();
  const ordered = [...prefixos].sort((a: any, b: any) => String(b.prefixo).length - String(a.prefixo).length);
  for (const { prefixo, motoId } of ordered) {
    if (normalizedSku.startsWith(String(prefixo).toUpperCase())) return Number(motoId);
  }
  return null;
}

// ─── GET /nuvemshop/categorias ────────────────────────────────────────────────

nuvemshopRouter.get('/categorias', async (_req, res, next) => {
  try {
    // Busca todas as categorias paginando
    let page = 1;
    let all: any[] = [];
    while (true) {
      const batch = await nuvemReq(`/categories?per_page=200&page=${page}`) as any[];
      if (!Array.isArray(batch) || !batch.length) break;
      all = all.concat(batch);
      if (batch.length < 200) break;
      page++;
    }
    res.json({ ok: true, categorias: all });
  } catch (e) { next(e); }
});

// ─── POST /nuvemshop/buscar-produtos ──────────────────────────────────────────
// Body: { motoId?: number } | { skus?: string[] }

nuvemshopRouter.post('/buscar-produtos', async (req, res, next) => {
  try {
    const { motoId, skus: skusInput } = req.body || {};

    // 1. Obtém SKUs do ANB com estoque
    const where: any = { disponivel: true };
    if (motoId) where.motoId = Number(motoId);
    if (skusInput && Array.isArray(skusInput) && skusInput.length) {
      where.idPeca = { in: skusInput.map((s: string) => s.trim().toUpperCase()) };
    }

    const pecas = await prisma.peca.findMany({
      where,
      select: {
        idPeca: true,
        descricao: true,
        motoId: true,
        moto: { select: { marca: true, modelo: true, ano: true } },
      },
      orderBy: { idPeca: 'asc' },
    });

    if (!pecas.length) {
      return res.json({ ok: true, produtos: [] });
    }

    // 2. Para cada SKU, busca o produto na Nuvemshop
    const resultados: any[] = [];
    for (const peca of pecas) {
      const sku = peca.idPeca;
      try {
        // Busca produto pelo SKU na Nuvemshop
        const produtos = await nuvemReq(`/products?q=${encodeURIComponent(sku)}&per_page=5`) as any[];
        // Encontra o produto cujo variant tem o SKU exato
        let produtoEncontrado: any = null;
        for (const p of produtos) {
          const variants: any[] = p.variants || [];
          if (variants.some((v: any) => String(v.sku || '').toUpperCase() === sku.toUpperCase())) {
            produtoEncontrado = p;
            break;
          }
        }

        if (!produtoEncontrado) {
          resultados.push({ sku, titulo: peca.descricao, moto: peca.moto, encontradoNuvemshop: false, produtoId: null, imagens: 0, categorias: [], tags: [] });
          continue;
        }

        const titulo = (produtoEncontrado.name?.pt || produtoEncontrado.name?.['pt-BR'] || Object.values(produtoEncontrado.name || {})[0] || peca.descricao) as string;
        const imagens = (produtoEncontrado.images || []).length;
        const categorias = (produtoEncontrado.categories || []).map((c: any) => ({ id: c.id, nome: c.name?.pt || c.name?.['pt-BR'] || Object.values(c.name || {})[0] || String(c.id) }));
        const tagsRaw = produtoEncontrado.tags || '';
        const tags = tagsRaw ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        resultados.push({
          sku,
          titulo,
          moto: peca.moto,
          encontradoNuvemshop: true,
          produtoId: produtoEncontrado.id,
          imagens,
          categorias,
          tags,
          semCategoria: categorias.length === 0,
          semTags: tags.length === 0,
        });
      } catch {
        resultados.push({ sku, titulo: peca.descricao, moto: peca.moto, encontradoNuvemshop: false, produtoId: null, imagens: 0, categorias: [], tags: [] });
      }
    }

    res.json({ ok: true, produtos: resultados });
  } catch (e) { next(e); }
});

// ─── POST /nuvemshop/sugerir-ia ───────────────────────────────────────────────
// Body: { produtos: [{sku, titulo, moto}], categorias: [{id, nome, parentId?}] }

nuvemshopRouter.post('/sugerir-ia', async (req, res, next) => {
  try {
    const { produtos, categorias } = req.body || {};
    if (!produtos?.length || !categorias?.length) {
      return res.status(400).json({ error: 'produtos e categorias sao obrigatorios' });
    }

    // Monta árvore de categorias para contexto
    const pais = categorias.filter((c: any) => !c.parent_id);
    const filhos = categorias.filter((c: any) => c.parent_id);
    const arvore = pais.map((pai: any) => ({
      id: pai.id,
      nome: pai.name?.pt || pai.name?.['pt-BR'] || Object.values(pai.name || {})[0] || '',
      filhos: filhos
        .filter((f: any) => f.parent_id === pai.id)
        .map((f: any) => ({
          id: f.id,
          nome: f.name?.pt || f.name?.['pt-BR'] || Object.values(f.name || {})[0] || '',
        })),
    }));

    // Monta o prompt para a IA
    const listaCategoriasTexto = arvore.map((p: any) =>
      `${p.nome} (ID:${p.id})${p.filhos.length ? '\n  ' + p.filhos.map((f: any) => `${f.nome} (ID:${f.id})`).join('\n  ') : ''}`
    ).join('\n');

    const listaProdutos = produtos.map((p: any) =>
      `SKU: ${p.sku} | Título: ${p.titulo} | Moto: ${p.moto?.marca || ''} ${p.moto?.modelo || ''} ${p.moto?.ano || ''}`
    ).join('\n');

    const prompt = `Você é um especialista em e-commerce de peças de moto usadas. Analise cada produto e sugira:
1. Categorias: escolha a categoria pai E a subcategoria mais específica da lista. Você pode sugerir múltiplas categorias se o produto se encaixar em mais de uma (ex: pai + subcategoria).
2. Tags: palavras-chave relevantes para busca. Inclua: partes do nome do produto, marca da moto, modelo da moto, ano, prefixo do SKU, termos técnicos relacionados.

CATEGORIAS DISPONÍVEIS:
${listaCategoriasTexto}

PRODUTOS PARA ANALISAR:
${listaProdutos}

Responda SOMENTE em JSON, sem texto extra, no formato:
{
  "sugestoes": [
    {
      "sku": "HD01_0074",
      "categorias": [{"id": 123, "nome": "Escape"}, {"id": 456, "nome": "Coletor e Intermediário"}],
      "tags": ["Escapamento", "Coletor", "Harley", "HD01", "Street Glide", "2019", "Touring"]
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.json({ ok: true, sugestoes: parsed.sugestoes || [] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /nuvemshop/aplicar ─────────────────────────────────────────────────
// Body: { aplicacoes: [{produtoId, categorias: [{id}], tags: string[]}] }

nuvemshopRouter.post('/aplicar', async (req, res, next) => {
  try {
    const { aplicacoes } = req.body || {};
    if (!Array.isArray(aplicacoes) || !aplicacoes.length) {
      return res.status(400).json({ error: 'aplicacoes obrigatorio' });
    }

    const resultados: any[] = [];
    for (const item of aplicacoes) {
      const { produtoId, categorias, tags } = item;
      try {
        await nuvemReq(`/products/${produtoId}`, {
          method: 'PUT',
          body: JSON.stringify({
            categories: (categorias || []).map((c: any) => ({ id: c.id })),
            tags: (tags || []).join(', '),
          }),
        });
        resultados.push({ produtoId, ok: true });
      } catch (e: any) {
        resultados.push({ produtoId, ok: false, error: e.message });
      }
    }

    res.json({ ok: true, resultados });
  } catch (e) { next(e); }
});
