// Criacao de anuncio direto na API da Nuvemshop (aba Anuncio do Cadastro) — mesmo fluxo da Shopee e
// do Magalu: busca SKUs, categoria automatica (com ajuste manual), cria o produto OCULTO com foto
// de capa, grava o ID na Peca e avisa o Bling. Ativar (publicar) e' uma 2a etapa (POST /anuncio/ativar).
// Montado como router separado, mas montado no mesmo prefixo /nuvemshop (ver server.ts), pra nao
// misturar com as rotas de Categoria/Tags/Fotos que ja existem em routes/nuvemshop.ts.
import { Router } from 'express';
import { nuvemReq, buscarProdutoNuvemshopPorSku } from './nuvemshop';
import { buscarFotosDriveSku } from '../lib/fotos-cadastro';
import { carregarAnuncioBase, gravarIdsAnuncio } from '../lib/anuncioBase';
import { exigirFotosOficiais, garantirProdutoAtivoNoBling, lerDadosBlingSku } from '../lib/anuncioPreparar';
import { informarAnuncioNuvemshopNoBling, findBlingProductsByCodes, fetchBlingProductDetailById } from './bling';
import {
  carregarArvoreNuvemshop,
  listarCategoriasNuvemshopSelecionaveis,
  nuvemshopCategoriasDoProduto,
  sugerirNuvemshopCategoriaId,
} from '../lib/nuvemshopCategoria';
import { gerarTagsNuvemshop } from '../lib/nuvemshopTags';

export const nuvemshopAnuncioRouter = Router();

function getBaseSku(value: any) {
  return String(value || '').trim().toUpperCase().replace(/-\d+$/, '');
}

function getBackendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function htmlParaTextoSimples(html: string) {
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

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// GET /nuvemshop/anuncio/categorias — categorias selecionaveis (folhas) no mesmo formato do modal de
// ajuste da aba Anuncio (Shopee/Magalu).
nuvemshopAnuncioRouter.get('/anuncio/categorias', async (_req, res, next) => {
  try {
    const { porId } = await carregarArvoreNuvemshop();
    const folhas = await listarCategoriasNuvemshopSelecionaveis();
    res.json({
      ok: true,
      categorias: folhas.map((n) => {
        const pai = n.parentId ? porId.get(n.parentId) : null;
        return {
          id: n.id,
          categoria: pai ? pai.nome : n.nome,
          subcategoria: pai ? n.nome : '',
          nivel3: '',
          nivel4: n.nome,
          permitido: true,
          caminho: n.caminho,
          generica: /^outr[ao]s/i.test(n.nome),
        };
      }),
    });
  } catch (e) { next(e); }
});

// POST /nuvemshop/anuncio/buscar — body: { skus: string[] }. Mesmo formato do /magalu/anuncio/buscar.
// "jaTemAnuncio" olha o ID gravado na peca E o produto existente na loja (hoje os produtos nascem no
// Bling, entao muitos SKUs ja existem la — evita duplicar).
nuvemshopAnuncioRouter.post('/anuncio/buscar', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => getBaseSku(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    const { porId } = await carregarArvoreNuvemshop();
    const linhas: any[] = [];
    for (const sku of skus) {
      // Peca (ja finalizada) OU pre-cadastro — ver lib/anuncioBase.ts.
      const peca = await carregarAnuncioBase(sku);
      if (!peca) {
        linhas.push({ sku, encontrado: false, erro: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });
        continue;
      }
      const qtdDisponivel = peca.estoque;

      // Sem fotos na pasta oficial a linha fica bloqueada na tela: nao gasta chamadas na Nuvemshop (429).
      if (!peca.fotosOficiais) {
        linhas.push({
          sku, origem: peca.origem, fotosProcessadas: false, fotosQtd: 0, encontrado: true,
          descricao: peca.descricao, moto: peca.moto, preco: Number(peca.precoML || 0),
          estoque: qtdDisponivel, nuvemshopItemId: null, jaTemAnuncio: false, categoriaAtual: null, categoriaPendente: false,
        });
        continue;
      }

      let produtoId: string | null = peca.nuvemshopProdutoId;
      let erroConsulta = '';
      if (!produtoId) {
        // A Nuvemshop limita as chamadas (429 "Too Many Requests"): consulta 1 SKU por vez, com uma
        // pausa curta entre elas e 1 nova tentativa se ainda assim estourar o limite.
        for (let tentativa = 0; tentativa < 2; tentativa++) {
          try {
            const existente: any = await buscarProdutoNuvemshopPorSku(sku, true);
            if (existente?.id) produtoId = String(existente.id);
            erroConsulta = '';
            break;
          } catch (e: any) {
            erroConsulta = e?.message || 'Falha ao consultar a Nuvemshop';
            if (!/429/.test(erroConsulta)) break;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      let categoriaId: string | null = peca.nuvemshopCategoriaId ? String(peca.nuvemshopCategoriaId) : null;
      if (!categoriaId) categoriaId = await sugerirNuvemshopCategoriaId(peca.descricao, peca.tipoPecaAvulsa).catch(() => null);
      const cat = categoriaId ? porId.get(Number(categoriaId)) : null;

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
        nuvemshopItemId: produtoId,
        jaTemAnuncio: !!produtoId,
        erroConsulta: erroConsulta || undefined,
        categoriaAtual: cat ? {
          id: cat.id,
          nivel4: cat.nome,
          caminho: cat.caminho,
          permitido: true,
          generica: /^outr[ao]s/i.test(cat.nome),
        } : null,
        categoriaPendente: !cat,
      });
    }

    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

// Descricao em HTML: usa a descricao curta do Bling (mesma fonte do Magalu/Shopee); sem Bling, texto
// proprio com dados da peca. Quebras de linha viram <br>.
async function montarDescricaoNuvemshop(peca: any, sku: string) {
  let texto = '';
  try {
    const produtos = await findBlingProductsByCodes([sku], { forceRefresh: true });
    const produtoBling = produtos.get(sku);
    if (produtoBling?.id) {
      const detail: any = await fetchBlingProductDetailById(Number(produtoBling.id), { forceRefresh: true });
      texto = htmlParaTextoSimples(detail?.descricaoCurta || produtoBling?.descricaoCurta || '');
    }
  } catch {
    // Bling fora do ar nao trava a criacao.
  }
  if (!texto) {
    const moto = peca.moto || {};
    const motoTexto = [moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ');
    texto = [
      String(peca.descricao || ''),
      motoTexto ? `Moto/Modelo: ${motoTexto}` : '',
      peca.numeroPeca ? `Código da peça (PN): ${peca.numeroPeca}` : '',
      'Peça original, em bom estado de conservação. Consulte as fotos antes de comprar.',
    ].filter(Boolean).join('\n');
  }
  return escaparHtml(texto).replace(/\r?\n/g, '<br>');
}

// POST /nuvemshop/anuncio/criar — body: { sku, categoriaId, publicar? }. Cria o produto PUBLICADO por
// padrao (decisao do Bruno em 2026-10-05; `publicar: false` cria oculto) com categorias [pai, filha],
// tags, 1 variante (preco/estoque/peso/dimensoes) e a foto de capa; grava o ID na Peca e avisa o Bling.
// As demais fotos ficam pra aba Fotos Anuncios. Mudar a visibilidade depois: /anuncio/ativar.
nuvemshopAnuncioRouter.post('/anuncio/criar', async (req, res, next) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    const categoriaId = String(req.body?.categoriaId || '').trim();
    const publicar = req.body?.publicar === false ? false : true;
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId obrigatorio (escolha a categoria da Nuvemshop).' });

    const peca = await carregarAnuncioBase(sku);
    if (!peca) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro)' });
    exigirFotosOficiais(peca);
    if (peca.nuvemshopProdutoId) return res.status(400).json({ error: `SKU ja possui produto na Nuvemshop (ID ${peca.nuvemshopProdutoId}).` });

    const qtdDisponivel = peca.estoque;
    if (!qtdDisponivel) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU' });

    const peso = peca.pesoLiquido != null ? Number(peca.pesoLiquido) : (peca.pesoBruto != null ? Number(peca.pesoBruto) : 0);
    if (!peso) return res.status(400).json({ error: 'SKU sem peso cadastrado.' });
    if (!peca.largura || !peca.altura || !peca.profundidade) return res.status(400).json({ error: 'SKU sem dimensoes completas (largura/altura/profundidade) cadastradas.' });
    if (!Number(peca.precoML)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });

    // Nao duplica: produto ja existente na loja (criado pelo Bling/manual) vira "ja possui".
    const existente: any = await buscarProdutoNuvemshopPorSku(sku, true);
    if (existente?.id) return res.status(400).json({ error: `Ja existe produto com esse SKU na Nuvemshop (ID ${existente.id}) — nao e' possivel recriar.` });

    // O produto nasce INATIVO no Bling (pre-cadastro): ativa antes de criar o anuncio.
    await garantirProdutoAtivoNoBling(peca);

    const drive = await buscarFotosDriveSku(peca.motoId, sku);
    const fotoCapa = drive.fotos[0];
    if (!fotoCapa) return res.status(400).json({ error: 'Nenhuma foto encontrada no Drive pra esse SKU — o SKU precisa de pelo menos 1 imagem.' });
    const imagemUrl = `${getBackendBase()}/magalu/imagem/${encodeURIComponent(fotoCapa.id)}`;

    // Tags: gravadas no pre-cadastro; se faltarem (SKU antigo ou IA ainda em andamento), gera agora.
    let tags = String(peca.nuvemshopTags || '').trim();
    if (!tags) {
      // Condicao do Bling (e' ela que o "Ajustar titulo / condicao" da tela altera); cai pra do cadastro se o Bling falhar.
      const condicaoBling = await lerDadosBlingSku(peca).then((d) => d.condicao).catch(() => null);
      tags = await gerarTagsNuvemshop({ sku, titulo: peca.descricao, moto: peca.moto, numeroPeca: peca.numeroPeca, condicao: condicaoBling || peca.condicao });
    }

    const categorias = await nuvemshopCategoriasDoProduto(categoriaId);
    const description = await montarDescricaoNuvemshop(peca, sku);

    const produto: any = await nuvemReq('/products', {
      method: 'POST',
      timeoutMs: 50000,
      body: JSON.stringify({
        name: { pt: String(peca.descricao || sku).slice(0, 250) },
        description: { pt: description },
        published: publicar,
        brand: peca.moto?.marca || undefined,
        tags,
        categories: categorias,
        variants: [{
          price: Number(peca.precoML).toFixed(2),
          stock: qtdDisponivel,
          sku,
          weight: String(peso),
          width: String(Number(peca.largura)),
          height: String(Number(peca.altura)),
          depth: String(Number(peca.profundidade)),
        }],
        images: [{ src: imagemUrl }],
      }),
    });

    const produtoId = String(produto?.id || '');
    if (!produtoId) return res.status(502).json({ error: 'A Nuvemshop nao devolveu o ID do produto criado.' });

    // Grava no pre-cadastro e nas pecas (as que existirem) antes de avisar o Bling.
    await gravarIdsAnuncio(sku, { nuvemshopProdutoId: produtoId, nuvemshopCategoriaId: categoriaId, nuvemshopTags: tags });

    let blingAvisado = false;
    let blingErro = '';
    try {
      await informarAnuncioNuvemshopNoBling(sku, produtoId);
      blingAvisado = true;
    } catch (e: any) {
      blingErro = e?.message || 'Falha ao avisar o Bling';
    }

    res.json({
      ok: true,
      sku,
      nuvemshopItemId: produtoId,
      nuvemshopProdutoId: produtoId,
      publicado: publicar,
      imagens: 1,
      tags,
      blingAvisado,
      blingErro: blingErro || undefined,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao criar produto na Nuvemshop' });
  }
});

// POST /nuvemshop/anuncio/ativar — body: { sku, publicar?: boolean (padrao true) }. Publica (ou oculta
// de novo) o produto ja criado: PUT /products/:id { published }.
nuvemshopAnuncioRouter.post('/anuncio/ativar', async (req, res) => {
  try {
    const sku = getBaseSku(req.body?.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const publicar = req.body?.publicar === false ? false : true;

    const peca = await carregarAnuncioBase(sku);
    let produtoId = String(req.body?.produtoId || peca?.nuvemshopProdutoId || '').trim();
    if (!produtoId) {
      const existente: any = await buscarProdutoNuvemshopPorSku(sku, true);
      produtoId = existente?.id ? String(existente.id) : '';
    }
    if (!produtoId) return res.status(404).json({ error: 'Produto nao encontrado na Nuvemshop pra esse SKU.' });

    const atualizado: any = await nuvemReq(`/products/${encodeURIComponent(produtoId)}`, {
      method: 'PUT',
      body: JSON.stringify({ published: publicar }),
    });
    res.json({ ok: true, sku, produtoId, publicado: atualizado?.published === true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao atualizar a visibilidade do produto' });
  }
});

// GET /nuvemshop/anuncio/status?sku= — estado atual do produto na loja (publicado, estoque, imagens, tags).
nuvemshopAnuncioRouter.get('/anuncio/status', async (req, res) => {
  try {
    const sku = getBaseSku(req.query.sku);
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    const peca = await carregarAnuncioBase(sku);
    const produtoId = String(peca?.nuvemshopProdutoId || '').trim();
    const p: any = produtoId
      ? await nuvemReq(`/products/${encodeURIComponent(produtoId)}`)
      : await buscarProdutoNuvemshopPorSku(sku, true);
    if (!p?.id) return res.status(404).json({ error: 'Produto nao encontrado na Nuvemshop.' });
    res.json({
      ok: true,
      sku,
      produtoId: p.id,
      publicado: p.published === true,
      imagens: (p.images || []).length,
      categorias: (p.categories || []).map((c: any) => String(c?.name?.pt || c?.id)),
      tags: p.tags || '',
      estoque: (p.variants || []).reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0),
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao consultar o produto' });
  }
});
