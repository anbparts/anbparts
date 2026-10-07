// Fonte unica dos dados do SKU pra aba Anuncio (criar anuncio em Shopee/Magalu/Nuvemshop): funciona
// nos DOIS estagios do SKU —
//  1) ja em Pecas (finalizado): usa a Peca (estoque = unidades disponiveis);
//  2) ainda no pre-cadastro (CadastroPeca, status pre_cadastro): usa o cadastro (estoque = campo estoque).
// As rotas de anuncio recebem esse objeto com os MESMOS nomes de campo da Peca (precoML, pesoLiquido,
// largura...), entao quase nada muda nelas. Os IDs dos anuncios criados sao gravados nos dois lados
// (gravarIdsAnuncio) e copiados do pre-cadastro pra Peca quando o cadastro e' finalizado.
import { prisma } from './prisma';
import { buscarFotosDriveSku } from './fotos-cadastro';

// Conta as fotos do SKU na PASTA OFICIAL da moto (so la o Fotos Anuncios ja processou). Cache curto
// porque a mesma busca da aba Anuncio consulta isso 1x por marketplace.
const cacheFotos = new Map<string, { qtd: number; expira: number }>();
export async function contarFotosOficiais(motoId: number, sku: string): Promise<number> {
  const chave = `${motoId}|${sku}`;
  const hit = cacheFotos.get(chave);
  if (hit && hit.expira > Date.now()) return hit.qtd;
  let qtd = 0;
  try {
    qtd = (await buscarFotosDriveSku(motoId, sku)).fotos.length;
  } catch {
    qtd = 0;
  }
  cacheFotos.set(chave, { qtd, expira: Date.now() + 45_000 });
  return qtd;
}
export function limparCacheFotosOficiais(motoId: number, sku: string) {
  cacheFotos.delete(`${motoId}|${sku}`);
}

export type AnuncioBase = {
  origem: 'peca' | 'cadastro';
  fotosOficiais: number; // fotos do SKU na pasta oficial da moto (0 = Fotos Anuncios ainda nao processou)
  blingProdutoId: string | null; // id do produto no Bling (CadastroPeca.blingProdutoId); null se so ha Peca
  idPeca: string;
  descricao: string;
  motoId: number;
  moto: { marca: string; modelo: string; ano: number | null } | null;
  precoML: number;
  pesoLiquido: number | null;
  pesoBruto: number | null;
  largura: number | null;
  altura: number | null;
  profundidade: number | null;
  numeroPeca: string | null;
  tipoPecaAvulsa: string | null;
  condicao: string | null; // usado | novo (CadastroPeca.condicao; null se nao ha cadastro)
  estoque: number;
  shopeeItemId: string | null;
  magaluItemId: string | null;
  nuvemshopProdutoId: string | null;
  shopeeCategoriaId: string | null;
  magaluCategoriaId: string | null;
  nuvemshopCategoriaId: string | null;
  nuvemshopTags: string | null;
};

export function skuBaseAnuncio(value: any) {
  return String(value || '').trim().toUpperCase().replace(/-\d+$/, '');
}

const num = (v: any): number | null => (v == null || v === '' ? null : Number(v));
const txt = (v: any): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export async function carregarAnuncioBase(skuInput: string): Promise<AnuncioBase | null> {
  const sku = skuBaseAnuncio(skuInput);
  if (!sku) return null;

  const [peca, cadastro]: [any, any] = await Promise.all([
    prisma.peca.findFirst({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      include: { moto: { select: { marca: true, modelo: true, ano: true } } },
      orderBy: { idPeca: 'asc' },
    }),
    (prisma as any).cadastroPeca.findUnique({
      where: { idPeca: sku },
      include: { moto: { select: { marca: true, modelo: true, ano: true } } },
    }).catch(() => null),
  ]);

  if (peca) {
    const estoque = await prisma.peca.count({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }], disponivel: true },
    });
    return {
      origem: 'peca',
      fotosOficiais: await contarFotosOficiais(peca.motoId, sku),
      blingProdutoId: txt(cadastro?.blingProdutoId),
      idPeca: peca.idPeca,
      descricao: peca.descricao,
      motoId: peca.motoId,
      moto: peca.moto || null,
      precoML: Number(peca.precoML || 0),
      pesoLiquido: num(peca.pesoLiquido),
      pesoBruto: num(peca.pesoBruto),
      largura: num(peca.largura),
      altura: num(peca.altura),
      profundidade: num(peca.profundidade),
      numeroPeca: txt(peca.numeroPeca),
      tipoPecaAvulsa: txt(peca.tipoPecaAvulsa),
      condicao: txt(cadastro?.condicao),
      estoque,
      shopeeItemId: txt(peca.shopeeItemId),
      magaluItemId: txt(peca.magaluItemId),
      nuvemshopProdutoId: txt(peca.nuvemshopProdutoId),
      shopeeCategoriaId: txt(peca.shopeeCategoriaId),
      magaluCategoriaId: txt(peca.magaluCategoriaId),
      nuvemshopCategoriaId: txt(peca.nuvemshopCategoriaId),
      nuvemshopTags: txt(peca.nuvemshopTags),
    };
  }

  // Ainda no pre-cadastro (peca restrita e sucata nao sao anunciadas; "cadastrado" sem Peca = nada a anunciar).
  if (cadastro && cadastro.status !== 'cadastrado' && !cadastro.pecaRestrita && !cadastro.sucata) {
    return {
      origem: 'cadastro',
      fotosOficiais: await contarFotosOficiais(cadastro.motoId, sku),
      blingProdutoId: txt(cadastro.blingProdutoId),
      idPeca: cadastro.idPeca,
      descricao: cadastro.descricao,
      motoId: cadastro.motoId,
      moto: cadastro.moto || null,
      precoML: Number(cadastro.precoVenda || 0),
      pesoLiquido: num(cadastro.peso),
      pesoBruto: num(cadastro.peso),
      largura: num(cadastro.largura),
      altura: num(cadastro.altura),
      profundidade: num(cadastro.profundidade),
      numeroPeca: txt(cadastro.numeroPeca),
      tipoPecaAvulsa: txt(cadastro.tipoPecaAvulsa),
      condicao: txt(cadastro.condicao),
      estoque: Math.max(1, Number(cadastro.estoque) || 1),
      shopeeItemId: txt(cadastro.shopeeItemId),
      magaluItemId: txt(cadastro.magaluItemId),
      nuvemshopProdutoId: txt(cadastro.nuvemshopProdutoId),
      shopeeCategoriaId: txt(cadastro.shopeeCategoriaId),
      magaluCategoriaId: txt(cadastro.magaluCategoriaId),
      nuvemshopCategoriaId: txt(cadastro.nuvemshopCategoriaId),
      nuvemshopTags: txt(cadastro.nuvemshopTags),
    };
  }

  return null;
}

// Grava no pre-cadastro E nas pecas (as que existirem) — assim o ID nao se perde em nenhum estagio.
export async function gravarIdsAnuncio(skuInput: string, data: Partial<Pick<AnuncioBase, 'shopeeItemId' | 'magaluItemId' | 'nuvemshopProdutoId' | 'nuvemshopCategoriaId' | 'nuvemshopTags'>>) {
  const sku = skuBaseAnuncio(skuInput);
  const limpo: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) limpo[k] = v;
  if (!sku || !Object.keys(limpo).length) return;
  await prisma.peca.updateMany({
    where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
    data: limpo as any,
  });
  await (prisma as any).cadastroPeca.updateMany({ where: { idPeca: sku }, data: limpo }).catch(() => null);
}
