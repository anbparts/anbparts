// Vinculos de anuncio por SKU (aba Anuncio): mostra o ID do anuncio de cada marketplace no NOSSO sistema e
// no BLING (vinculo produto-loja), avisa quando ja existe, e permite REMOVER pra liberar o SKU e
// recriar (o marketplace as vezes derruba o anuncio). Duas formas:
//   - "sistema": apaga o ID nas nossas tabelas (Peca / pre-cadastro);
//   - "sistema_bling": alem disso remove o vinculo no Bling (DELETE /produtos/lojas/{id}) e, no
//     Mercado Livre, o anuncio do Bling (DELETE /anuncios/{id}) — sem isso a auditoria do Bling
//     preenche o ID de volta e a criacao continua bloqueada.
// NAO apaga o produto/anuncio dentro do marketplace (Shopee/Magalu/Nuvemshop): isso se faz la.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { blingReq } from './bling';
import { carregarAnuncioBase, skuBaseAnuncio } from '../lib/anuncioBase';
import { resolverBlingProdutoId } from '../lib/anuncioPreparar';
import { ML_LOJA_BLING_ID } from '../lib/mlCategorias';

export const anuncioVinculosRouter = Router();

type Mk = 'shopee' | 'magalu' | 'nuvemshop' | 'mercado-livre';
const MARKETPLACES: Mk[] = ['shopee', 'magalu', 'nuvemshop', 'mercado-livre'];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lojasBling(): Promise<Record<Mk, number | null>> {
  const cfg: any = await prisma.blingConfig.findFirst();
  return {
    shopee: cfg?.shopeeLojaId ? Number(cfg.shopeeLojaId) : null,
    magalu: cfg?.magaluLojaId ? Number(cfg.magaluLojaId) : null,
    nuvemshop: cfg?.nuvemshopLojaId ? Number(cfg.nuvemshopLojaId) : null,
    'mercado-livre': ML_LOJA_BLING_ID,
  };
}

// Campos a zerar nas nossas tabelas, por marketplace.
const CAMPOS_PECA: Record<Mk, Record<string, null>> = {
  shopee: { shopeeItemId: null, shopeeLink: null },
  magalu: { magaluItemId: null, magaluLink: null },
  nuvemshop: { nuvemshopProdutoId: null },
  'mercado-livre': { mercadoLivreItemId: null, mercadoLivreLink: null },
};
const CAMPOS_CADASTRO: Partial<Record<Mk, Record<string, null>>> = {
  shopee: { shopeeItemId: null },
  magalu: { magaluItemId: null },
  nuvemshop: { nuvemshopProdutoId: null },
};

type Vinculo = {
  sistemaId: string | null;
  blingCodigo: string | null;
  blingVinculoId: string | null;
  blingAnuncioId: string | null; // so Mercado Livre
  status: 'livre' | 'ok' | 'divergente' | 'so_bling' | 'so_sistema';
};

function classificar(sistemaId: string | null, blingCodigo: string | null): Vinculo['status'] {
  if (!sistemaId && !blingCodigo) return 'livre';
  if (sistemaId && !blingCodigo) return 'so_sistema';
  if (!sistemaId && blingCodigo) return 'so_bling';
  // Magalu: o Bling pode guardar "SKU/agrupador" — conta como o mesmo ID se comeca igual.
  const a = String(sistemaId); const b = String(blingCodigo);
  return a === b || b.startsWith(`${a}/`) || a.startsWith(`${b}/`) ? 'ok' : 'divergente';
}

async function idsNoSistema(sku: string, base: Awaited<ReturnType<typeof carregarAnuncioBase>>): Promise<Record<Mk, string | null>> {
  const peca: any = await prisma.peca.findFirst({
    where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
    select: { mercadoLivreItemId: true },
  });
  return {
    shopee: base?.shopeeItemId || null,
    magalu: base?.magaluItemId || null,
    nuvemshop: base?.nuvemshopProdutoId || null,
    'mercado-livre': peca?.mercadoLivreItemId ? String(peca.mercadoLivreItemId) : null,
  };
}

// POST /anuncio-vinculos/consultar — body: { skus }. 1 chamada ao Bling por SKU (todos os vinculos do produto).
anuncioVinculosRouter.post('/consultar', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => skuBaseAnuncio(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    const lojas = await lojasBling();
    const resultado: any[] = [];

    for (const sku of skus) {
      const base = await carregarAnuncioBase(sku);
      if (!base) { resultado.push({ sku, encontrado: false }); continue; }

      const sistema = await idsNoSistema(sku, base);
      const linhaBling: Record<string, { codigo: string; vinculoId: string }> = {};
      let blingProdutoId: string | null = null;
      let erroBling = '';
      try {
        blingProdutoId = await resolverBlingProdutoId(base);
        const r = await blingReq(`/produtos/lojas?idProduto=${blingProdutoId}&limite=100`) as any;
        for (const v of (Array.isArray(r?.data) ? r.data : [])) {
          const lojaId = Number(v?.loja?.id || v?.idLoja);
          if (lojaId && v?.codigo) linhaBling[String(lojaId)] = { codigo: String(v.codigo), vinculoId: String(v.id) };
        }
      } catch (e: any) {
        erroBling = e?.message || 'Falha ao ler os vinculos no Bling';
      }

      const mercados: Record<string, Vinculo> = {};
      for (const mk of MARKETPLACES) {
        const lojaId = lojas[mk];
        const b = lojaId ? linhaBling[String(lojaId)] : undefined;
        let blingCodigo = b?.codigo || null;
        let blingAnuncioId: string | null = null;

        // Mercado Livre: o anuncio vive em /anuncios (criado pelo Bling) — o MLB... esta em anuncioLoja.id.
        if (mk === 'mercado-livre' && blingProdutoId) {
          try {
            const r = await blingReq(`/anuncios?idProduto=${blingProdutoId}&limite=5&tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
            const a = (Array.isArray(r?.data) ? r.data : [])[0];
            if (a?.id) { blingAnuncioId = String(a.id); blingCodigo = blingCodigo || (a.anuncioLoja?.id ? String(a.anuncioLoja.id) : `anuncio Bling ${a.id}`); }
          } catch { /* sem anuncio ML no Bling */ }
          await dormir(250);
        }

        mercados[mk] = {
          sistemaId: sistema[mk],
          blingCodigo,
          blingVinculoId: b?.vinculoId || null,
          blingAnuncioId,
          status: classificar(sistema[mk], blingCodigo),
        };
      }
      resultado.push({ sku, encontrado: true, blingProdutoId, erroBling: erroBling || undefined, mercados });
      await dormir(250); // o Bling limita as chamadas por segundo
    }

    res.json({ ok: true, skus: resultado });
  } catch (e) { next(e); }
});

// POST /anuncio-vinculos/remover — body: { sku, marketplace, alvo: 'sistema' | 'sistema_bling' }.
anuncioVinculosRouter.post('/remover', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.body?.sku);
    const mk = String(req.body?.marketplace || '') as Mk;
    const alvo = String(req.body?.alvo || '');
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!MARKETPLACES.includes(mk)) return res.status(400).json({ error: 'marketplace invalido' });
    if (alvo !== 'sistema' && alvo !== 'sistema_bling') return res.status(400).json({ error: 'alvo deve ser "sistema" ou "sistema_bling"' });

    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });

    const removidoNoBling: string[] = [];
    // Bling PRIMEIRO: se falhar, nada e' apagado aqui (o Bruno pode tentar de novo sem ficar inconsistente).
    if (alvo === 'sistema_bling') {
      const lojas = await lojasBling();
      const lojaId = lojas[mk];
      const blingProdutoId = await resolverBlingProdutoId(base);

      if (lojaId) {
        const r = await blingReq(`/produtos/lojas?idProduto=${blingProdutoId}&idLoja=${lojaId}&limite=20`) as any;
        for (const v of (Array.isArray(r?.data) ? r.data : [])) {
          await blingReq(`/produtos/lojas/${v.id}`, { method: 'DELETE' });
          removidoNoBling.push(`vinculo ${v.id}${v.codigo ? ` (${v.codigo})` : ''}`);
          await dormir(300);
        }
      }
      if (mk === 'mercado-livre') {
        const r = await blingReq(`/anuncios?idProduto=${blingProdutoId}&limite=20&tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
        for (const a of (Array.isArray(r?.data) ? r.data : [])) {
          await blingReq(`/anuncios/${a.id}?tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`, { method: 'DELETE' });
          removidoNoBling.push(`anuncio ${a.id}${a.anuncioLoja?.id ? ` (${a.anuncioLoja.id})` : ''}`);
          await dormir(300);
        }
      }
    }

    // Nosso sistema: zera o ID (e link) nas pecas e no pre-cadastro => SKU livre pra recriar nesse marketplace.
    await prisma.peca.updateMany({
      where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] },
      data: CAMPOS_PECA[mk] as any,
    });
    const camposCadastro = CAMPOS_CADASTRO[mk];
    if (camposCadastro) await (prisma as any).cadastroPeca.updateMany({ where: { idPeca: sku }, data: camposCadastro }).catch(() => null);

    console.log(`[anuncio-vinculos] ${sku} / ${mk}: removido (${alvo})${removidoNoBling.length ? ` — Bling: ${removidoNoBling.join(', ')}` : ''}`);
    res.json({ ok: true, sku, marketplace: mk, alvo, removidoNoBling });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao remover o vinculo do anuncio' });
  }
});
