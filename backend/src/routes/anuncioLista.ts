// Filtros da aba Anuncio: em vez de colar SKUs, escolhe por moto, estoque, quem ainda nao tem anuncio, limite etc. A rota
// so devolve a LISTA de SKUs (a busca/criacao segue o fluxo normal da aba).
// "Tem anuncio" aqui = o NOSSO sistema tem o ID gravado (Peca/pre-cadastro). O Mercado Livre so existe na Peca (o ID do
// pre-cadastro nao guarda ML) e vinculos que existem so no Bling nao entram — a tela mostra isso depois da busca.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { skuBaseAnuncio } from '../lib/anuncioBase';

export const anuncioListaRouter = Router();

type Mk = 'shopee' | 'magalu' | 'nuvemshop' | 'mercado-livre';
const TODOS: Mk[] = ['shopee', 'magalu', 'nuvemshop', 'mercado-livre'];

// GET /anuncio-lista/motos — motos pro seletor (id + rotulo com o prefixo do SKU).
anuncioListaRouter.get('/motos', async (_req, res, next) => {
  try {
    const motos: any[] = await (prisma as any).moto.findMany({ select: { id: true, marca: true, modelo: true, ano: true }, orderBy: [{ marca: 'asc' }, { modelo: 'asc' }] });
    const cfg: any = await prisma.blingConfig.findFirst({ select: { prefixos: true } });
    const prefixos: any[] = Array.isArray(cfg?.prefixos) ? cfg.prefixos : [];
    const prefixoPorMoto = new Map<number, string>(prefixos.filter((p) => p?.motoId && p?.prefixo).map((p) => [Number(p.motoId), String(p.prefixo).toUpperCase()]));
    res.json({
      ok: true,
      motos: motos.map((m) => ({ id: m.id, prefixo: prefixoPorMoto.get(m.id) || null, rotulo: `${prefixoPorMoto.get(m.id) ? `${prefixoPorMoto.get(m.id)} · ` : ''}${m.marca} ${m.modelo}${m.ano ? ` ${m.ano}` : ''}` })),
    });
  } catch (e) { next(e); }
});

// POST /anuncio-lista/skus — body: { motoId?, comEstoque?, anuncios?: 'todos'|'faltando'|'nenhum', marketplaces?: Mk[],
//   origem?: 'ambos'|'pecas'|'precadastro', busca?, ordem?: 'recentes'|'antigos', limite? }
anuncioListaRouter.post('/skus', async (req, res, next) => {
  try {
    const b = req.body || {};
    const motoId = b.motoId ? Number(b.motoId) : null;
    const comEstoque = b.comEstoque !== false;
    const anuncios = b.anuncios === 'faltando' || b.anuncios === 'nenhum' ? b.anuncios : 'todos';
    const origem = b.origem === 'pecas' || b.origem === 'precadastro' ? b.origem : 'ambos';
    const busca = String(b.busca || '').trim();
    const ordem = b.ordem === 'antigos' ? 'antigos' : 'recentes';
    const limite = Math.min(300, Math.max(1, Number(b.limite) || 25));
    const mks: Mk[] = (Array.isArray(b.marketplaces) ? b.marketplaces : TODOS).filter((m: any) => TODOS.includes(m));
    const avaliados: Mk[] = mks.length ? mks : TODOS;

    type Item = { sku: string; data: Date; estoque: number; ids: Record<Mk, boolean> };
    const porSku = new Map<string, Item>();

    if (origem !== 'precadastro') {
      const pecas: any[] = await prisma.peca.findMany({
        where: {
          emPrejuizo: false, sucata: false,
          ...(motoId ? { motoId } : {}),
          ...(comEstoque ? { disponivel: true } : {}),
          ...(busca ? { OR: [{ idPeca: { contains: busca, mode: 'insensitive' } }, { descricao: { contains: busca, mode: 'insensitive' } }] } : {}),
        },
        select: { idPeca: true, cadastro: true, disponivel: true, shopeeItemId: true, magaluItemId: true, nuvemshopProdutoId: true, mercadoLivreItemId: true },
      } as any);
      for (const p of pecas) {
        const sku = skuBaseAnuncio(p.idPeca);
        const it = porSku.get(sku) || { sku, data: new Date(p.cadastro), estoque: 0, ids: { shopee: false, magalu: false, nuvemshop: false, 'mercado-livre': false } as Record<Mk, boolean> };
        if (p.disponivel) it.estoque += 1;
        if (p.shopeeItemId) it.ids.shopee = true;
        if (p.magaluItemId) it.ids.magalu = true;
        if (p.nuvemshopProdutoId) it.ids.nuvemshop = true;
        if (p.mercadoLivreItemId) it.ids['mercado-livre'] = true;
        if (new Date(p.cadastro) > it.data) it.data = new Date(p.cadastro);
        porSku.set(sku, it);
      }
    }

    if (origem !== 'pecas') {
      const cads: any[] = await (prisma as any).cadastroPeca.findMany({
        where: {
          status: { not: 'cadastrado' }, pecaRestrita: false, sucata: false,
          ...(motoId ? { motoId } : {}),
          ...(busca ? { OR: [{ idPeca: { contains: busca, mode: 'insensitive' } }, { descricao: { contains: busca, mode: 'insensitive' } }] } : {}),
        },
        select: { idPeca: true, createdAt: true, estoque: true, shopeeItemId: true, magaluItemId: true, nuvemshopProdutoId: true },
      });
      for (const c of cads) {
        const sku = skuBaseAnuncio(c.idPeca);
        if (porSku.has(sku)) continue; // a Peca finalizada tem precedencia
        if (comEstoque && !(Number(c.estoque) >= 1)) continue;
        porSku.set(sku, {
          sku, data: new Date(c.createdAt), estoque: Math.max(1, Number(c.estoque) || 1),
          ids: { shopee: !!c.shopeeItemId, magalu: !!c.magaluItemId, nuvemshop: !!c.nuvemshopProdutoId, 'mercado-livre': false },
        });
      }
    }

    let itens = Array.from(porSku.values());
    if (comEstoque) itens = itens.filter((i) => i.estoque >= 1);
    if (anuncios === 'nenhum') itens = itens.filter((i) => avaliados.every((m) => !i.ids[m]));
    if (anuncios === 'faltando') itens = itens.filter((i) => avaliados.some((m) => !i.ids[m]));
    itens.sort((a, c) => (ordem === 'antigos' ? a.data.getTime() - c.data.getTime() : c.data.getTime() - a.data.getTime()) || a.sku.localeCompare(c.sku));

    res.json({ ok: true, total: itens.length, skus: itens.slice(0, limite).map((i) => i.sku) });
  } catch (e) { next(e); }
});
