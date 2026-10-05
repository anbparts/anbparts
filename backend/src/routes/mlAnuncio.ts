// Criacao de anuncio no MERCADO LIVRE pela API de Anuncios do Bling (POST /anuncios, tipoIntegracao
// MercadoLivre) — o Bling ja esta ligado ao ML da conta (token, modalidade, frete ME2) e o anuncio
// nasce VINCULADO ao produto do Bling (estoque sincroniza sozinho; nao existe "avisar o Bling").
// Mesmo formato das rotas Shopee/Magalu/Nuvemshop pra alimentar a fila da aba Anuncio.
// Montado no prefixo /mercado-livre (ver server.ts), junto das rotas antigas do ML.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';
import { buscarFotosDriveSku } from '../lib/fotos-cadastro';
import { carregarAnuncioBase, skuBaseAnuncio, type AnuncioBase } from '../lib/anuncioBase';
import { exigirFotosOficiais, garantirProdutoAtivoNoBling, lerDadosBlingSku, resolverBlingProdutoId } from '../lib/anuncioPreparar';
import { carregarFolhasMoto, sugerirCategoriaML, verificarCategoriaML, ML_LOJA_BLING_ID } from '../lib/mlCategorias';

export const mlAnuncioRouter = Router();

const MODALIDADE_ML = 'gold_pro'; // "Premium" — igual aos anuncios que o Bling cria hoje
const ML_EMPTY_GTIN_REASON_SEM_GTIN = '17055161'; // valor "O produto nao tem GTIN" (igual aos anuncios existentes)

function getBackendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function toTitleCase(s: string) {
  return String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deposito padrao do Bling ("Geral"), pra vincular o estoque do anuncio.
let cacheDeposito: { id: number; expira: number } | null = null;
async function depositoPadraoBling(): Promise<number | null> {
  if (cacheDeposito && cacheDeposito.expira > Date.now()) return cacheDeposito.id;
  try {
    const r = await blingReq('/depositos?limite=50') as any;
    const lista: any[] = Array.isArray(r?.data) ? r.data : [];
    const d = lista.find((x) => x.padrao) || lista.find((x) => Number(x.situacao) === 1) || lista[0];
    if (d?.id) { cacheDeposito = { id: Number(d.id), expira: Date.now() + 6 * 3600 * 1000 }; return Number(d.id); }
  } catch { /* segue sem deposito */ }
  return null;
}

// Anuncio ja existente desse produto no ML (pelo ID gravado na peca ou pelo Bling).
async function anuncioMLExistente(base: AnuncioBase): Promise<{ mlId: string | null; blingAnuncioId: string | null } | null> {
  const peca: any = await prisma.peca.findFirst({
    where: { OR: [{ idPeca: base.idPeca }, { idPeca: { startsWith: `${base.idPeca}-` } }] },
    select: { mercadoLivreItemId: true },
  });
  if (peca?.mercadoLivreItemId) return { mlId: String(peca.mercadoLivreItemId), blingAnuncioId: null };
  try {
    const id = await resolverBlingProdutoId(base);
    const r = await blingReq(`/anuncios?idProduto=${id}&limite=5&tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
    const a = (Array.isArray(r?.data) ? r.data : [])[0];
    if (a?.id) return { mlId: a.anuncioLoja?.id ? String(a.anuncioLoja.id) : null, blingAnuncioId: String(a.id) };
  } catch { /* produto sem vinculo no Bling ainda */ }
  return null;
}

async function categoriaDoPreCadastro(sku: string) {
  const c: any = await (prisma as any).cadastroPeca.findUnique({ where: { idPeca: sku }, select: { categoriaMLId: true, categoriaMLNome: true } }).catch(() => null);
  return c?.categoriaMLId ? { id: String(c.categoriaMLId), nome: String(c.categoriaMLNome || '') } : null;
}

// GET /mercado-livre/anuncio/categorias — categorias-folha de moto (pro modal "Trocar categoria").
mlAnuncioRouter.get('/anuncio/categorias', async (_req, res, next) => {
  try {
    const folhas = await carregarFolhasMoto();
    res.json({
      ok: true,
      categorias: folhas.map((f) => {
        const partes = f.caminho.split(' > ');
        return {
          id: f.id,
          categoria: partes[0] || f.nome,
          subcategoria: partes[1] || '',
          nivel3: partes.length > 3 ? partes[2] : '',
          nivel4: f.nome,
          permitido: true,
          caminho: f.caminho,
          generica: /^outros$/i.test(f.nome),
        };
      }),
    });
  } catch (e) { next(e); }
});

// GET /mercado-livre/anuncio/verificar-categoria?id=&condicao=usado|novo — restricoes da categoria.
mlAnuncioRouter.get('/anuncio/verificar-categoria', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatorio' });
    const condicao = String(req.query.condicao || '').toLowerCase() === 'novo' ? 'novo' : 'usado';
    const ver = await verificarCategoriaML(id, condicao);
    res.json({ consulta: 'ok', ...ver });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao verificar a categoria' });
  }
});

// POST /mercado-livre/anuncio/buscar — body: { skus }. Sugere a categoria (IA entre as categorias de
// moto) e ja devolve as RESTRICOES dela, pra tela avisar e o Bruno ajustar antes de criar.
mlAnuncioRouter.post('/anuncio/buscar', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => skuBaseAnuncio(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    await carregarFolhasMoto().catch(() => null); // aquece o espelho (1x)

    const linhas: any[] = new Array(skus.length);
    let cursor = 0;
    const trabalhar = async () => {
      while (cursor < skus.length) {
        const i = cursor++;
        const sku = skus[i];
        const base = await carregarAnuncioBase(sku);
        if (!base) { linhas[i] = { sku, encontrado: false, erro: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' }; continue; }

        const condicao: 'usado' | 'novo' = String(base.condicao || '').toLowerCase() === 'novo' ? 'novo' : 'usado';
        const linha: any = {
          sku,
          origem: base.origem,
          fotosProcessadas: base.fotosOficiais > 0,
          fotosQtd: base.fotosOficiais,
          encontrado: true,
          descricao: base.descricao,
          moto: base.moto,
          preco: Number(base.precoML || 0),
          peso: base.pesoLiquido ?? base.pesoBruto ?? null,
          largura: base.largura,
          altura: base.altura,
          profundidade: base.profundidade,
          estoque: base.estoque,
          condicao,
        };

        // Sem fotos na pasta oficial a linha e' bloqueada na tela: nao gasta IA/Bling a toa.
        if (!linha.fotosProcessadas) { linha.jaTemAnuncio = false; linha.categoriaAtual = null; linha.categoriaPendente = false; linhas[i] = linha; continue; }

        const existente = await anuncioMLExistente(base);
        linha.jaTemAnuncio = !!existente;
        linha.mercadoLivreItemId = existente?.mlId || existente?.blingAnuncioId || null;
        if (existente) { linha.categoriaAtual = null; linha.categoriaPendente = false; linhas[i] = linha; continue; }

        const pre = await categoriaDoPreCadastro(sku);
        linha.categoriaPreCadastro = pre;
        try {
          const sug = await sugerirCategoriaML({ titulo: base.descricao, marca: base.moto?.marca, modelo: base.moto?.modelo, condicao });
          if (sug) {
            const ver = await verificarCategoriaML(sug.id, condicao);
            linha.categoriaAtual = { id: sug.id, nivel4: sug.nome, caminho: sug.caminho, permitido: ver.ok, generica: /^outros$/i.test(sug.nome) };
            linha.restricoes = ver.restricoes;
            linha.avisos = ver.avisos;
            linha.sugestaoOrigem = sug.origem;
            linha.sugestaoConfianca = sug.confianca;
            linha.alternativas = sug.alternativas;
            linha.categoriaPendente = false;
          } else {
            linha.categoriaAtual = null;
            linha.categoriaPendente = true;
          }
        } catch (e: any) {
          linha.categoriaAtual = null;
          linha.categoriaPendente = true;
          linha.erroCategoria = e?.message || 'Falha ao sugerir categoria';
        }
        linhas[i] = linha;
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, skus.length) }, () => trabalhar()));

    res.json({ ok: true, linhas });
  } catch (e) { next(e); }
});

// POST /mercado-livre/anuncio/criar — body: { sku, categoriaId }. Ativa o produto no Bling, cria o
// anuncio (POST /anuncios), publica, e espera o ID do ML (MLB...) aparecer no vinculo.
mlAnuncioRouter.post('/anuncio/criar', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.body?.sku);
    const categoriaId = String(req.body?.categoriaId || '').trim();
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!categoriaId) return res.status(400).json({ error: 'categoriaId obrigatorio (escolha a categoria do Mercado Livre).' });

    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });
    exigirFotosOficiais(base);

    if (!base.estoque) return res.status(400).json({ error: 'Nenhuma unidade disponivel em estoque pra esse SKU.' });
    const peso = base.pesoLiquido ?? base.pesoBruto ?? 0;
    if (!peso) return res.status(400).json({ error: 'SKU sem peso cadastrado.' });
    if (!base.largura || !base.altura || !base.profundidade) return res.status(400).json({ error: 'SKU sem dimensoes completas (largura/altura/profundidade).' });
    if (!Number(base.precoML)) return res.status(400).json({ error: 'SKU sem preco cadastrado.' });
    if (!base.numeroPeca) return res.status(400).json({ error: 'SKU sem numero da peca (PART_NUMBER e obrigatorio nas categorias de peca de moto).' });

    const existente = await anuncioMLExistente(base);
    if (existente) return res.status(400).json({ error: `SKU ja possui anuncio no Mercado Livre (${existente.mlId || `anuncio Bling ${existente.blingAnuncioId}`}) — nao e' possivel recriar.` });

    // 1) O produto nasce INATIVO no Bling (pre-cadastro): ativa primeiro.
    const { id: blingProdutoId } = await garantirProdutoAtivoNoBling(base);

    // 2) Valores que o ML vai receber (do produto do Bling: titulo, texto e condicao).
    const dados = await lerDadosBlingSku({ idPeca: base.idPeca, blingProdutoId });

    // 3) Restricoes da categoria escolhida (bloqueia aqui tambem, nao so na tela).
    const ver = await verificarCategoriaML(categoriaId, dados.condicao);
    if (!ver.ok) return res.status(400).json({ error: `Categoria com restricao: ${ver.restricoes.join(' | ')}` });

    // 4) 1 foto de capa da pasta oficial (as demais ficam pro Fotos Anuncios).
    const drive = await buscarFotosDriveSku(base.motoId, base.idPeca);
    const capa = drive.fotos[0];
    if (!capa) return res.status(400).json({ error: 'Nenhuma foto encontrada na pasta oficial do SKU.' });
    const imagemUrl = `${getBackendBase()}/magalu/imagem/${encodeURIComponent(capa.id)}`;

    const deposito = await depositoPadraoBling();
    const marca = toTitleCase(base.moto?.marca || '');
    const atributos: Array<{ id: string; valor: string }> = [
      { id: 'BRAND', valor: marca || 'Generico' },
      { id: 'PART_NUMBER', valor: String(base.numeroPeca) },
      { id: 'EMPTY_GTIN_REASON', valor: ML_EMPTY_GTIN_REASON_SEM_GTIN },
      { id: 'SELLER_PACKAGE_WIDTH', valor: `${Math.round(Number(base.largura))} cm` },
      { id: 'SELLER_PACKAGE_LENGTH', valor: `${Math.round(Number(base.profundidade))} cm` },
      { id: 'SELLER_PACKAGE_HEIGHT', valor: `${Math.round(Number(base.altura))} cm` },
      { id: 'SELLER_PACKAGE_WEIGHT', valor: `${Math.round(Number(peso) * 1000)} g` },
    ];

    const payload: any = {
      produto: { id: Number(blingProdutoId) },
      integracao: { tipo: 'MercadoLivre' },
      loja: { id: ML_LOJA_BLING_ID },
      nome: dados.titulo.slice(0, 60),
      descricao: dados.descricao || dados.titulo,
      preco: { valor: Number(base.precoML) },
      categoria: { id: categoriaId },
      atributos,
      imagens: [{ url: imagemUrl, ordem: 1 }],
      mercadoLivre: { modalidade: MODALIDADE_ML },
      ...(deposito ? { estoques: { itens: [deposito] } } : {}),
    };

    const criado = await blingReq('/anuncios', { method: 'POST', body: JSON.stringify(payload) }) as any;
    const anuncioBlingId = criado?.data?.id != null ? String(criado.data.id) : '';
    if (!anuncioBlingId) return res.status(502).json({ error: 'O Bling nao devolveu o ID do anuncio criado.', resposta: criado });

    // 5) Publica (se o Bling ja nao publicou sozinho, o erro aqui nao derruba a criacao).
    let aviso = '';
    try {
      await blingReq(`/anuncios/${anuncioBlingId}/publicar?tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`, { method: 'POST', body: JSON.stringify({}) });
    } catch (e: any) {
      // Mostra os motivos de verdade (fields[].msg do Bling), nao o JSON cortado.
      const bruto = String(e?.message || e);
      let motivos = '';
      try {
        const j = JSON.parse(bruto.slice(bruto.indexOf('{')));
        const campos = Array.isArray(j?.error?.fields) ? j.error.fields : [];
        motivos = campos.map((f: any) => [f?.element, f?.msg || f?.message].filter(Boolean).join(': ')).filter(Boolean).join(' | ');
        if (!motivos) motivos = j?.error?.description || '';
      } catch { /* mantem o texto bruto */ }
      console.warn(`[mlAnuncio] publicar ${base.idPeca} (anuncio Bling ${anuncioBlingId}) falhou: ${bruto}`);
      aviso = `Anuncio criado no Bling, mas a publicacao automatica falhou: ${(motivos || bruto).slice(0, 1200)}`;
    }

    // 6) Espera o ID do ML (MLB...) aparecer no anuncio do Bling (tempo curto: o proxy limita a 30s).
    let mlId = '';
    for (let tentativa = 0; tentativa < 4 && !mlId; tentativa++) {
      await dormir(2500);
      try {
        const a = await blingReq(`/anuncios/${anuncioBlingId}?tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
        const id = a?.data?.anuncioLoja?.id;
        if (id) mlId = String(id);
      } catch { /* tenta de novo */ }
    }
    if (mlId) {
      await prisma.peca.updateMany({
        where: { OR: [{ idPeca: base.idPeca }, { idPeca: { startsWith: `${base.idPeca}-` } }] },
        data: { mercadoLivreItemId: mlId } as any,
      });
    } else if (!aviso) {
      aviso = 'Anúncio criado no Bling; o ID do Mercado Livre ainda está sendo gerado — confira na tela de Anúncios do Bling.';
    }

    res.json({
      ok: true,
      sku: base.idPeca,
      mercadoLivreItemId: mlId || null,
      anuncioBlingId,
      categoriaId,
      fotosEnviadas: 1,
      publicado: !aviso || !!mlId,
      aviso: aviso || undefined,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao criar anuncio no Mercado Livre' });
  }
});

// GET /mercado-livre/anuncio/diagnostico?anuncio=<id Bling>&categoria=<MLB...> — devolve o JSON CRU do Bling
// (anuncio e/ou categoria) pra descobrir nomes de campos (ex: metodo de envio) sem chutar.
mlAnuncioRouter.get('/anuncio/diagnostico', async (req, res) => {
  try {
    const q = `tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`;
    const out: any = {};
    const anuncio = String(req.query.anuncio || '').trim();
    const categoria = String(req.query.categoria || '').trim();
    if (anuncio) out.anuncio = await blingReq(`/anuncios/${encodeURIComponent(anuncio)}?${q}`).catch((e: any) => ({ erro: e?.message }));
    if (categoria) out.categoria = await blingReq(`/anuncios/categorias/${encodeURIComponent(categoria)}?${q}`).catch((e: any) => ({ erro: e?.message }));
    res.json(out);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro no diagnostico' });
  }
});
