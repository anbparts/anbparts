import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const curvaAbcRouter = Router();

function baseSku(value: any) {
  return String(value || '').replace(/-\d+$/, '').toUpperCase().trim();
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

    // Categorias por SKU (raw SQL: tolera client Prisma local desatualizado)
    let catRows: { sku: string; nome: string; atualizadoEm: Date }[] = [];
    try {
      catRows = await prisma.$queryRaw<{ sku: string; nome: string; atualizadoEm: Date }[]>`
        SELECT "sku", "nome", "atualizadoEm" FROM "SkuCategoria"
      `;
    } catch {
      return res.json({ ok: true, semTabela: true, categorias: [], totais: null, atualizadoEm: null });
    }

    const categoriasPorSku = new Map<string, string[]>();
    let atualizadoEm: Date | null = null;
    for (const r of catRows) {
      const sku = baseSku(r.sku);
      if (!categoriasPorSku.has(sku)) categoriasPorSku.set(sku, []);
      const nome = String(r.nome || '').trim();
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

      const nomes = categoriasPorSku.get(sku)?.length ? categoriasPorSku.get(sku)! : ['Sem categoria'];
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
