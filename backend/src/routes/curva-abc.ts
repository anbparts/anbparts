import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const curvaAbcRouter = Router();

function baseSku(value: any) {
  return String(value || '').replace(/-\d+$/, '').toUpperCase().trim();
}

// Carrega o mapa de unificação (origem→destino) e o modo de contagem de múltiplas categorias.
async function carregarUnificacao(): Promise<{ mapa: Map<string, string>; modo: 'todas' | 'principal' }> {
  const mapa = new Map<string, string>();
  let modo: 'todas' | 'principal' = 'todas';
  try {
    const rows = await prisma.$queryRaw<{ origem: string; destino: string }[]>`
      SELECT "origem", "destino" FROM "CategoriaUnificacao"
    `;
    for (const r of rows) {
      const o = String(r.origem || '').trim().toLowerCase();
      const d = String(r.destino || '').trim();
      if (o && d) mapa.set(o, d);
    }
  } catch { /* tabela ainda nao migrada */ }
  try {
    const cfg = await prisma.$queryRaw<{ curvaAbcModoMultiplas: string }[]>`
      SELECT "curvaAbcModoMultiplas" FROM "ConfiguracaoGeral"
    `;
    if (cfg?.[0]?.curvaAbcModoMultiplas === 'principal') modo = 'principal';
  } catch { /* coluna ainda nao migrada */ }
  return { mapa, modo };
}

// Aplica a unificação a um nome de categoria (usa o destino se houver regra).
function unificarNome(mapa: Map<string, string>, nome: string) {
  const limpo = String(nome || '').trim();
  return mapa.get(limpo.toLowerCase()) || limpo;
}

// GET /curva-abc/relatorio?motoId=&dataDe=&dataAte=
// Agrega as pecas por categoria (tabela SkuCategoria, alimentada pela tela Produtos Nuvemshop).
// SKU com multiplas categorias conta em todas (modo padrao da Entrega 1); os totais gerais
// usam pecas unicas. Periodo filtra apenas as VENDAS (dataVenda); estoque e sempre o atual.
curvaAbcRouter.get('/relatorio', async (req, res, next) => {
  try {
    const motoId = Number(req.query?.motoId) || 0;
    const dataDe = String(req.query?.dataDe || '').trim();
    const dataAte = String(req.query?.dataAte || '').trim();
    const vendaDe = dataDe ? new Date(`${dataDe}T00:00:00.000Z`) : null;
    const vendaAte = dataAte ? new Date(`${dataAte}T23:59:59.999Z`) : null;

    const { mapa: mapaUnif, modo } = await carregarUnificacao();

    // Categorias por SKU (raw SQL: tolera client Prisma local desatualizado).
    // ORDER BY id: preserva a ordem de cadastro — no modo 'principal' vale a 1ª categoria do SKU.
    let catRows: { sku: string; nome: string; atualizadoEm: Date }[] = [];
    try {
      catRows = await prisma.$queryRaw<{ sku: string; nome: string; atualizadoEm: Date }[]>`
        SELECT "sku", "nome", "atualizadoEm" FROM "SkuCategoria" ORDER BY "id" ASC
      `;
    } catch {
      return res.json({ ok: true, semTabela: true, categorias: [], totais: null, atualizadoEm: null });
    }

    const categoriasPorSku = new Map<string, string[]>();
    let atualizadoEm: Date | null = null;
    for (const r of catRows) {
      const sku = baseSku(r.sku);
      if (!categoriasPorSku.has(sku)) categoriasPorSku.set(sku, []);
      const nome = unificarNome(mapaUnif, r.nome); // aplica agrupamento
      if (nome && !categoriasPorSku.get(sku)!.includes(nome)) categoriasPorSku.get(sku)!.push(nome);
      if (r.atualizadoEm && (!atualizadoEm || r.atualizadoEm > atualizadoEm)) atualizadoEm = r.atualizadoEm;
    }

    const pecas = await prisma.peca.findMany({
      where: { emPrejuizo: false, ...(motoId ? { motoId } : {}) },
      select: { idPeca: true, disponivel: true, dataVenda: true, precoML: true, valorLiq: true },
    });

    type Agg = {
      skus: Set<string>; unidades: number; emEstoque: number; vendidas: number;
      receita: number; receitaLiq: number;
    };
    const novoAgg = (): Agg => ({ skus: new Set(), unidades: 0, emEstoque: 0, vendidas: 0, receita: 0, receitaLiq: 0 });
    const porCategoria = new Map<string, Agg>();
    const geral = novoAgg();

    for (const p of pecas) {
      const sku = baseSku(p.idPeca);
      const vendidaNoPeriodo = !p.disponivel && !!p.dataVenda
        && (!vendaDe || p.dataVenda >= vendaDe)
        && (!vendaAte || p.dataVenda <= vendaAte);
      const receita = vendidaNoPeriodo ? Number(p.precoML) || 0 : 0;
      const receitaLiq = vendidaNoPeriodo ? Number(p.valorLiq) || 0 : 0;

      // Modo 'principal': o SKU conta só na 1ª categoria; 'todas': conta em todas (dedup).
      const listaCat = categoriasPorSku.get(sku);
      const nomes = listaCat?.length ? (modo === 'principal' ? [listaCat[0]] : listaCat) : ['Sem categoria'];
      for (const nome of nomes) {
        if (!porCategoria.has(nome)) porCategoria.set(nome, novoAgg());
        const agg = porCategoria.get(nome)!;
        agg.skus.add(sku);
        agg.unidades += 1;
        if (p.disponivel) agg.emEstoque += 1;
        if (vendidaNoPeriodo) { agg.vendidas += 1; agg.receita += receita; agg.receitaLiq += receitaLiq; }
      }

      // Totais gerais por peca unica (sem duplicar por categoria)
      geral.skus.add(sku);
      geral.unidades += 1;
      if (p.disponivel) geral.emEstoque += 1;
      if (vendidaNoPeriodo) { geral.vendidas += 1; geral.receita += receita; geral.receitaLiq += receitaLiq; }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const categorias = Array.from(porCategoria.entries()).map(([nome, a]) => ({
      nome,
      skus: a.skus.size,
      unidades: a.unidades,
      emEstoque: a.emEstoque,
      vendidas: a.vendidas,
      receita: round2(a.receita),
      receitaLiq: round2(a.receitaLiq),
      giroPct: a.unidades ? Math.round((a.vendidas / a.unidades) * 100) : 0,
    }));

    const skusCategorizado = new Set(Array.from(geral.skus).filter((s) => categoriasPorSku.has(s))).size;

    res.json({
      ok: true,
      atualizadoEm,
      modo,
      categorias,
      totais: {
        categorias: categorias.filter((c) => c.nome !== 'Sem categoria').length,
        skus: geral.skus.size,
        skusCategorizado,
        skusSemCategoria: geral.skus.size - skusCategorizado,
        unidades: geral.unidades,
        emEstoque: geral.emEstoque,
        vendidas: geral.vendidas,
        receita: round2(geral.receita),
        receitaLiq: round2(geral.receitaLiq),
        giroPct: geral.unidades ? Math.round((geral.vendidas / geral.unidades) * 100) : 0,
      },
    });
  } catch (e) { next(e); }
});

// GET /curva-abc/categorias-nomes — nomes de categorias distintos (autocomplete da categorização manual)
curvaAbcRouter.get('/categorias-nomes', async (_req, res, next) => {
  try {
    let rows: { nome: string }[] = [];
    try {
      rows = await prisma.$queryRaw<{ nome: string }[]>`
        SELECT DISTINCT "nome" FROM "SkuCategoria" WHERE "nome" <> '' ORDER BY "nome" ASC
      `;
    } catch {
      return res.json({ ok: true, nomes: [] });
    }
    res.json({ ok: true, nomes: rows.map((r) => r.nome).filter(Boolean) });
  } catch (e) { next(e); }
});

// GET /curva-abc/pecas?motoId=&semCategoria=1 — peças da moto (INCLUI vendidas) com sua categoria atual.
// Usado na aba de categorização manual. Agrupa por SKU base.
curvaAbcRouter.get('/pecas', async (req, res, next) => {
  try {
    const motoId = Number(req.query?.motoId) || 0;
    const soSemCategoria = String(req.query?.semCategoria || '') === '1';
    if (!motoId) return res.status(400).json({ ok: false, error: 'motoId obrigatorio' });

    // Categorias por SKU (com origem)
    let catRows: { sku: string; nome: string; origem: string }[] = [];
    try {
      catRows = await prisma.$queryRaw<{ sku: string; nome: string; origem: string }[]>`
        SELECT "sku", "nome", "origem" FROM "SkuCategoria"
      `;
    } catch {
      catRows = [];
    }
    const catPorSku = new Map<string, { nome: string; origem: string }[]>();
    for (const r of catRows) {
      const sku = baseSku(r.sku);
      if (!catPorSku.has(sku)) catPorSku.set(sku, []);
      const nome = String(r.nome || '').trim();
      if (nome && !catPorSku.get(sku)!.some((c) => c.nome === nome)) {
        catPorSku.get(sku)!.push({ nome, origem: r.origem || 'nuvemshop' });
      }
    }

    const pecas = await prisma.peca.findMany({
      where: { motoId },
      select: { idPeca: true, descricao: true, disponivel: true, dataVenda: true },
      orderBy: { idPeca: 'asc' },
    });

    type Item = { sku: string; descricao: string; emEstoque: boolean; vendida: boolean; qtd: number; categorias: { nome: string; origem: string }[] };
    const porBase = new Map<string, Item>();
    for (const p of pecas) {
      const sku = baseSku(p.idPeca);
      if (!porBase.has(sku)) {
        porBase.set(sku, { sku, descricao: p.descricao || '', emEstoque: false, vendida: false, qtd: 0, categorias: catPorSku.get(sku) || [] });
      }
      const it = porBase.get(sku)!;
      it.qtd += 1;
      if (p.disponivel) it.emEstoque = true; else it.vendida = true;
      if (!it.descricao && p.descricao) it.descricao = p.descricao;
    }

    let itens = Array.from(porBase.values());
    if (soSemCategoria) itens = itens.filter((i) => i.categorias.length === 0);

    res.json({
      ok: true,
      itens,
      total: porBase.size,
      semCategoria: Array.from(porBase.values()).filter((i) => i.categorias.length === 0).length,
    });
  } catch (e) { next(e); }
});

// POST /curva-abc/pecas/categorias — define as categorias MANUAIS de um SKU base.
// Body: { sku, categorias: string[] }. Substitui apenas as linhas origem='manual' do SKU;
// as de origem 'nuvemshop' ficam intactas.
curvaAbcRouter.post('/pecas/categorias', async (req, res, next) => {
  try {
    const sku = baseSku(req.body?.sku);
    const nomes: string[] = Array.isArray(req.body?.categorias)
      ? Array.from(new Set(req.body.categorias.map((c: any) => String(c || '').trim()).filter(Boolean)))
      : [];
    if (!sku) return res.status(400).json({ ok: false, error: 'sku obrigatorio' });

    try {
      await prisma.$executeRaw`DELETE FROM "SkuCategoria" WHERE "sku" = ${sku} AND "origem" = 'manual'`;
      for (const nome of nomes) {
        const categoriaId = `manual:${nome.toLowerCase()}`;
        await prisma.$executeRaw`
          INSERT INTO "SkuCategoria" ("sku", "categoriaId", "nome", "origem", "atualizadoEm")
          VALUES (${sku}, ${categoriaId}, ${nome}, 'manual', now())
          ON CONFLICT ("sku", "categoriaId") DO UPDATE SET "nome" = EXCLUDED."nome", "origem" = 'manual', "atualizadoEm" = now()
        `;
      }
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Tabela de categorias indisponivel: ' + (e?.message || String(e)) });
    }

    res.json({ ok: true, sku, categorias: nomes });
  } catch (e) { next(e); }
});

// Raiz de um nome de categoria para agrupamento automático: tira "(...)" e o prefixo "Outras Peças".
function raizCategoria(nome: string) {
  return String(nome || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')          // remove "(dianteira, lateral, traseira)"
    .replace(/^outras?\s+pe[çc]as?\s+(de\s+)?/i, '') // remove "Outras Peças (de) "
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /curva-abc/unificacao — mapa atual + modo + sugestões automáticas por padrão de nome.
curvaAbcRouter.get('/unificacao', async (_req, res, next) => {
  try {
    const { mapa, modo } = await carregarUnificacao();

    // Nomes distintos existentes + contagem de SKUs por nome
    let nomes: { nome: string; skus: number }[] = [];
    try {
      nomes = await prisma.$queryRaw<{ nome: string; skus: number }[]>`
        SELECT "nome", COUNT(DISTINCT "sku")::int AS "skus"
        FROM "SkuCategoria" WHERE "nome" <> '' GROUP BY "nome" ORDER BY "nome" ASC
      `;
    } catch {
      return res.json({ ok: true, semTabela: true, modo, itens: [], sugestoes: [] });
    }

    const mapaAtual: Record<string, string> = {};
    for (const [origemLower, destino] of mapa.entries()) mapaAtual[origemLower] = destino;

    const itens = nomes.map((n) => ({
      origem: n.nome,
      skus: Number(n.skus) || 0,
      destino: mapa.get(n.nome.trim().toLowerCase()) || '',
    }));

    // Sugestões automáticas: agrupa nomes que compartilham a mesma raiz (só quando ainda não mapeados).
    const porRaiz = new Map<string, string[]>();
    for (const n of nomes) {
      const raiz = raizCategoria(n.nome);
      if (!raiz) continue;
      if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
      porRaiz.get(raiz)!.push(n.nome);
    }
    const sugestoes: { origem: string; destino: string }[] = [];
    for (const [raiz, lista] of porRaiz.entries()) {
      // sugere quando há mais de um nome na raiz OU o nome difere da raiz (ex.: "Escape (traseiro)" -> "Escape")
      const vale = lista.length > 1 || lista.some((nm) => nm.trim().toLowerCase() !== raiz.toLowerCase());
      if (!vale) continue;
      for (const nm of lista) {
        if (nm.trim().toLowerCase() === raiz.toLowerCase() && lista.length === 1) continue;
        // não sugere se já está mapeado exatamente para essa raiz
        if ((mapa.get(nm.trim().toLowerCase()) || '') === raiz) continue;
        sugestoes.push({ origem: nm, destino: raiz });
      }
    }

    res.json({ ok: true, modo, itens, sugestoes });
  } catch (e) { next(e); }
});

// POST /curva-abc/unificacao — salva o mapa completo e o modo.
// Body: { mapa: [{origem, destino}], modo: 'todas'|'principal' }
curvaAbcRouter.post('/unificacao', async (req, res, next) => {
  try {
    const mapa: { origem: string; destino: string }[] = Array.isArray(req.body?.mapa) ? req.body.mapa : [];
    const modo = req.body?.modo === 'principal' ? 'principal' : 'todas';

    try {
      await prisma.$executeRaw`DELETE FROM "CategoriaUnificacao"`;
      for (const m of mapa) {
        const origem = String(m?.origem || '').trim();
        const destino = String(m?.destino || '').trim();
        if (!origem || !destino || origem.toLowerCase() === destino.toLowerCase()) continue;
        await prisma.$executeRaw`
          INSERT INTO "CategoriaUnificacao" ("origem", "destino", "atualizadoEm")
          VALUES (${origem}, ${destino}, now())
          ON CONFLICT ("origem") DO UPDATE SET "destino" = EXCLUDED."destino", "atualizadoEm" = now()
        `;
      }
      await prisma.$executeRaw`UPDATE "ConfiguracaoGeral" SET "curvaAbcModoMultiplas" = ${modo}`;
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Falha ao salvar unificacao: ' + (e?.message || String(e)) });
    }

    res.json({ ok: true, modo, total: mapa.length });
  } catch (e) { next(e); }
});

// GET /curva-abc/categoria-detalhe?nome=&motoId=&dataDe=&dataAte= — drill-down de uma categoria (já unificada).
curvaAbcRouter.get('/categoria-detalhe', async (req, res, next) => {
  try {
    const nomeAlvo = String(req.query?.nome || '').trim();
    if (!nomeAlvo) return res.status(400).json({ ok: false, error: 'nome obrigatorio' });
    const motoId = Number(req.query?.motoId) || 0;
    const dataDe = String(req.query?.dataDe || '').trim();
    const dataAte = String(req.query?.dataAte || '').trim();
    const vendaDe = dataDe ? new Date(`${dataDe}T00:00:00.000Z`) : null;
    const vendaAte = dataAte ? new Date(`${dataAte}T23:59:59.999Z`) : null;

    const { mapa, modo } = await carregarUnificacao();
    const ehSemCategoria = nomeAlvo.toLowerCase() === 'sem categoria';

    let catRows: { sku: string; nome: string }[] = [];
    try {
      catRows = await prisma.$queryRaw<{ sku: string; nome: string }[]>`
        SELECT "sku", "nome" FROM "SkuCategoria" ORDER BY "id" ASC
      `;
    } catch { catRows = []; }

    const categoriasPorSku = new Map<string, string[]>();
    for (const r of catRows) {
      const sku = baseSku(r.sku);
      if (!categoriasPorSku.has(sku)) categoriasPorSku.set(sku, []);
      const nome = unificarNome(mapa, r.nome);
      if (nome && !categoriasPorSku.get(sku)!.includes(nome)) categoriasPorSku.get(sku)!.push(nome);
    }

    const pecas = await prisma.peca.findMany({
      where: { emPrejuizo: false, ...(motoId ? { motoId } : {}) },
      select: {
        idPeca: true, descricao: true, disponivel: true, dataVenda: true, precoML: true, valorLiq: true,
        moto: { select: { marca: true, modelo: true } },
      },
      orderBy: { idPeca: 'asc' },
    });

    // Pertence à categoria conforme o modo (mesma regra do relatório)
    const pertence = (sku: string) => {
      const lista = categoriasPorSku.get(sku);
      if (!lista?.length) return ehSemCategoria;
      const efetivas = modo === 'principal' ? [lista[0]] : lista;
      return efetivas.some((n) => n.toLowerCase() === nomeAlvo.toLowerCase());
    };

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const porSkuBase = new Map<string, any>();
    const vendasPorMes = new Map<string, { vendidas: number; receita: number }>();

    for (const p of pecas) {
      const sku = baseSku(p.idPeca);
      if (!pertence(sku)) continue;
      const vendida = !p.disponivel && !!p.dataVenda
        && (!vendaDe || p.dataVenda >= vendaDe) && (!vendaAte || p.dataVenda <= vendaAte);
      if (!porSkuBase.has(sku)) {
        porSkuBase.set(sku, {
          sku, descricao: p.descricao || '', moto: p.moto ? `${p.moto.marca} ${p.moto.modelo}` : '',
          emEstoque: 0, vendidas: 0, receita: 0, receitaLiq: 0, ultimaVenda: null as Date | null,
        });
      }
      const it = porSkuBase.get(sku);
      if (p.disponivel) it.emEstoque += 1;
      if (vendida) {
        it.vendidas += 1;
        it.receita += Number(p.precoML) || 0;
        it.receitaLiq += Number(p.valorLiq) || 0;
        if (!it.ultimaVenda || (p.dataVenda && p.dataVenda > it.ultimaVenda)) it.ultimaVenda = p.dataVenda;
        const mes = (p.dataVenda as Date).toISOString().slice(0, 7);
        if (!vendasPorMes.has(mes)) vendasPorMes.set(mes, { vendidas: 0, receita: 0 });
        const vm = vendasPorMes.get(mes)!;
        vm.vendidas += 1; vm.receita += Number(p.precoML) || 0;
      }
    }

    const itens = Array.from(porSkuBase.values())
      .map((it) => ({ ...it, receita: round2(it.receita), receitaLiq: round2(it.receitaLiq) }))
      .sort((a, b) => b.receita - a.receita || b.vendidas - a.vendidas);

    const serieMeses = Array.from(vendasPorMes.entries())
      .map(([mes, v]) => ({ mes, vendidas: v.vendidas, receita: round2(v.receita) }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    res.json({ ok: true, nome: nomeAlvo, itens, serieMeses });
  } catch (e) { next(e); }
});
