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

async function nuvemReq<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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
  return res.json() as Promise<T>;
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

function normalizarSkuBusca(value: string) {
  return String(value || '').trim().replace(/^"+|"+$/g, '').trim().toUpperCase();
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
      where.idPeca = { in: skusInput.map((s: string) => normalizarSkuBusca(s)).filter(Boolean) };
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

async function listarModelosAnthropic(apiKey: string) {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const modelos = Array.isArray(data?.data)
    ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
    : [];

  return {
    ok: response.ok,
    status: response.status,
    text,
    modelos,
  };
}

nuvemshopRouter.get('/testar-ia', async (_req, res) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY nao configurado nas variaveis de ambiente do servidor' });
  }

  try {
    const modelosInfo = await listarModelosAnthropic(anthropicKey);
    return res.json({
      ok: modelosInfo.ok,
      status: modelosInfo.status,
      modelos: modelosInfo.modelos,
      raw: modelosInfo.ok ? undefined : modelosInfo.text.slice(0, 500),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: `Falha ao listar modelos da Anthropic: ${e?.message || String(e)}` });
  }
});

nuvemshopRouter.post('/sugerir-ia', async (req, res, next) => {
  let etapa = 'inicio';
  try {
    const { produtos, categorias } = req.body || {};
    if (!produtos?.length || !categorias?.length) {
      return res.status(400).json({ ok: false, error: 'produtos e categorias sao obrigatorios' });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY nao configurado nas variaveis de ambiente do servidor' });
    }

    // Monta árvore de categorias para contexto (igual para todos os lotes)
    const pais = categorias.filter((c: any) => !c.parent_id);
    const filhos = categorias.filter((c: any) => c.parent_id);
    const arvore = pais.map((pai: any) => ({
      id: pai.id,
      nome: pai.name?.pt || pai.name?.['pt-BR'] || (Object.values(pai.name || {}) as string[])[0] || String(pai.id),
      filhos: filhos
        .filter((f: any) => String(f.parent_id) === String(pai.id))
        .map((f: any) => ({
          id: f.id,
          nome: f.name?.pt || f.name?.['pt-BR'] || (Object.values(f.name || {}) as string[])[0] || String(f.id),
        })),
    })).filter((p: any) => p.nome);

    const listaCategoriasTexto = arvore.map((p: any) =>
      `${p.nome} (ID:${p.id})${p.filhos.length ? '\n  ' + p.filhos.map((f: any) => `${f.nome} (ID:${f.id})`).join('\n  ') : ''}`
    ).join('\n');

    const anthropicModel = 'claude-sonnet-4-6';

    const listaProdutos = produtos.map((p: any) =>
      `SKU: ${p.sku} | Titulo: ${p.titulo} | Moto: ${p.moto?.marca || ''} ${p.moto?.modelo || ''} ${p.moto?.ano || ''}`
    ).join('\n');

    const prompt = `Voce e um especialista em e-commerce de pecas de moto usadas. Analise cada produto e sugira categorias e tags.

CATEGORIAS DISPONIVEIS:
${listaCategoriasTexto}

PRODUTOS:
${listaProdutos}

Regras das tags: inclua partes do nome do produto, marca da moto, modelo, ano, prefixo do SKU e termos tecnicos.
Regras das categorias: escolha categoria pai E subcategoria mais especifica. Pode sugerir ambas.

Responda APENAS com JSON valido, sem texto antes ou depois, sem markdown:
{"sugestoes":[{"sku":"SKU_AQUI","categorias":[{"id":1,"nome":"Nome"}],"tags":["tag1","tag2"]}]}`;

    etapa = 'mensagem';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s antes do Railway matar

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': anthropicKey,
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const msg = fetchErr?.name === 'AbortError'
        ? `Timeout: a IA demorou mais de 55s. Tente com menos produtos.`
        : `Erro de conexao com a IA: ${fetchErr?.message}`;
      return res.status(500).json({ ok: false, error: msg });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ ok: false, error: `Claude API ${response.status}: ${errText.slice(0, 300)}` });
    }

    const data = await response.json() as any;
    const text = (data.content?.[0]?.text || '').trim();

    if (!text) {
      return res.status(500).json({ ok: false, error: 'Resposta vazia da IA' });
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(500).json({ ok: false, error: `IA nao retornou JSON: ${text.slice(0, 200)}` });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (parseErr: any) {
      return res.status(500).json({ ok: false, error: `Erro ao parsear JSON: ${parseErr.message}` });
    }

    res.json({ ok: true, sugestoes: parsed.sugestoes || [], modelo: anthropicModel });
  } catch (e: any) {
    console.error('[nuvemshop/sugerir-ia]', { etapa, erro: e });
    res.status(500).json({ ok: false, error: `Falha em ${etapa}: ${e?.message || String(e)}` });
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
            categories: (categorias || []).map((c: any) => Number(c.id)),
            tags: (tags || []).join(', '),
          }),
        });
        resultados.push({ produtoId, ok: true });
      } catch (e: any) {
        resultados.push({ produtoId, ok: false, error: e.message });
      }
    }

    res.json({ ok: true, resultados, errosDetalhados: resultados.filter(r => !r.ok).map((e: any) => `Produto ${e.produtoId}: ${e.error}`).join(' | ') || null });
  } catch (e) { next(e); }
});

// ─── POST /nuvemshop/upload-imagens ──────────────────────────────────────────
// Body: { produtoId, imagens: [{filename, base64}] }

nuvemshopRouter.post('/upload-imagens', async (req, res, next) => {
  try {
    const { produtoId, imagens } = req.body || {};
    if (!produtoId) return res.status(400).json({ ok: false, error: 'produtoId obrigatorio' });
    if (!Array.isArray(imagens) || !imagens.length) return res.status(400).json({ ok: false, error: 'imagens obrigatorio' });

    const resultados: any[] = new Array(imagens.length);
    const imagensExistentes = await nuvemReq<Array<{ id: number | string; position?: number | string | null }>>(
      `/products/${produtoId}/images?per_page=200&fields=id,position`
    );
    let proximaPosicao =
      (Array.isArray(imagensExistentes)
        ? imagensExistentes.reduce((max, img) => {
            const posicao = Number(img?.position || 0);
            return Number.isFinite(posicao) && posicao > max ? posicao : max;
          }, 0)
        : 0) + 1;

    for (let indice = 0; indice < imagens.length; indice++) {
      const img = imagens[indice];
      try {
        // Mantem a ordem do ANB ao fixar a posicao explicitamente na Nuvemshop.
        const posicao = proximaPosicao;
        const base64 = String(img.base64 || '').replace(/^data:[^;]+;base64,/, '');
        const data = await nuvemReq<{ id: number | string; src?: string | null; position?: number | string | null }>(
          `/products/${produtoId}/images`,
          {
            method: 'POST',
            body: JSON.stringify({
              attachment: base64,
              filename: img.filename || 'foto.jpg',
              position: posicao,
            }),
          }
        );
        resultados[indice] = {
          queueIndex: img.queueIndex ?? indice,
          filename: img.filename,
          ok: true,
          id: data.id,
          src: data.src,
          position: data.position ?? posicao,
        };
        proximaPosicao++;
      } catch (e: any) {
        resultados[indice] = {
          queueIndex: img.queueIndex ?? indice,
          filename: img.filename,
          ok: false,
          error: e.message,
        };
      }
    }

    const erros = resultados.filter(r => !r.ok);
    res.json({ ok: true, enviadas: resultados.filter(r => r.ok).length, erros: erros.length, resultados });
  } catch (e) { next(e); }
});

// ─── POST /nuvemshop/upload-imagens-drive ─────────────────────────────────────
// Pipe direto: Drive → Nuvemshop sem passar pelo browser
// Body: { produtoId, fileIds: [{id, nome, mimeType}] }
nuvemshopRouter.post('/upload-imagens-drive', async (req, res, next) => {
  try {
    const { produtoId, fileIds } = req.body || {};
    if (!produtoId) return res.status(400).json({ ok: false, error: 'produtoId obrigatorio' });
    if (!Array.isArray(fileIds) || !fileIds.length) return res.status(400).json({ ok: false, error: 'fileIds obrigatorio' });

    // Busca credenciais OAuth do DetranConfig (mesmo padrão de google-drive.ts)
    const detranCfg = await prisma.detranConfig.findFirst();
    const clientId = detranCfg?.gmailClientId || '';
    const clientSecret = detranCfg?.gmailClientSecret || '';
    const refreshToken = detranCfg?.gmailRefreshToken || '';

    if (!refreshToken) return res.status(401).json({ ok: false, error: 'Google Drive não configurado — configure em Config. Gmail' });

    // Obtém access token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenResp.json() as any;
    const accessToken = tokenData.access_token;
    if (!accessToken) return res.status(401).json({ ok: false, error: `Falha ao obter token Google: ${tokenData.error || 'desconhecido'}` });

    // Calcula próxima posição na Nuvemshop
    const imagensExistentes = await nuvemReq<any[]>(`/products/${produtoId}/images?per_page=200&fields=id,position`);
    let proximaPosicao = (Array.isArray(imagensExistentes)
      ? imagensExistentes.reduce((max: number, img: any) => {
          const p = Number(img?.position || 0);
          return Number.isFinite(p) && p > max ? p : max;
        }, 0)
      : 0) + 1;

    const resultados: any[] = [];

    for (const arquivo of fileIds) {
      try {
        // 1. Baixa do Drive direto no backend
        const driveResp = await fetch(`https://www.googleapis.com/drive/v3/files/${arquivo.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!driveResp.ok) {
          const errTxt = await driveResp.text();
          resultados.push({ id: arquivo.id, nome: arquivo.nome, ok: false, error: `Drive ${driveResp.status}: ${errTxt.slice(0, 100)}` });
          continue;
        }
        const buffer = await driveResp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // 2. Envia para Nuvemshop
        const data = await nuvemReq<any>(`/products/${produtoId}/images`, {
          method: 'POST',
          body: JSON.stringify({
            attachment: base64,
            filename: arquivo.nome || 'foto.jpg',
            position: proximaPosicao,
          }),
        });

        resultados.push({ id: arquivo.id, nome: arquivo.nome, ok: true, nuvemId: data.id, position: proximaPosicao });
        proximaPosicao++;
      } catch (e: any) {
        resultados.push({ id: arquivo.id, nome: arquivo.nome, ok: false, error: e.message });
      }
    }

    const enviadas = resultados.filter(r => r.ok).length;
    res.json({ ok: true, enviadas, erros: resultados.filter(r => !r.ok).length, resultados });
  } catch (e) { next(e); }
});
