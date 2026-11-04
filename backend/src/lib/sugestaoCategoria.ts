// Sugestao de categoria (SkuCategoria) pra pecas ainda sem categoria, SEM IA/tokens. Usa o que o sistema ja sabe:
//  A) categoria da Nuvemshop ja mapeada na propria peca/pre-cadastro;
//  B) mesmo codigo de categoria em outro marketplace (Shopee/Magalu/ML) usado por pecas ja categorizadas;
//  C) pecas parecidas (descricao) ja categorizadas;
//  D) regras de palavra-chave da Nuvemshop (so quando alguma regra casa — nunca o balde generico).
// Devolve ate 3 candidatas por SKU, da mais confiavel pra menos; a tela deixa o Bruno ajustar antes de salvar.
import { prisma } from './prisma';
import { nomeCategoriaNuvemshopPorRegra } from './nuvemshopCategoria';

export type Candidata = { nome: string; fonte: 'nuvemshop' | 'marketplace' | 'parecida' | 'regra'; detalhe: string; confianca: 'alta' | 'media' | 'baixa' };

const baseSku = (v: any) => String(v || '').replace(/-\d+$/, '').toUpperCase().trim();
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['para', 'com', 'sem', 'por', 'dos', 'das', 'uma', 'kit', 'par', 'lado', 'peca', 'pecas', 'original', 'usado', 'nova', 'novo']);

function tokens(texto: string, ruido: Set<string>): string[] {
  return Array.from(new Set(
    semAcento(texto).replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((t) => t.length >= 3 && !STOP.has(t) && !ruido.has(t) && !/^\d{4}$/.test(t) && !/^\d+$/.test(t)),
  ));
}

export async function sugerirCategoriasSemIA(motoId: number): Promise<{ sugestoes: Record<string, Candidata[]>; total: number; comSugestao: number }> {
  // unificacao (origem -> destino) pra falar o mesmo "idioma" do relatorio
  const mapa = new Map<string, string>();
  try {
    const rows = await prisma.$queryRaw<{ origem: string; destino: string }[]>`SELECT "origem", "destino" FROM "CategoriaUnificacao"`;
    for (const r of rows) { const o = String(r.origem || '').trim().toLowerCase(); const d = String(r.destino || '').trim(); if (o && d) mapa.set(o, d); }
  } catch { /* sem tabela */ }
  const unif = (n: string) => mapa.get(String(n).trim().toLowerCase()) || String(n).trim();

  const catRows = await prisma.$queryRaw<{ sku: string; nome: string }[]>`SELECT "sku", "nome" FROM "SkuCategoria" WHERE "nome" <> ''`;
  const catPorSku = new Map<string, string[]>();
  for (const r of catRows) {
    const sku = baseSku(r.sku); const nome = unif(r.nome);
    if (!catPorSku.has(sku)) catPorSku.set(sku, []);
    if (!catPorSku.get(sku)!.includes(nome)) catPorSku.get(sku)!.push(nome);
  }

  const motos = await prisma.moto.findMany({ select: { marca: true, modelo: true, sufixoTitulo: true } });
  const ruido = new Set<string>();
  for (const m of motos) for (const t of tokens(`${m.marca} ${m.modelo} ${m.sufixoTitulo || ''}`, new Set())) ruido.add(t);

  const pecas: any[] = await (prisma as any).peca.findMany({
    select: { idPeca: true, motoId: true, descricao: true, nuvemshopCategoriaId: true, shopeeCategoriaId: true, magaluCategoriaId: true },
  });
  const cadastros: any[] = await (prisma as any).cadastroPeca.findMany({
    select: { idPeca: true, nuvemshopCategoriaId: true, shopeeCategoriaId: true, magaluCategoriaId: true, categoriaMLId: true },
  });
  const cadPorSku = new Map<string, any>(cadastros.map((c) => [baseSku(c.idPeca), c]));

  // 1 linha por SKU base
  type Info = { sku: string; motoId: number; descricao: string; chaves: string[]; nuvemId: string };
  const infos = new Map<string, Info>();
  for (const p of pecas) {
    const sku = baseSku(p.idPeca);
    if (infos.has(sku)) continue;
    const c = cadPorSku.get(sku) || {};
    const chaves: string[] = [];
    const add = (pref: string, v: any) => { const s = String(v ?? '').trim(); if (s) chaves.push(`${pref}:${s}`); };
    add('Shopee', p.shopeeCategoriaId || c.shopeeCategoriaId);
    add('Magalu', p.magaluCategoriaId || c.magaluCategoriaId);
    add('Mercado Livre', c.categoriaMLId);
    infos.set(sku, { sku, motoId: p.motoId, descricao: p.descricao || '', chaves, nuvemId: String(p.nuvemshopCategoriaId || c.nuvemshopCategoriaId || '').trim() });
  }

  // nomes da arvore da Nuvemshop (espelho no banco) pra traduzir o ID ja mapeado
  const nuvemNome = new Map<string, string>();
  try {
    const cats = await prisma.$queryRaw<{ categoriaId: string; nome: string }[]>`SELECT "categoriaId", "nome" FROM "NuvemshopCategoria"`;
    for (const c of cats) nuvemNome.set(String(c.categoriaId), String(c.nome || '').trim());
  } catch { /* sem tabela */ }

  // B) indice: codigo de categoria de outro marketplace -> contagem por categoria entre as pecas JA categorizadas
  const porChave = new Map<string, Map<string, number>>();
  // C) base de comparacao: pecas categorizadas com tokens de descricao
  const treino: { sku: string; toks: Set<string>; nomes: string[] }[] = [];
  const indiceTok = new Map<string, number[]>();
  infos.forEach((info) => {
    const nomes = catPorSku.get(info.sku);
    if (!nomes || !nomes.length) return;
    info.chaves.forEach((k) => {
      if (!porChave.has(k)) porChave.set(k, new Map());
      const m = porChave.get(k)!;
      nomes.forEach((n) => m.set(n, (m.get(n) || 0) + 1));
    });
    const toks = new Set(tokens(info.descricao, ruido));
    if (!toks.size) return;
    const idx = treino.push({ sku: info.sku, toks, nomes }) - 1;
    toks.forEach((t) => { if (!indiceTok.has(t)) indiceTok.set(t, []); indiceTok.get(t)!.push(idx); });
  });

  const alvos = Array.from(infos.values()).filter((i) => i.motoId === motoId && !(catPorSku.get(i.sku) || []).length);
  const sugestoes: Record<string, Candidata[]> = {};

  for (const alvo of alvos) {
    const cands: Candidata[] = [];
    const jaTem = (nome: string) => cands.some((c) => c.nome.toLowerCase() === nome.toLowerCase());

    // A) categoria da Nuvemshop ja mapeada na peca
    if (alvo.nuvemId && nuvemNome.get(alvo.nuvemId)) {
      cands.push({ nome: unif(nuvemNome.get(alvo.nuvemId)!), fonte: 'nuvemshop', detalhe: 'Categoria da Nuvemshop já mapeada nesta peça', confianca: 'alta' });
    }

    // B) mesmo codigo em outro marketplace
    for (const k of alvo.chaves) {
      const m = porChave.get(k);
      if (!m) continue;
      const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
      const melhor = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
      if (!melhor || total < 2 || melhor[1] / total < 0.6 || jaTem(melhor[0])) continue;
      cands.push({ nome: melhor[0], fonte: 'marketplace', detalhe: `Mesma categoria ${k.split(':')[0]} de ${melhor[1]} peça(s) já categorizadas`, confianca: melhor[1] / total >= 0.85 ? 'alta' : 'media' });
    }

    // C) pecas parecidas ja categorizadas (Jaccard dos termos da descricao, sem o nome da moto)
    const toks = tokens(alvo.descricao, ruido);
    let parecida: Candidata | null = null;
    if (toks.length) {
      const conta = new Map<number, number>();
      toks.forEach((t) => (indiceTok.get(t) || []).forEach((i) => conta.set(i, (conta.get(i) || 0) + 1)));
      const votos = new Map<string, { peso: number; sku: string; sim: number }>();
      conta.forEach((inter, i) => {
        const t = treino[i];
        const sim = inter / (toks.length + t.toks.size - inter);
        if (sim < 0.4) return;
        t.nomes.forEach((n) => {
          const v = votos.get(n) || { peso: 0, sku: t.sku, sim: 0 };
          v.peso += sim * sim;
          if (sim > v.sim) { v.sim = sim; v.sku = t.sku; }
          votos.set(n, v);
        });
      });
      const top = Array.from(votos.entries()).sort((a, b) => b[1].peso - a[1].peso)[0];
      if (top) parecida = { nome: top[0], fonte: 'parecida', detalhe: `Parecida com ${top[1].sku} (${Math.round(top[1].sim * 100)}% de semelhança)`, confianca: top[1].sim >= 0.6 ? 'media' : 'baixa' };
    }
    if (parecida && parecida.confianca === 'media' && !jaTem(parecida.nome)) cands.push(parecida);

    // D) regra de palavra-chave
    try {
      const nome = await nomeCategoriaNuvemshopPorRegra(alvo.descricao);
      if (nome && !jaTem(unif(nome))) cands.push({ nome: unif(nome), fonte: 'regra', detalhe: 'Regra de palavras-chave da descrição', confianca: 'media' });
    } catch { /* arvore da Nuvemshop indisponivel: segue sem a regra */ }

    if (parecida && parecida.confianca === 'baixa' && !jaTem(parecida.nome)) cands.push(parecida);
    if (cands.length) sugestoes[alvo.sku] = cands.slice(0, 3);
  }

  return { sugestoes, total: alvos.length, comSugestao: Object.keys(sugestoes).length };
}
