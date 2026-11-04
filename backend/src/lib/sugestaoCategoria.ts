// Sugestao de categoria (SkuCategoria) pra pecas ainda sem categoria, SEM IA/tokens. Usa o que o sistema ja sabe:
//  A) categoria da Nuvemshop ja mapeada na propria peca/pre-cadastro;
//  B) mesmo codigo de categoria em outro marketplace (Shopee/Magalu/ML) usado por pecas ja categorizadas;
//  C) pecas parecidas (descricao) ja categorizadas;
//  D) regras de palavra-chave da Nuvemshop (so quando alguma regra casa — nunca o balde generico).
// Devolve ate 3 candidatas por SKU, da mais confiavel pra menos. Usos: sugestao em lote na Curva ABC (a tela deixa ajustar antes de salvar)
// e categorizacao automatica ao finalizar o pre-cadastro (aplicarCategoriaAoFinalizar).
import { prisma } from './prisma';
import { nomeCategoriaNuvemshopPorRegra } from './nuvemshopCategoria';

export type Candidata = { nome: string; fonte: 'nuvemshop' | 'marketplace' | 'parecida' | 'regra'; detalhe: string; confianca: 'alta' | 'media' | 'baixa' };
type Alvo = { sku: string; descricao: string; chaves: string[]; nuvemId: string };
type Info = Alvo & { motoId: number };

const baseSku = (v: any) => String(v || '').replace(/-\d+$/, '').toUpperCase().trim();
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['para', 'com', 'sem', 'por', 'dos', 'das', 'uma', 'kit', 'par', 'lado', 'peca', 'pecas', 'original', 'usado', 'nova', 'novo']);

function tokens(texto: string, ruido: Set<string>): string[] {
  return Array.from(new Set(
    semAcento(texto).replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((t) => t.length >= 3 && !STOP.has(t) && !ruido.has(t) && !/^\d+$/.test(t)),
  ));
}

const chavesDe = (shopee: any, magalu: any, ml: any) => {
  const out: string[] = [];
  const add = (pref: string, v: any) => { const s = String(v ?? '').trim(); if (s) out.push(`${pref}:${s}`); };
  add('Shopee', shopee); add('Magalu', magalu); add('Mercado Livre', ml);
  return out;
};

type Contexto = {
  unif: (n: string) => string;
  catPorSku: Map<string, string[]>;
  ruido: Set<string>;
  infos: Map<string, Info>;
  nuvemNome: Map<string, string>;
  porChave: Map<string, Map<string, number>>;
  treino: { sku: string; toks: Set<string>; nomes: string[] }[];
  indiceTok: Map<string, number[]>;
};

// O contexto le o banco inteiro (pecas, categorias, cadastros): fica em cache curto pra finalizar varias pecas seguidas sem refazer tudo.
let cacheCtx: { ctx: Contexto; ate: number } | null = null;
export function invalidarContextoSugestao() { cacheCtx = null; }

async function carregarContexto(forcar = false): Promise<Contexto> {
  if (!forcar && cacheCtx && cacheCtx.ate > Date.now()) return cacheCtx.ctx;

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
  const infos = new Map<string, Info>();
  for (const p of pecas) {
    const sku = baseSku(p.idPeca);
    if (infos.has(sku)) continue;
    const c = cadPorSku.get(sku) || {};
    infos.set(sku, {
      sku, motoId: p.motoId, descricao: p.descricao || '',
      chaves: chavesDe(p.shopeeCategoriaId || c.shopeeCategoriaId, p.magaluCategoriaId || c.magaluCategoriaId, c.categoriaMLId),
      nuvemId: String(p.nuvemshopCategoriaId || c.nuvemshopCategoriaId || '').trim(),
    });
  }

  // nomes da arvore da Nuvemshop (espelho no banco) pra traduzir o ID ja mapeado
  const nuvemNome = new Map<string, string>();
  try {
    const cats = await prisma.$queryRaw<{ categoriaId: string; nome: string }[]>`SELECT "categoriaId", "nome" FROM "NuvemshopCategoria"`;
    for (const c of cats) nuvemNome.set(String(c.categoriaId), String(c.nome || '').trim());
  } catch { /* sem tabela */ }

  // B) codigo de categoria de outro marketplace -> contagem por categoria entre as pecas JA categorizadas
  // C) base de comparacao: pecas categorizadas com os termos da descricao
  const porChave = new Map<string, Map<string, number>>();
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

  const ctx: Contexto = { unif, catPorSku, ruido, infos, nuvemNome, porChave, treino, indiceTok };
  cacheCtx = { ctx, ate: Date.now() + 2 * 60 * 1000 };
  return ctx;
}

async function candidatasPara(alvo: Alvo, ctx: Contexto): Promise<Candidata[]> {
  const { unif, nuvemNome, porChave, treino, indiceTok, ruido } = ctx;
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
      if (t.sku === alvo.sku) return;
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
  return cands.slice(0, 3);
}

// Lote da tela Curva ABC: todas as pecas da moto que ainda nao tem categoria.
export async function sugerirCategoriasSemIA(motoId: number): Promise<{ sugestoes: Record<string, Candidata[]>; total: number; comSugestao: number }> {
  const ctx = await carregarContexto(true);
  const alvos = Array.from(ctx.infos.values()).filter((i) => i.motoId === motoId && !(ctx.catPorSku.get(i.sku) || []).length);
  const sugestoes: Record<string, Candidata[]> = {};
  for (const alvo of alvos) {
    const c = await candidatasPara(alvo, ctx);
    if (c.length) sugestoes[alvo.sku] = c;
  }
  return { sugestoes, total: alvos.length, comSugestao: Object.keys(sugestoes).length };
}

// Ao finalizar o pre-cadastro (2o botao de confirmacao): se o SKU ainda nao tem categoria, grava a melhor candidata de confianca
// alta/media (origem 'manual': editavel na Curva ABC e preservada pela sincronizacao da Nuvemshop). Candidata fraca nao e gravada.
// Nunca lanca erro: falhar aqui nao pode travar a entrada da peca no estoque.
export async function aplicarCategoriaAoFinalizar(cadastro: any): Promise<void> {
  try {
    const sku = baseSku(cadastro?.idPeca);
    if (!sku) return;
    const ja = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "SkuCategoria" WHERE "sku" = ${sku}`;
    if (Number(ja[0]?.n) > 0) return;
    const ctx = await carregarContexto();
    const alvo: Alvo = {
      sku, descricao: String(cadastro?.descricao || ''), nuvemId: String(cadastro?.nuvemshopCategoriaId || '').trim(),
      chaves: chavesDe(cadastro?.shopeeCategoriaId, cadastro?.magaluCategoriaId, cadastro?.categoriaMLId),
    };
    const melhor = (await candidatasPara(alvo, ctx)).find((c) => c.confianca !== 'baixa');
    if (!melhor) return;
    const categoriaId = `manual:${melhor.nome.toLowerCase()}`;
    await prisma.$executeRaw`
      INSERT INTO "SkuCategoria" ("sku", "categoriaId", "nome", "origem", "atualizadoEm")
      VALUES (${sku}, ${categoriaId}, ${melhor.nome}, 'manual', now())
      ON CONFLICT ("sku", "categoriaId") DO NOTHING
    `;
    invalidarContextoSugestao(); // a peça recem categorizada ja vale como exemplo pra proxima
    console.log(`[categoria-auto] ${sku} -> ${melhor.nome} (${melhor.fonte}: ${melhor.detalhe})`);
  } catch (e: any) {
    console.error('[categoria-auto] falha ao categorizar', cadastro?.idPeca, e?.message || e);
  }
}
