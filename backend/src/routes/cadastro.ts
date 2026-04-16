import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';

export const cadastroRouter = Router();

const BLING_NUMERO_PECA_CAMPO_ID = 2821431;
const BLING_DETRAN_CAMPO_ID = 5979929;
const BLING_MARCA_CAMPO_ID = 2821430;
const BLING_URL_REF_CAMPO_ID = 3066410;
const BLING_CATEGORIA_ID = 10703871;

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function gerarIdsPeca(baseSku: string, quantidade: number): string[] {
  if (quantidade <= 1) return [baseSku];
  return [baseSku, ...Array.from({ length: quantidade - 1 }, (_, i) => `${baseSku}-${i + 2}`)];
}

async function buildBlingPayload(cadastro: any, isUpdate: boolean) {
  const camposCustomizados: any[] = [];
  if (cadastro.numeroPeca) camposCustomizados.push({ idCampoCustomizado: BLING_NUMERO_PECA_CAMPO_ID, valor: cadastro.numeroPeca });
  if (cadastro.detranEtiqueta) camposCustomizados.push({ idCampoCustomizado: BLING_DETRAN_CAMPO_ID, valor: cadastro.detranEtiqueta });
  if (cadastro.moto?.marca) camposCustomizados.push({ idCampoCustomizado: BLING_MARCA_CAMPO_ID, valor: toTitleCase(cadastro.moto.marca) });
  if (cadastro.urlRef) camposCustomizados.push({ idCampoCustomizado: BLING_URL_REF_CAMPO_ID, valor: String(cadastro.urlRef) });

  const payload: any = {
    nome: cadastro.descricao,
    codigo: cadastro.idPeca,
    preco: Number(cadastro.precoVenda),
    tipo: 'P',
    formato: 'S',
    situacao: isUpdate ? 'A' : 'I',
    condicao: cadastro.condicao === 'novo' ? 1 : 2, // 1=Novo, 2=Usado (0=Não especificado)
    descricaoCurta: (cadastro.descricaoPeca || '').replace(/\r\n/g, '<br>').replace(/\n/g, '<br>'),
    marca: toTitleCase(cadastro.moto?.marca || ''),
    volumes: 1,
    pesoLiquido: Number(cadastro.peso || 0),
    pesoBruto: Number(cadastro.peso || 0),
    dimensoes: {
      largura: Number(cadastro.largura || 0),
      altura: Number(cadastro.altura || 0),
      profundidade: Number(cadastro.profundidade || 0),
      unidadeMedida: 2,
    },
    estoque: {
      minimo: Number(cadastro.estoque),
      maximo: Number(cadastro.estoque),
      localizacao: cadastro.localizacao || '',
    },
    categoria: { id: BLING_CATEGORIA_ID },
    tributacao: { ncm: '87141000' },
  };

  if (camposCustomizados.length) payload.camposCustomizados = camposCustomizados;
  return payload;
}

async function enviarParaBling(cadastro: any) {
  const isUpdate = !!cadastro.blingProdutoId;
  const payload = await buildBlingPayload(cadastro, isUpdate);

  let blingResp: any;
  let blingProdutoId = cadastro.blingProdutoId || '';

  if (isUpdate) {
    blingResp = await blingReq(`/produtos/${blingProdutoId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    blingResp = await blingReq('/produtos', { method: 'POST', body: JSON.stringify(payload) });
    blingProdutoId = String(blingResp?.data?.id || '');
  }

  // Estoque
  if (blingProdutoId && Number(cadastro.estoque) > 0) {
    try {
      const estoquePayload: any = {
        produto: { id: Number(blingProdutoId) },
        operacao: 'B',
        preco: Number(cadastro.precoVenda) || 0,
        custo: 0,
        quantidade: Number(cadastro.estoque),
        observacoes: `Estoque inicial - ${cadastro.idPeca}`,
      };
      try {
        const dep = await blingReq('/depositos?pagina=1&limite=1&situacoes[]=1');
        const depId = Number(dep?.data?.[0]?.id || 0);
        if (depId) estoquePayload.deposito = { id: depId };
      } catch { /* sem permissão */ }
      await blingReq('/estoques', { method: 'POST', body: JSON.stringify(estoquePayload) });
    } catch (e: any) { console.error('[cadastro] Erro estoque:', e?.message); }
  }

  return blingProdutoId;
}

// GET /cadastro
cadastroRouter.get('/', async (req, res, next) => {
  try {
    const { status, motoId, search, semDimensoes, semNumeroPeca, page = '1', per = '200', somentePendentes } = req.query as any;
    const where: any = {};

    if (somentePendentes === 'true') {
      where.status = { not: 'cadastrado' };
    } else if (status) {
      where.status = status;
    }
    if (motoId) where.motoId = Number(motoId);
    if (search) {
      where.OR = [
        { idPeca: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (semDimensoes === 'true') {
      where.OR = [...(where.OR || []), { largura: null }, { largura: 0 }, { altura: null }, { altura: 0 }, { profundidade: null }, { profundidade: 0 }];
    }
    if (semNumeroPeca === 'true') where.numeroPeca = null;

    const skip = (Number(page) - 1) * Number(per);
    const [total, data] = await Promise.all([
      prisma.cadastroPeca.count({ where }),
      prisma.cadastroPeca.findMany({
        where,
        include: { moto: { select: { id: true, marca: true, modelo: true, ano: true, descricaoModelo: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(per),
      }),
    ]);

    res.json({ total, data });
  } catch (e) { next(e); }
});

// GET /cadastro/proximo-id/:motoId
cadastroRouter.get('/proximo-id/:motoId', async (req, res, next) => {
  try {
    const motoId = Number(req.params.motoId);
    const cfg = await prisma.blingConfig.findFirst();
    const prefixos: any[] = (cfg?.prefixos as any) || [];
    const prefixoObj = prefixos.find((p: any) => Number(p.motoId) === motoId);
    const prefixo = prefixoObj?.prefixo ? String(prefixoObj.prefixo).toUpperCase().trim() : null;
    if (!prefixo) return res.json({ prefixo: null, proximo: null, sugestao: null });

    const [pecas, cadastros] = await Promise.all([
      prisma.peca.findMany({ where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] }, select: { idPeca: true } }),
      prisma.cadastroPeca.findMany({ where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] }, select: { idPeca: true } }),
    ]);

    const todos = [...pecas, ...cadastros].map((p) => p.idPeca);
    let maiorNum = 0;
    for (const id of todos) {
      const match = id.match(/_(\d+)/);
      if (match) { const num = parseInt(match[1], 10); if (num > maiorNum) maiorNum = num; }
    }

    const proximo = maiorNum + 1;
    const sugestao = `${prefixo}_${String(proximo).padStart(4, '0')}`;
    res.json({ prefixo, proximo, sugestao });
  } catch (e) { next(e); }
});

// POST /cadastro - criar pré-cadastro e enviar ao Bling
cadastroRouter.post('/', async (req, res, next) => {
  try {
    const { motoId, idPeca, descricao, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, detranEtiqueta, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;

    if (!motoId || !idPeca || !descricao) return res.status(400).json({ error: 'motoId, idPeca e descricao sao obrigatorios' });

    const existing = await prisma.cadastroPeca.findUnique({ where: { idPeca } });
    if (existing) return res.status(400).json({ error: 'ID de peça já existe no cadastro' });

    const record = await prisma.cadastroPeca.create({
      data: {
        motoId: Number(motoId),
        idPeca: String(idPeca).toUpperCase().trim(),
        descricao: String(descricao).trim().slice(0, 60),
        descricaoPeca: descricaoPeca ? String(descricaoPeca).trim() : null,
        precoVenda: Number(precoVenda) || 0,
        condicao: condicao || 'usado',
        peso: peso != null ? Number(peso) : null,
        largura: largura != null ? Number(largura) : null,
        altura: altura != null ? Number(altura) : null,
        profundidade: profundidade != null ? Number(profundidade) : null,
        numeroPeca: numeroPeca ? String(numeroPeca).trim() : null,
        detranEtiqueta: detranEtiqueta ? String(detranEtiqueta).trim() : null,
        localizacao: localizacao ? String(localizacao).trim() : null,
        estoque: Number(estoque) || 1,
        categoriaMLId: categoriaMLId || null,
        categoriaMLNome: categoriaMLNome || null,
        urlRef: urlRef ? String(urlRef).trim() : null,
        status: 'pre_cadastro',
      },
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    // Enviar ao Bling
    try {
      const blingProdutoId = await enviarParaBling(record);
      const updated = await prisma.cadastroPeca.update({ where: { id: record.id }, data: { blingProdutoId } });
      res.status(201).json({ ...updated, _blingOk: true });
    } catch (blingErr: any) {
      res.status(201).json({ ...record, _blingOk: false, _blingErro: blingErr?.message });
    }
  } catch (e) { next(e); }
});

// PUT /cadastro/:id
cadastroRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const atual = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!atual) return res.status(404).json({ error: 'Não encontrado' });
    if (atual.status === 'cadastrado') return res.status(400).json({ error: 'Cadastro já finalizado — não é possível editar' });

    const { descricao, descricaoPeca, precoVenda, condicao, peso, largura, altura, profundidade, numeroPeca, detranEtiqueta, localizacao, estoque, categoriaMLId, categoriaMLNome, urlRef } = req.body;
    const data: any = {};
    if (descricao !== undefined) data.descricao = String(descricao).trim().slice(0, 60);
    if (descricaoPeca !== undefined) data.descricaoPeca = descricaoPeca || null;
    if (precoVenda !== undefined) data.precoVenda = Number(precoVenda);
    if (condicao !== undefined) data.condicao = condicao;
    if (peso !== undefined) data.peso = peso != null ? Number(peso) : null;
    if (largura !== undefined) data.largura = largura != null ? Number(largura) : null;
    if (altura !== undefined) data.altura = altura != null ? Number(altura) : null;
    if (profundidade !== undefined) data.profundidade = profundidade != null ? Number(profundidade) : null;
    if (numeroPeca !== undefined) data.numeroPeca = numeroPeca || null;
    if (detranEtiqueta !== undefined) data.detranEtiqueta = detranEtiqueta || null;
    if (localizacao !== undefined) data.localizacao = localizacao || null;
    if (estoque !== undefined) data.estoque = Number(estoque);
    if (categoriaMLId !== undefined) data.categoriaMLId = categoriaMLId || null;
    if (categoriaMLNome !== undefined) data.categoriaMLNome = categoriaMLNome || null;
    if (urlRef !== undefined) data.urlRef = urlRef || null;

    const record = await prisma.cadastroPeca.update({
      where: { id },
      data,
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    // Re-enviar ao Bling
    try {
      await enviarParaBling(record);
      res.json({ ...record, _blingOk: true });
    } catch (blingErr: any) {
      res.json({ ...record, _blingOk: false, _blingErro: blingErr?.message });
    }
  } catch (e) { next(e); }
});

// POST /cadastro/:id/finalizar — busca dados do Bling e lança no estoque
cadastroRouter.post('/:id/finalizar', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cadastro = await prisma.cadastroPeca.findUnique({
      where: { id },
      include: { moto: { select: { id: true, marca: true, modelo: true } } },
    });
    if (!cadastro) return res.status(404).json({ error: 'Não encontrado' });
    if (!cadastro.blingProdutoId) return res.status(400).json({ error: 'Produto não foi enviado ao Bling ainda' });

    // Busca dados atuais do produto no Bling
    const blingData = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
    const b = blingData?.data || {};

    // Busca link do anúncio ML no Bling
    let mercadoLivreLink: string | null = null;
    let mercadoLivreItemId: string | null = null;
    try {
      const lojaML = 205204423; // ID loja ML hardcoded
      const lojasData = await blingReq(`/produtos/lojas?pagina=1&limite=100&idProduto=${cadastro.blingProdutoId}`);
      const lojas = lojasData?.data || [];
      const lojaLink = lojas.find((l: any) => Number(l.loja?.id) === lojaML);
      if (lojaLink?.idAnuncio) {
        const anuncioData = await blingReq(`/anuncios/${lojaLink.idAnuncio}?tipoIntegracao=MercadoLivre&idLoja=${lojaML}`);
        const anuncio = anuncioData?.data;
        if (anuncio?.link) mercadoLivreLink = String(anuncio.link);
        if (anuncio?.idAnuncio) mercadoLivreItemId = String(anuncio.idAnuncio);
      }
    } catch { /* sem anuncio ainda */ }

    // Busca config de taxa e frete
    const cfgProdutos = await prisma.blingConfig.findFirst();
    const fretePadrao = Number((cfgProdutos as any)?.fretePadrao || 29.9);
    const taxaPadraoPct = Number((cfgProdutos as any)?.taxaPadraoPct || 17);

    const precoML = Number(b.preco || cadastro.precoVenda);
    const frete = req.body.frete != null ? Number(req.body.frete) : fretePadrao;
    const taxaPct = req.body.taxaPct != null ? Number(req.body.taxaPct) : taxaPadraoPct;
    const valorTaxas = parseFloat((precoML * taxaPct / 100).toFixed(2));
    const valorLiq = parseFloat((precoML - frete - valorTaxas).toFixed(2));

    // Monta diff entre Bling e ANB
    const diff: Record<string, { bling: any; anb: any }> = {};
    if (b.nome && b.nome !== cadastro.descricao) diff.descricao = { bling: b.nome, anb: cadastro.descricao };
    if (b.preco && Number(b.preco) !== Number(cadastro.precoVenda)) diff.precoVenda = { bling: b.preco, anb: cadastro.precoVenda };
    const bPeso = b.pesoLiquido || 0;
    if (bPeso && Number(bPeso) !== Number(cadastro.peso || 0)) diff.peso = { bling: bPeso, anb: cadastro.peso };
    const bLargura = b.dimensoes?.largura || 0;
    if (bLargura && Number(bLargura) !== Number(cadastro.largura || 0)) diff.largura = { bling: bLargura, anb: cadastro.largura };
    const bAltura = b.dimensoes?.altura || 0;
    if (bAltura && Number(bAltura) !== Number(cadastro.altura || 0)) diff.altura = { bling: bAltura, anb: cadastro.altura };
    const bProf = b.dimensoes?.profundidade || 0;
    if (bProf && Number(bProf) !== Number(cadastro.profundidade || 0)) diff.profundidade = { bling: bProf, anb: cadastro.profundidade };

    if (req.body.confirmar) {
      // Lança peças no estoque com sufixos
      const qtd = Number(b.estoque?.saldoVirtualTotal || cadastro.estoque || 1);
      const ids = gerarIdsPeca(cadastro.idPeca, qtd);
      const pecasCriadas = [];

      // Split etiquetas detran por variação: "SP001 / SP002 / SP003" → ['SP001', 'SP002', 'SP003']
      const etiquetasArray = cadastro.detranEtiqueta
        ? cadastro.detranEtiqueta.split('/').map((e: string) => e.trim()).filter(Boolean)
        : [];

      // Validação: se há etiquetas, deve bater com a quantidade
      if (etiquetasArray.length > 0 && etiquetasArray.length !== ids.length) {
        return res.status(400).json({
          ok: false,
          error: `Quantidade de etiquetas Detran (${etiquetasArray.length}) não bate com o estoque (${ids.length}). Corrija no pré-cadastro antes de finalizar.`,
        });
      }

      for (let i = 0; i < ids.length; i++) {
        const idPeca = ids[i];
        const existing = await prisma.peca.findUnique({ where: { idPeca } });
        if (existing) continue;
        const peca = await prisma.peca.create({
          data: {
            motoId: cadastro.motoId,
            idPeca,
            descricao: b.nome || cadastro.descricao,
            precoML,
            valorLiq,
            valorFrete: frete,
            valorTaxas,
            disponivel: true,
            emPrejuizo: false,
            localizacao: b.estoque?.localizacao || cadastro.localizacao || null,
            mercadoLivreLink: mercadoLivreLink || null,
            mercadoLivreItemId: mercadoLivreItemId || null,
            pesoLiquido: bPeso || Number(cadastro.peso || 0),
            pesoBruto: bPeso || Number(cadastro.peso || 0),
            largura: bLargura || Number(cadastro.largura || 0),
            altura: bAltura || Number(cadastro.altura || 0),
            profundidade: bProf || Number(cadastro.profundidade || 0),
            numeroPeca: cadastro.numeroPeca || null,
            // Cada variação recebe sua etiqueta, ou a concatenada se só há 1
            detranEtiqueta: etiquetasArray.length > 0 ? (etiquetasArray[i] || null) : null,
            cadastro: new Date(),
          },
        });
        pecasCriadas.push(peca);
      }

      await prisma.cadastroPeca.update({ where: { id }, data: { status: 'cadastrado' } });
      return res.json({ ok: true, pecasCriadas, diff });
    }

    // Só preview — retorna dados do Bling + diff + cálculo financeiro
    res.json({
      ok: true,
      preview: {
        descricao: b.nome || cadastro.descricao,
        precoML,
        frete,
        taxaPct,
        valorTaxas,
        valorLiq,
        peso: bPeso,
        largura: bLargura,
        altura: bAltura,
        profundidade: bProf,
        localizacao: b.estoque?.localizacao || cadastro.localizacao,
        estoque: b.estoque?.saldoVirtualTotal || cadastro.estoque,
        detranEtiqueta: cadastro.detranEtiqueta || null,
        fretePadrao,
        taxaPadraoPct,
        mercadoLivreLink,
        mercadoLivreItemId,
      },
      diff,
    });
  } catch (e) { next(e); }
});

// POST /cadastro/sync-bling-peca — atualiza campos físicos de uma peça diretamente no Bling
// Aceita blingProdutoId direto OU sku para buscar automaticamente
cadastroRouter.post('/sync-bling-peca', async (req, res, next) => {
  try {
    let { blingProdutoId, sku, largura, altura, profundidade, pesoLiquido, localizacao, detranEtiqueta, numeroPeca } = req.body;

    // Se veio SKU mas não blingProdutoId, resolve pelo CadastroPeca
    if (!blingProdutoId && sku) {
      const baseSku = String(sku).replace(/-\d+$/, '').toUpperCase().trim();
      const cadastro = await prisma.cadastroPeca.findFirst({
        where: { idPeca: { equals: baseSku, mode: 'insensitive' } },
        select: { blingProdutoId: true },
      });
      if (cadastro?.blingProdutoId) {
        blingProdutoId = cadastro.blingProdutoId;
      } else {
        // Tenta buscar direto no Bling pelo código/SKU
        const blingSearch = await blingReq(`/produtos?criterio=2&tipo=P&codigo=${encodeURIComponent(baseSku)}&pagina=1&limite=5`);
        const blingItems = blingSearch?.data || [];
        const found = blingItems.find((p: any) => String(p.codigo || '').toUpperCase() === baseSku);
        if (found) blingProdutoId = String(found.id);
      }
    }

    if (!blingProdutoId) {
      return res.status(404).json({ ok: false, error: `Produto não encontrado no Bling para SKU: ${sku}` });
    }

    // Busca produto atual no Bling para manter campos obrigatórios
    const blingAtual = await blingReq(`/produtos/${blingProdutoId}`);
    const b = blingAtual?.data;
    if (!b) return res.status(404).json({ error: 'Produto não encontrado no Bling' });

    // Monta payload usando os dados atuais do Bling como base
    // e sobrepõe apenas os campos que vieram na requisição
    const payload: any = {
      // Preserva todos os campos do Bling
      nome: b.nome,
      codigo: b.codigo,
      tipo: b.tipo || 'P',
      formato: b.formato || 'S',
      situacao: b.situacao || 'A',
      preco: Number(b.preco || 0),
      condicao: b.condicao ?? 0,
      marca: b.marca || '',
      pesoLiquido: pesoLiquido != null ? Number(pesoLiquido) : Number(b.pesoLiquido || 0),
      pesoBruto: pesoLiquido != null ? Number(pesoLiquido) : Number(b.pesoBruto || 0),
      volumes: b.volumes || 1,
      descricaoCurta: b.descricaoCurta || '',
      // Dimensões — sobrepõe só os que vieram
      dimensoes: {
        largura: largura != null ? Number(largura) : Number(b.dimensoes?.largura || 0),
        altura: altura != null ? Number(altura) : Number(b.dimensoes?.altura || 0),
        profundidade: profundidade != null ? Number(profundidade) : Number(b.dimensoes?.profundidade || 0),
        unidadeMedida: b.dimensoes?.unidadeMedida || 2,
      },
      // Estoque — só sobrepõe localização
      estoque: {
        minimo: Number(b.estoque?.minimo || 0),
        maximo: Number(b.estoque?.maximo || 0),
        localizacao: localizacao != null ? String(localizacao || '') : String(b.estoque?.localizacao || ''),
      },
    };

    // Campos customizados — merge com os existentes no Bling, sobrepõe só os que vieram
    const ccExistentes: any[] = Array.isArray(b.camposCustomizados) ? b.camposCustomizados : [];
    const ccMap = new Map(ccExistentes.map((c: any) => [Number(c.idCampoCustomizado), c.valor]));
    if (numeroPeca !== undefined) ccMap.set(2821431, numeroPeca || '');
    if (detranEtiqueta !== undefined) ccMap.set(5979929, detranEtiqueta || '');
    if (ccMap.size > 0) {
      payload.camposCustomizados = Array.from(ccMap.entries()).map(([id, valor]) => ({ idCampoCustomizado: id, valor }));
    }

    console.log('[sync-bling-peca] PUT produto', blingProdutoId);
    await blingReq(`/produtos/${blingProdutoId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[sync-bling-peca] Erro:', e?.message);
    res.status(400).json({ ok: false, error: e?.message });
  }
});

// DELETE /cadastro/:id
cadastroRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cadastro = await prisma.cadastroPeca.findUnique({ where: { id } });
    if (!cadastro) return res.status(404).json({ error: 'Não encontrado' });
    // Se forceDelete=true, pula a verificação do Bling
    const forceDelete = req.query.force === 'true';

    if (cadastro.blingProdutoId && !forceDelete) {
      let existeNoBling = false;
      let blingDebug: any = null;
      try {
        const blingCheck = await blingReq(`/produtos/${cadastro.blingProdutoId}`);
        blingDebug = blingCheck;
        // Bling pode retornar produto "inativo/excluído" com situacao='E' — não bloquear nesses casos
        const situacao = String(blingCheck?.data?.situacao || '');
        const temId = blingCheck?.data?.id && String(blingCheck.data.id) === String(cadastro.blingProdutoId);
        if (temId && situacao !== 'E' && situacao !== 'I') {
          existeNoBling = true;
        }
      } catch (e: any) {
        console.log('[cadastro delete] Bling check erro (produto não existe):', e?.message?.slice(0, 100));
        existeNoBling = false;
      }
      console.log('[cadastro delete] blingProdutoId:', cadastro.blingProdutoId, '| existeNoBling:', existeNoBling, '| debug:', JSON.stringify(blingDebug?.data?.situacao));
      if (existeNoBling) {
        return res.status(400).json({ error: 'Este pré-cadastro já foi replicado ao Bling e o produto ainda existe lá. Delete o produto no Bling primeiro, ou use a opção "Forçar exclusão".' });
      }
    }
    await prisma.cadastroPeca.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.get('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUnique({
      where: { id: Number(req.params.motoId) },
      select: { id: true, descricaoModelo: true },
    });
    res.json({ descricaoModelo: moto?.descricaoModelo || '' });
  } catch (e) { next(e); }
});

// PUT /cadastro/motos/:motoId/descricao-modelo
cadastroRouter.put('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const { descricaoModelo } = req.body;
    await prisma.moto.update({
      where: { id: Number(req.params.motoId) },
      data: { descricaoModelo: descricaoModelo ? String(descricaoModelo).trim() : null },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
