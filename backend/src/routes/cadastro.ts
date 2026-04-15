import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';

export const cadastroRouter = Router();

const BLING_NUMERO_PECA_CAMPO_ID = 2821431;
const BLING_DETRAN_CAMPO_ID = 5979929;

async function uploadImagemBling(produtoId: string, base64: string): Promise<void> {
  const imagemBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  await blingReq(`/produtos/${produtoId}/imagens`, {
    method: 'POST',
    body: JSON.stringify({
      imagens: [{ base64: imagemBase64, padrao: true }],
    }),
  });
}

// GET /cadastro - lista todos com filtros
cadastroRouter.get('/', async (req, res, next) => {
  try {
    const { status, motoId, search, semDimensoes, semNumeroPeca, page = '1', per = '50' } = req.query as any;

    const where: any = {};
    if (status) where.status = status;
    if (motoId) where.motoId = Number(motoId);
    if (search) {
      where.OR = [
        { idPeca: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (semDimensoes === 'true') {
      where.OR = [
        ...(where.OR || []),
        { largura: null }, { largura: 0 },
        { altura: null }, { altura: 0 },
        { profundidade: null }, { profundidade: 0 },
      ];
    }
    if (semNumeroPeca === 'true') {
      where.numeroPeca = null;
    }

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

// GET /cadastro/proximo-id/:motoId - próximo SKU para a moto
cadastroRouter.get('/proximo-id/:motoId', async (req, res, next) => {
  try {
    const motoId = Number(req.params.motoId);

    // Busca prefixo no BlingConfig
    const cfg = await prisma.blingConfig.findFirst();
    const prefixos: any[] = (cfg?.prefixos as any) || [];
    const prefixoObj = prefixos.find((p: any) => Number(p.motoId) === motoId);
    const prefixo = prefixoObj?.prefixo ? String(prefixoObj.prefixo).toUpperCase().trim() : null;

    if (!prefixo) {
      return res.json({ prefixo: null, proximo: null, sugestao: null });
    }

    // Busca maior sequencial existente em Peca e CadastroPeca
    const [pecas, cadastros] = await Promise.all([
      prisma.peca.findMany({
        where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] },
        select: { idPeca: true },
      }),
      prisma.cadastroPeca.findMany({
        where: { OR: [{ motoId }, { idPeca: { startsWith: prefixo } }] },
        select: { idPeca: true },
      }),
    ]);

    const todos = [...pecas, ...cadastros].map((p) => p.idPeca);
    let maiorNum = 0;
    for (const id of todos) {
      const match = id.match(/_(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maiorNum) maiorNum = num;
      }
    }

    const proximo = maiorNum + 1;
    const sugestao = `${prefixo}_${String(proximo).padStart(4, '0')}`;
    res.json({ prefixo, proximo, sugestao });
  } catch (e) { next(e); }
});

// POST /cadastro - criar pré-cadastro
cadastroRouter.post('/', async (req, res, next) => {
  try {
    const {
      motoId, idPeca, descricao, descricaoPeca, precoVenda,
      condicao, peso, largura, altura, profundidade,
      numeroPeca, detranEtiqueta, localizacao, estoque,
      categoriaMLId, categoriaMLNome,
    } = req.body;

    if (!motoId || !idPeca || !descricao) {
      return res.status(400).json({ error: 'motoId, idPeca e descricao sao obrigatorios' });
    }

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
        categoriaMLId: categoriaMLId ? String(categoriaMLId) : null,
        categoriaMLNome: categoriaMLNome ? String(categoriaMLNome) : null,
        status: 'pre_cadastro',
      },
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    res.status(201).json(record);
  } catch (e) { next(e); }
});

// PUT /cadastro/:id - atualizar
cadastroRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const {
      descricao, descricaoPeca, precoVenda, condicao,
      peso, largura, altura, profundidade,
      numeroPeca, detranEtiqueta, localizacao, estoque,
      categoriaMLId, categoriaMLNome,
    } = req.body;

    const data: any = {};
    if (descricao !== undefined) data.descricao = String(descricao).trim().slice(0, 60);
    if (descricaoPeca !== undefined) data.descricaoPeca = descricaoPeca ? String(descricaoPeca).trim() : null;
    if (precoVenda !== undefined) data.precoVenda = Number(precoVenda);
    if (condicao !== undefined) data.condicao = condicao;
    if (peso !== undefined) data.peso = peso != null ? Number(peso) : null;
    if (largura !== undefined) data.largura = largura != null ? Number(largura) : null;
    if (altura !== undefined) data.altura = altura != null ? Number(altura) : null;
    if (profundidade !== undefined) data.profundidade = profundidade != null ? Number(profundidade) : null;
    if (numeroPeca !== undefined) data.numeroPeca = numeroPeca ? String(numeroPeca).trim() : null;
    if (detranEtiqueta !== undefined) data.detranEtiqueta = detranEtiqueta ? String(detranEtiqueta).trim() : null;
    if (localizacao !== undefined) data.localizacao = localizacao ? String(localizacao).trim() : null;
    if (estoque !== undefined) data.estoque = Number(estoque);
    if (categoriaMLId !== undefined) data.categoriaMLId = categoriaMLId || null;
    if (categoriaMLNome !== undefined) data.categoriaMLNome = categoriaMLNome || null;

    const record = await prisma.cadastroPeca.update({
      where: { id },
      data,
      include: { moto: { select: { id: true, marca: true, modelo: true, ano: true } } },
    });

    res.json(record);
  } catch (e) { next(e); }
});

// POST /cadastro/:id/finalizar - etapa 2: upload foto + criar no Bling
cadastroRouter.post('/:id/finalizar', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { fotoCapa } = req.body; // base64 da imagem

    const cadastro = await prisma.cadastroPeca.findUnique({
      where: { id },
      include: { moto: true },
    });

    if (!cadastro) return res.status(404).json({ error: 'Cadastro não encontrado' });
    if (cadastro.status === 'cadastrado') return res.status(400).json({ error: 'Já finalizado' });

    // Monta payload do produto Bling
    const camposCustomizados: any[] = [];
    if (cadastro.numeroPeca) {
      camposCustomizados.push({ idCampoCustomizado: BLING_NUMERO_PECA_CAMPO_ID, valor: cadastro.numeroPeca });
    }
    if (cadastro.detranEtiqueta) {
      camposCustomizados.push({ idCampoCustomizado: BLING_DETRAN_CAMPO_ID, valor: cadastro.detranEtiqueta });
    }

    const payload: any = {
      nome: cadastro.descricao,
      codigo: cadastro.idPeca,
      preco: Number(cadastro.precoVenda),
      tipo: 'P',
      situacao: 'A',
      condicao: cadastro.condicao === 'novo' ? 1 : 2,
      descricaoCurta: cadastro.descricaoPeca || '',
      pesoLiquido: cadastro.peso ? Number(cadastro.peso) : null,
      pesoBruto: cadastro.peso ? Number(cadastro.peso) : null,
      largura: cadastro.largura ? Number(cadastro.largura) : null,
      altura: cadastro.altura ? Number(cadastro.altura) : null,
      profundidade: cadastro.profundidade ? Number(cadastro.profundidade) : null,
      estoque: {
        minimo: Number(cadastro.estoque),
        maximo: Number(cadastro.estoque),
        atual: Number(cadastro.estoque),
      },
      camposCustomizados: camposCustomizados.length ? camposCustomizados : undefined,
    };

    // Cria produto no Bling
    const blingResp = await blingReq('/produtos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const blingProdutoId = String(blingResp?.data?.id || '');

    // Upload da foto se fornecida e produto criado
    if (fotoCapa && blingProdutoId) {
      try {
        await uploadImagemBling(blingProdutoId, fotoCapa);
      } catch (e: any) {
        console.error('Erro ao fazer upload da foto:', e?.message);
        // não falha o cadastro por causa da foto
      }
    }

    // Atualiza status
    const updated = await prisma.cadastroPeca.update({
      where: { id },
      data: {
        status: 'cadastrado',
        fotoCapa: fotoCapa ? '[uploaded]' : null,
        blingProdutoId,
      },
    });

    res.json({ ok: true, blingProdutoId, cadastro: updated });
  } catch (e) { next(e); }
});

// GET /cadastro/motos/:motoId/descricao-modelo - busca texto template
cadastroRouter.get('/motos/:motoId/descricao-modelo', async (req, res, next) => {
  try {
    const moto = await prisma.moto.findUnique({
      where: { id: Number(req.params.motoId) },
      select: { id: true, descricaoModelo: true },
    });
    res.json({ descricaoModelo: moto?.descricaoModelo || '' });
  } catch (e) { next(e); }
});

// PUT /cadastro/motos/:motoId/descricao-modelo - salva texto template
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
