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
import { carregarAnuncioBase, skuBaseAnuncio, gravarIdsAnuncio } from '../lib/anuncioBase';
import { resolverBlingProdutoId } from '../lib/anuncioPreparar';
import { ML_LOJA_BLING_ID } from '../lib/mlCategorias';
import { shopeeGetItemBaseInfo } from '../lib/shopee-api';
import { magaluGetSku, magaluAtualizarConteudoSku } from '../lib/magalu-api';
import { nuvemReq, buscarProdutoNuvemshopPorSku } from './nuvemshop';

export const anuncioVinculosRouter = Router();

type Mk = 'shopee' | 'magalu' | 'nuvemshop' | 'mercado-livre';
const MARKETPLACES: Mk[] = ['shopee', 'magalu', 'nuvemshop', 'mercado-livre'];

const SITUACAO_ANUNCIO: Record<number, string> = { 1: 'Publicado', 2: 'Rascunho', 3: 'Com problema', 4: 'Pausado' };
const SHOPEE_STATUS: Record<string, { texto: string; ok: boolean }> = {
  NORMAL: { texto: 'Ativo', ok: true },
  UNLIST: { texto: 'Inativo (oculto)', ok: false },
  BANNED: { texto: 'Banido pela Shopee', ok: false },
  REVIEWING: { texto: 'Em análise', ok: false },
  SELLER_DELETE: { texto: 'Excluído', ok: false },
  SHOPEE_DELETE: { texto: 'Excluído pela Shopee', ok: false },
};
const NAO_EXISTE = { texto: 'Não existe mais', ok: false };
const naoEncontrado = (e: any) => /nao encontrad|not found|404|not_found|does not exist/i.test(String(e?.message || e));

// Le a situacao REAL do anuncio no proprio marketplace (ML vem do Bling, que repete o que o ML informa).
async function situacaoNoMarketplace(mk: Mk, sku: string, id: string | null): Promise<{ texto: string; ok: boolean } | null> {
  if (!id) return null;
  try {
    if (mk === 'shopee') {
      const item = await shopeeGetItemBaseInfo(id);
      const st = String(item?.item_status || '').toUpperCase();
      return SHOPEE_STATUS[st] || { texto: st ? st.toLowerCase() : 'status desconhecido', ok: false };
    }
    if (mk === 'magalu') {
      const d: any = await magaluGetSku(sku);
      const st = String(d?.status || '').toLowerCase();
      if (!st) return null;
      const mapa: Record<string, { texto: string; ok: boolean }> = {
        published: { texto: 'Publicado', ok: true }, active: { texto: 'Ativo', ok: true },
        draft: { texto: 'Rascunho / em análise', ok: false }, inactive: { texto: 'Inativo', ok: false },
        blocked: { texto: 'Bloqueado', ok: false }, rejected: { texto: 'Reprovado', ok: false },
      };
      return mapa[st] || { texto: st, ok: false };
    }
    if (mk === 'nuvemshop') {
      const p: any = await nuvemReq(`/products/${encodeURIComponent(id)}`);
      if (!p?.id) return NAO_EXISTE;
      return p.published === true ? { texto: 'Publicado', ok: true } : { texto: 'Oculto na loja', ok: false };
    }
  } catch (e) {
    if (naoEncontrado(e)) return NAO_EXISTE;
  }
  return null;
}

// SKUs do chamado aberto no Magalu (#151916890): NAO mexer ate eles responderem.
// Trava: exclusao no marketplace (Magalu = desativar o SKU) deixada DESLIGADA ate o Bruno liberar. Mudar para true pra ativar.
const EXCLUIR_NO_MARKETPLACE_ATIVO = false;
const MAGALU_SKUS_INTOCAVEIS = new Set(['BM03_0107', 'BM03_0119', 'BM03_0084']);
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
  situacao?: { texto: string; ok: boolean } | null; // situacao do anuncio no proprio marketplace (ok = ativo/publicado)
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

// POST /anuncio-vinculos/status — body: { skus }. RAPIDO: so le a situacao (ativo/inativo/...) de Shopee, Magalu e
// Nuvemshop direto nos marketplaces, em paralelo, usando os IDs que o nosso sistema ja tem (sem tocar no Bling).
// A tela chama isso primeiro pra pintar os status das celulas; /consultar (mais lento, usa o Bling) vem depois.
anuncioVinculosRouter.post('/status', async (req, res, next) => {
  try {
    const skusInput = Array.isArray(req.body?.skus) ? req.body.skus : [];
    const skus: string[] = Array.from(new Set(skusInput.map((s: any) => skuBaseAnuncio(s)).filter(Boolean))) as string[];
    if (!skus.length) return res.status(400).json({ error: 'Informe ao menos 1 SKU' });

    const tarefas: Array<{ sku: string; mk: Mk; id: string }> = [];
    for (const sku of skus) {
      const base = await carregarAnuncioBase(sku);
      if (!base) continue;
      const ids = await idsNoSistema(sku, base);
      for (const mk of ['shopee', 'magalu', 'nuvemshop'] as Mk[]) if (ids[mk]) tarefas.push({ sku, mk, id: String(ids[mk]) });
    }

    const resultado: Record<string, Record<string, { texto: string; ok: boolean } | null>> = {};
    let proximo = 0;
    const trabalhador = async () => {
      while (proximo < tarefas.length) {
        const t = tarefas[proximo++];
        const sit = await situacaoNoMarketplace(t.mk, t.sku, t.id);
        (resultado[t.sku] = resultado[t.sku] || {})[t.mk] = sit;
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, tarefas.length) }, () => trabalhador()));
    res.json({ ok: true, status: resultado });
  } catch (e) { next(e); }
});

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
        let situacao: Vinculo['situacao'] = null;

        // Mercado Livre: o anuncio vive em /anuncios (criado pelo Bling) — o MLB... esta em anuncioLoja.id.
        if (mk === 'mercado-livre' && blingProdutoId) {
          try {
            const r = await blingReq(`/anuncios?idProduto=${blingProdutoId}&limite=5&tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
            const a = (Array.isArray(r?.data) ? r.data : [])[0];
            if (a?.id) { blingAnuncioId = String(a.id); const cod = Number(a.situacao); if (cod) situacao = { texto: SITUACAO_ANUNCIO[cod] || `situacao ${cod}`, ok: cod === 1 }; blingCodigo = blingCodigo || (a.anuncioLoja?.id ? String(a.anuncioLoja.id) : `anuncio Bling ${a.id}`); }
          } catch { /* sem anuncio ML no Bling */ }
          await dormir(250);
        }

        // Nuvemshop: o Bling tem o vinculo e o sistema esta vazio => o produto ja existe la. Confere na propria loja (busca pelo SKU)
        // e grava o ID certo do PRODUTO no sistema na hora, pra nao precisar clicar "Usar ID do Bling" um a um.
        // (O codigo do Bling pode ser o ID da VARIANTE, por isso o ID vem da busca na loja, nunca do codigo.)
        let adotadoAuto = false;
        if (mk === 'nuvemshop' && !sistema[mk] && blingCodigo) {
          try {
            const p: any = await buscarProdutoNuvemshopPorSku(sku, true);
            if (p?.id) {
              await gravarIdsAnuncio(sku, { nuvemshopProdutoId: String(p.id) } as any);
              sistema[mk] = String(p.id);
              adotadoAuto = true;
              console.log(`[anuncio-vinculos] ${sku} / nuvemshop: ID do sistema preenchido automaticamente (${p.id}) — o Bling ja tinha o vinculo`);
            }
          } catch (e: any) {
            console.warn(`[anuncio-vinculos] ${sku} / nuvemshop: nao consegui confirmar na loja para preencher o ID: ${e?.message || e}`);
          }
        }

        mercados[mk] = {
          sistemaId: sistema[mk],
          blingCodigo,
          blingVinculoId: b?.vinculoId || null,
          blingAnuncioId,
          situacao,
          status: adotadoAuto ? 'ok' : classificar(sistema[mk], blingCodigo),
        };
      }
      resultado.push({ sku, encontrado: true, blingProdutoId, erroBling: erroBling || undefined, mercados });
      await dormir(250); // o Bling limita as chamadas por segundo
    }

    res.json({ ok: true, skus: resultado });
  } catch (e) { next(e); }
});

// POST /anuncio-vinculos/adotar — body: { sku, marketplace }. Quando o ID do NOSSO sistema esta errado/vazio mas o BLING tem o
// vinculo certo (ex: ID antigo de teste/sandbox), grava no sistema o ID que o Bling tem — depois de CONFERIR no proprio
// marketplace que o anuncio existe e e' desse SKU. Nao altera nada no Bling nem no marketplace (so leitura la).
anuncioVinculosRouter.post('/adotar', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.body?.sku);
    const mk = String(req.body?.marketplace || '') as Mk;
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!MARKETPLACES.includes(mk)) return res.status(400).json({ error: 'marketplace invalido' });
    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB.' });

    const lojas = await lojasBling();
    const blingProdutoId = await resolverBlingProdutoId(base);
    let codigoBling = '';
    if (mk === 'mercado-livre') {
      const r = await blingReq(`/anuncios?idProduto=${blingProdutoId}&limite=5&tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
      const a = (Array.isArray(r?.data) ? r.data : [])[0];
      codigoBling = String(a?.anuncioLoja?.id || '');
    } else {
      const lojaId = lojas[mk];
      if (!lojaId) return res.status(400).json({ error: 'Loja do Bling desse marketplace nao configurada.' });
      const r = await blingReq(`/produtos/lojas?idProduto=${blingProdutoId}&idLoja=${lojaId}&limite=5`) as any;
      codigoBling = String((Array.isArray(r?.data) ? r.data : [])[0]?.codigo || '');
    }
    if (!codigoBling) return res.status(400).json({ error: 'O Bling nao tem vinculo desse marketplace para este SKU.' });

    // Confere no proprio marketplace antes de gravar.
    let idFinal = '';
    if (mk === 'shopee') {
      const id = codigoBling.replace(/\D/g, '');
      const item: any = await shopeeGetItemBaseInfo(id).catch(() => null);
      if (!item) return res.status(400).json({ error: `O item ${id} (do Bling) nao existe na Shopee — nao adotei.` });
      if (String(item.item_sku || '') && String(item.item_sku) !== sku) return res.status(400).json({ error: `O item ${id} da Shopee e' do SKU "${item.item_sku}", nao deste (${sku}) — nao adotei.` });
      idFinal = id;
      await gravarIdsAnuncio(sku, { shopeeItemId: idFinal } as any);
    } else if (mk === 'magalu') {
      const id = codigoBling.split('/')[0];
      const d: any = await magaluGetSku(id).catch(() => null);
      if (!d) return res.status(400).json({ error: `O SKU ${id} nao existe no Magalu — nao adotei.` });
      idFinal = id;
      await gravarIdsAnuncio(sku, { magaluItemId: idFinal } as any);
    } else if (mk === 'nuvemshop') {
      // O codigo do Bling pode ser o ID da VARIANTE: o ID certo do produto vem da busca por SKU na loja.
      const p: any = await buscarProdutoNuvemshopPorSku(sku, true);
      if (!p?.id) return res.status(400).json({ error: 'Produto nao encontrado na Nuvemshop pelo SKU — nao adotei.' });
      idFinal = String(p.id);
      await gravarIdsAnuncio(sku, { nuvemshopProdutoId: idFinal } as any);
    } else {
      idFinal = codigoBling;
      await prisma.peca.updateMany({ where: { OR: [{ idPeca: sku }, { idPeca: { startsWith: `${sku}-` } }] }, data: { mercadoLivreItemId: idFinal } as any });
    }
    console.log(`[anuncio-vinculos] ${sku} / ${mk}: ID do sistema ajustado para ${idFinal} (conforme Bling, conferido no marketplace)`);
    res.json({ ok: true, sku, marketplace: mk, idAdotado: idFinal });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao adotar o ID do Bling' });
  }
});

// POST /anuncio-vinculos/remover — body: { sku, marketplace, alvo: 'sistema' | 'sistema_bling' }.
anuncioVinculosRouter.post('/remover', async (req, res) => {
  try {
    const sku = skuBaseAnuncio(req.body?.sku);
    const mk = String(req.body?.marketplace || '') as Mk;
    const alvo = String(req.body?.alvo || '');
    if (!sku) return res.status(400).json({ error: 'sku obrigatorio' });
    if (!MARKETPLACES.includes(mk)) return res.status(400).json({ error: 'marketplace invalido' });
    if (alvo !== 'sistema' && alvo !== 'sistema_bling' && alvo !== 'sistema_bling_marketplace') return res.status(400).json({ error: 'alvo invalido' });
    if (alvo === 'sistema_bling_marketplace' && !EXCLUIR_NO_MARKETPLACE_ATIVO) return res.status(400).json({ error: 'Exclusao no marketplace ainda nao esta ativada.' });
    if (alvo === 'sistema_bling_marketplace' && mk !== 'magalu') return res.status(400).json({ error: 'A exclusao no marketplace so esta disponivel para o Magalu por enquanto.' });

    const base = await carregarAnuncioBase(sku);
    if (!base) return res.status(404).json({ error: 'SKU nao encontrado no ANB (nem em Pecas, nem no pre-cadastro).' });

    const removidoNoBling: string[] = [];
    let marketplaceFeito = '';

    // Marketplace PRIMEIRO (se falhar, nada e' apagado no Bling nem no sistema). A API do Magalu NAO tem exclusao
    // de SKU: o maximo possivel e' DESATIVAR (PATCH active:false). So permite se o anuncio NAO estiver publicado.
    if (alvo === 'sistema_bling_marketplace') {
      if (MAGALU_SKUS_INTOCAVEIS.has(sku)) return res.status(400).json({ error: `${sku} esta no chamado aberto no Magalu (#151916890): nao mexer ate responderem.` });
      let st = '';
      try {
        const d: any = await magaluGetSku(sku);
        st = String(d?.status || '').toLowerCase();
      } catch (e: any) {
        if (!/nao encontrad|not found|404/i.test(String(e?.message || e))) throw e;
        st = 'inexistente';
      }
      if (st === 'published' || st === 'active') return res.status(400).json({ error: `O anuncio ${sku} esta PUBLICADO no Magalu — por seguranca nao desativo anuncio publicado por aqui. Despublique no painel do Magalu e tente de novo.` });
      if (st !== 'inexistente') {
        await magaluAtualizarConteudoSku(sku, { active: false });
        marketplaceFeito = `SKU ${sku} desativado no Magalu (status ${st || 'desconhecido'}); a API do Magalu nao permite excluir`;
      } else {
        marketplaceFeito = `SKU ${sku} nao existe mais no Magalu`;
      }
    }

    // Bling PRIMEIRO: se falhar, nada e' apagado aqui (o Bruno pode tentar de novo sem ficar inconsistente).
    if (alvo === 'sistema_bling' || alvo === 'sistema_bling_marketplace') {
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
    res.json({ ok: true, sku, marketplace: mk, alvo, removidoNoBling, marketplace_acao: marketplaceFeito || undefined });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Erro ao remover o vinculo do anuncio' });
  }
});
