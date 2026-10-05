// Categorias do Mercado Livre pra peca/acessorio de MOTO: espelho das categorias-folha (so as raizes de
// moto), sugestao inteligente por titulo (candidatos + IA, com plano B por palavras) e verificacao de
// RESTRICOES de cada categoria (anuncio nao permitido, nao aceita usado, atributos obrigatorios que o
// sistema ainda nao preenche...). Usa a API publica do ML (categorias nao exigem token) e a API de
// Anuncios do Bling pra ler os atributos obrigatorios.
import { blingReq } from '../routes/bling';

const ML_API = 'https://api.mercadolibre.com';
export const ML_LOJA_BLING_ID = 205204423; // loja "Mercado Livre" no Bling

// Raizes de moto dentro de "Acessorios para Veiculos" (MLB5672).
const RAIZES_MOTO = ['MLB243551' /* Pecas de Motos e Quadriciclos */, 'MLB1771' /* Aces. de Motos e Quadriciclos */];
const RAIZES_OUTROS = ['MLB243552' /* Pecas > Outros */, 'MLB3936' /* Aces > Outros */];

export type FolhaML = { id: string; nome: string; caminho: string };

// ---------- util ----------
function norm(s: string | null | undefined) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'e', 'a', 'o', 'as', 'os', 'par', 'kit', 'usado', 'usada', 'usd', 'original', 'peca', 'pecas', 'moto', 'motos', 'lado', 'direito', 'esquerdo', 'direita', 'esquerda']);
function tokens(s: string, extraIgnorar: Set<string> = new Set()) {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !extraIgnorar.has(t) && !/^\d+$/.test(t));
}

async function mlGet(path: string, tentativas = 3): Promise<any> {
  let ultimo: any;
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(`${ML_API}${path}`, { signal: ctrl.signal, headers: { 'User-Agent': 'ANB Parts' } });
      if (r.ok) return await r.json();
      ultimo = new Error(`ML ${r.status}`);
      if (r.status === 404) break;
    } catch (e: any) {
      ultimo = e;
    } finally {
      clearTimeout(t);
    }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw ultimo || new Error('Falha ao consultar o Mercado Livre');
}

// ---------- espelho das folhas de moto ----------
let cacheFolhas: { itens: FolhaML[]; expira: number } | null = null;
let carregando: Promise<FolhaML[]> | null = null;
const TTL_FOLHAS = 12 * 60 * 60 * 1000;

async function construirFolhas(): Promise<FolhaML[]> {
  const folhas: FolhaML[] = [];
  const fila: string[] = [...RAIZES_MOTO];
  const visitados = new Set<string>();
  const trabalhar = async () => {
    while (fila.length) {
      const id = fila.shift() as string;
      if (visitados.has(id)) continue;
      visitados.add(id);
      let cat: any;
      try { cat = await mlGet(`/categories/${id}`); } catch { continue; }
      const filhos: any[] = Array.isArray(cat.children_categories) ? cat.children_categories : [];
      if (filhos.length) {
        for (const f of filhos) fila.push(String(f.id));
      } else {
        const caminho = (cat.path_from_root || []).slice(1).map((p: any) => p.name).join(' > ');
        folhas.push({ id: String(cat.id), nome: String(cat.name), caminho });
      }
    }
  };
  await Promise.all(Array.from({ length: 14 }, () => trabalhar()));
  folhas.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'));
  return folhas;
}

// Aquece o espelho em segundo plano na subida do servidor (a carga fria leva ~10-20s).
export function aquecerFolhasMoto() {
  carregarFolhasMoto().then((f) => console.log(`[mlCategorias] espelho de moto carregado: ${f.length} categorias-folha`)).catch((e) => console.warn('[mlCategorias] falha ao aquecer espelho:', e?.message || e));
}

export async function carregarFolhasMoto(): Promise<FolhaML[]> {
  if (cacheFolhas && cacheFolhas.expira > Date.now()) return cacheFolhas.itens;
  if (!carregando) {
    carregando = construirFolhas()
      .then((itens) => {
        if (itens.length) cacheFolhas = { itens, expira: Date.now() + TTL_FOLHAS };
        return itens;
      })
      .finally(() => { carregando = null; });
  }
  return carregando;
}

// ---------- configuracao / restricoes ----------
const cacheCfg = new Map<string, { cfg: any; expira: number }>();
async function configCategoria(id: string) {
  const hit = cacheCfg.get(id);
  if (hit && hit.expira > Date.now()) return hit.cfg;
  const cat = await mlGet(`/categories/${encodeURIComponent(id)}`);
  cacheCfg.set(id, { cfg: cat, expira: Date.now() + TTL_FOLHAS });
  return cat;
}

// Atributos que o sistema sabe preencher na criacao (o resto, se obrigatorio, vira restricao).
const ATRIBUTOS_SUPORTADOS = new Set([
  'BRAND', 'PART_NUMBER', 'GTIN', 'EMPTY_GTIN_REASON', 'ITEM_CONDITION', 'SELLER_SKU',
  'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WEIGHT',
]);

const cacheAttrs = new Map<string, { itens: any[]; expira: number }>();
export async function atributosCategoriaML(id: string): Promise<any[]> {
  const hit = cacheAttrs.get(id);
  if (hit && hit.expira > Date.now()) return hit.itens;
  const r = await blingReq(`/anuncios/categorias/${encodeURIComponent(id)}?tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`) as any;
  const itens = Array.isArray(r?.data) ? r.data : [];
  cacheAttrs.set(id, { itens, expira: Date.now() + TTL_FOLHAS });
  return itens;
}

export type VerificacaoCategoria = { ok: boolean; caminho: string; nome: string; restricoes: string[]; avisos: string[] };

export async function verificarCategoriaML(id: string, condicao: 'usado' | 'novo'): Promise<VerificacaoCategoria> {
  const restricoes: string[] = [];
  const avisos: string[] = [];
  let caminho = '';
  let nome = '';
  try {
    const cat = await configCategoria(id);
    nome = String(cat.name || '');
    caminho = (cat.path_from_root || []).slice(1).map((p: any) => p.name).join(' > ');
    const st = cat.settings || {};
    if (Array.isArray(cat.children_categories) && cat.children_categories.length) restricoes.push('Categoria não é a final (tem subcategorias) — escolha uma mais específica.');
    if (st.listing_allowed === false) restricoes.push('O Mercado Livre não permite anunciar nesta categoria.');
    if (st.status && st.status !== 'enabled') restricoes.push(`Categoria com status "${st.status}" no Mercado Livre.`);
    const conds: string[] = Array.isArray(st.item_conditions) ? st.item_conditions : [];
    if (conds.length) {
      if (condicao === 'usado' && !conds.includes('used')) restricoes.push('A categoria não aceita produto USADO.');
      if (condicao === 'novo' && !conds.includes('new')) restricoes.push('A categoria não aceita produto NOVO.');
    }
    if (Array.isArray(st.restrictions) && st.restrictions.length) restricoes.push(`Restrições do Mercado Livre: ${JSON.stringify(st.restrictions).slice(0, 160)}`);
  } catch (e: any) {
    avisos.push(`Não foi possível consultar a categoria no Mercado Livre (${e?.message || e}).`);
  }

  try {
    const attrs = await atributosCategoriaML(id);
    const faltam = attrs.filter((a: any) => a?.obrigatorio && !ATRIBUTOS_SUPORTADOS.has(String(a.id))).map((a: any) => `${a.nome || a.id}`);
    if (faltam.length) restricoes.push(`Exige atributo(s) que o sistema ainda não preenche: ${faltam.join(', ')}.`);
  } catch (e: any) {
    avisos.push('Não foi possível ler os atributos obrigatórios da categoria no Bling.');
  }

  return { ok: restricoes.length === 0, caminho, nome, restricoes, avisos };
}

// ---------- sugestao inteligente ----------
const cacheSugestao = new Map<string, { r: any; expira: number }>();

function pontuar(titTokens: string[], f: FolhaML) {
  const nomeT = new Set(tokens(f.nome));
  const caminhoT = new Set(tokens(f.caminho));
  let s = 0;
  for (const t of titTokens) {
    if (nomeT.has(t)) s += 4;
    else if ([...nomeT].some((n) => n.startsWith(t.slice(0, 5)) || t.startsWith(n.slice(0, 5)))) s += 2;
    if (caminhoT.has(t)) s += 1;
  }
  return s;
}

async function candidatosDomainDiscovery(titulo: string): Promise<string[]> {
  const ids: string[] = [];
  for (const q of [`${titulo} moto`, titulo]) {
    try {
      const r = await mlGet(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(q)}&limit=8`, 1);
      if (Array.isArray(r)) for (const x of r) if (x?.category_id) ids.push(String(x.category_id));
    } catch { /* segue */ }
  }
  return ids;
}

async function escolherComIA(titulo: string, moto: string, condicao: string, candidatos: FolhaML[]) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error('ANTHROPIC_API_KEY nao configurado');
  const lista = candidatos.map((c) => `${c.id} | ${c.caminho}`).join('\n');
  const prompt = `Voce classifica pecas e acessorios de MOTO (${condicao}) para o Mercado Livre Brasil.

PRODUTO: ${titulo.replace(/["\\]/g, '')}
MOTO: ${moto.replace(/["\\]/g, '')}

CATEGORIAS CANDIDATAS (id | caminho):
${lista}

Escolha a categoria FINAL mais especifica e adequada para este produto. Regras:
- Prefira a categoria que descreve a PECA (ex: carenagem -> categoria de carenagens/chassis), nunca uma categoria de outro tipo so porque o nome parece parecido.
- Se nenhuma servir, escolha a categoria "Outros" da familia correta (pecas ou acessorios).
- Responda SOMENTE pela ferramenta, com um id exatamente igual a um da lista.`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': chave },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        tool_choice: { type: 'tool', name: 'escolher_categoria' },
        tools: [{
          name: 'escolher_categoria',
          description: 'Escolhe a categoria do Mercado Livre para o produto.',
          input_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              categoria_id: { type: 'string' },
              confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
              alternativas: { type: 'array', items: { type: 'string' } },
            },
            required: ['categoria_id', 'confianca'],
          },
        }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
    const data: any = await resp.json();
    const uso = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === 'tool_use') : null;
    const id = String(uso?.input?.categoria_id || '').trim();
    if (!id) throw new Error('IA sem categoria');
    return { id, confianca: String(uso?.input?.confianca || ''), alternativas: Array.isArray(uso?.input?.alternativas) ? uso.input.alternativas.map(String) : [] };
  } finally {
    clearTimeout(t);
  }
}

export type SugestaoCategoriaML = { id: string; nome: string; caminho: string; origem: 'ia' | 'palavras'; confianca: string; alternativas: FolhaML[] };

export async function sugerirCategoriaML(input: { titulo: string; marca?: string | null; modelo?: string | null; condicao: 'usado' | 'novo' }): Promise<SugestaoCategoriaML | null> {
  const chaveCache = norm(`${input.titulo}|${input.condicao}`);
  const hit = cacheSugestao.get(chaveCache);
  if (hit && hit.expira > Date.now()) return hit.r;

  const folhas = await carregarFolhasMoto();
  if (!folhas.length) return null;
  const porId = new Map(folhas.map((f) => [f.id, f] as [string, FolhaML]));

  const ignorar = new Set([...tokens(input.marca || ''), ...tokens(input.modelo || '')]);
  const titTokens = tokens(input.titulo, ignorar);

  // A IA escolhe entre TODAS as categorias-folha de moto (~230, uns 5 mil tokens): filtrar antes por
  // palavras deixava de fora a categoria certa quando o nome dela nao parece com o titulo (ex: "bolha"
  // -> "Plasticos de Motos"). A pontuacao por palavras fica so como plano B se a IA estiver fora.
  const pontuados = folhas.map((f) => ({ f, s: pontuar(titTokens, f) })).sort((a, b) => b.s - a.s);
  const candidatos = folhas;

  const moto = [input.marca, input.modelo].filter(Boolean).join(' ');
  let escolhida: FolhaML | null = null;
  let origem: 'ia' | 'palavras' = 'palavras';
  let confianca = 'baixa';
  let alternativas: FolhaML[] = [];

  try {
    const r = await escolherComIA(input.titulo, moto, input.condicao, candidatos);
    const f = porId.get(r.id);
    if (f) {
      escolhida = f; origem = 'ia'; confianca = r.confianca;
      alternativas = r.alternativas.map((a: string) => porId.get(a)).filter(Boolean) as FolhaML[];
    }
  } catch (e: any) {
    console.warn(`[mlCategorias] IA indisponivel (${e?.message || e}) — usando palavras pro "${input.titulo}"`);
  }

  if (!escolhida) {
    const melhor = pontuados[0];
    if (melhor && melhor.s > 0) { escolhida = melhor.f; confianca = melhor.s >= 6 ? 'media' : 'baixa'; }
    else escolhida = porId.get(RAIZES_OUTROS[0]) || null;
    alternativas = pontuados.slice(1, 4).map((x) => x.f);
  }
  if (!escolhida) return null;

  const r: SugestaoCategoriaML = { id: escolhida.id, nome: escolhida.nome, caminho: escolhida.caminho, origem, confianca, alternativas: alternativas.filter((a) => a.id !== escolhida!.id).slice(0, 3) };
  cacheSugestao.set(chaveCache, { r, expira: Date.now() + 60 * 60 * 1000 });
  return r;
}
