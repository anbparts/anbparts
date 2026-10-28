// Categorias do Mercado Livre pra peca/acessorio de MOTO: espelho das categorias-folha (so as raizes de
// moto), sugestao inteligente por titulo (candidatos + IA, com plano B por palavras) e verificacao de
// RESTRICOES de cada categoria (anuncio nao permitido, nao aceita usado, atributos obrigatorios que o
// sistema ainda nao preenche...). Usa a API publica do ML (categorias nao exigem token) e a API de
// Anuncios do Bling pra ler os atributos obrigatorios.
import { blingReq } from '../routes/bling';
import { chamarAnthropic, registrarEvitadaAnthropic } from './anthropic';
import { prisma } from './prisma';

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

// Atributos de uma categoria na API PUBLICA do ML (traz os valores permitidos das listas; o Bling so diz se e' obrigatorio).
const cacheAttrsPublicos = new Map<string, { itens: any[]; expira: number }>();
async function atributosPublicosML(id: string): Promise<any[]> {
  const hit = cacheAttrsPublicos.get(id);
  if (hit && hit.expira > Date.now()) return hit.itens;
  const itens = await mlGet(`/categories/${encodeURIComponent(id)}/attributes`);
  const lista = Array.isArray(itens) ? itens : [];
  cacheAttrsPublicos.set(id, { itens: lista, expira: Date.now() + TTL_FOLHAS });
  return lista;
}

export type CampoFichaML = { nome: string; exemplo: string; escolhas: string[] | null };
type PlanoAtributosML = {
  automaticos: Array<{ id: string; valor: string }>;
  faltando: Array<CampoFichaML & { id: string; valores: Array<{ id: string; name: string }> }>;
};

// Atributos obrigatorios da categoria alem dos que o sistema ja manda sempre: preenche sozinho os que da pra deduzir
// (Tipo de veiculo = moto; Modelo = modelo da moto do SKU) e devolve os que precisam ser digitados/escolhidos na tela.
async function planejarAtributosML(categoriaId: string, ctx: { modelo?: string | null }): Promise<PlanoAtributosML> {
  const bling = await atributosCategoriaML(categoriaId);
  let publicos: any[] = [];
  try { publicos = await atributosPublicosML(categoriaId); } catch { /* sem lista de valores: pede como texto */ }
  const pub = new Map(publicos.map((a: any) => [String(a.id), a]));
  const plano: PlanoAtributosML = { automaticos: [], faltando: [] };
  for (const a of bling) {
    if (!a?.obrigatorio) continue;
    const id = String(a.id);
    if (ATRIBUTOS_SUPORTADOS.has(id)) continue;
    const p: any = pub.get(id);
    const valores: Array<{ id: string; name: string }> = (Array.isArray(p?.values) ? p.values : [])
      .map((v: any) => ({ id: String(v.id), name: String(v.name) })).filter((v: any) => v.id && v.name);
    if (id === 'VEHICLE_TYPE') {
      const moto = valores.find((v) => /moto/i.test(v.name)) || (valores.length === 1 ? valores[0] : null);
      if (moto) { plano.automaticos.push({ id, valor: moto.id }); continue; }
    }
    if (id === 'MODEL' && ctx.modelo) { plano.automaticos.push({ id, valor: String(ctx.modelo) }); continue; }
    plano.faltando.push({
      id, nome: String(a.nome || id), exemplo: String(p?.hint || p?.tooltip || ''),
      escolhas: valores.length ? valores.slice(0, 80).map((v) => v.name) : null, valores,
    });
  }
  return plano;
}

// Atributos extras pra criacao: os automaticos + os digitados na tela (ficha: nome do campo -> valor ou nome da opcao).
export async function atributosExtrasML(categoriaId: string, ctx: { modelo?: string | null }, ficha: Record<string, string> = {}) {
  const plano = await planejarAtributosML(categoriaId, ctx);
  const atributos = [...plano.automaticos];
  const faltam: string[] = [];
  for (const f of plano.faltando) {
    const digitado = String(ficha?.[f.nome] ?? '').trim();
    if (!digitado) { faltam.push(f.nome); continue; }
    const opcao = f.valores.find((v) => norm(v.name) === norm(digitado));
    atributos.push({ id: f.id, valor: opcao ? opcao.id : digitado });
  }
  return { atributos, faltam };
}

export type VerificacaoCategoria = { ok: boolean; caminho: string; nome: string; restricoes: string[]; avisos: string[]; fichaFaltando: CampoFichaML[] };

export async function verificarCategoriaML(id: string, condicao: 'usado' | 'novo', ctx: { modelo?: string | null } = {}): Promise<VerificacaoCategoria> {
  const restricoes: string[] = [];
  const avisos: string[] = [];
  let fichaFaltando: CampoFichaML[] = [];
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
    // Atributos obrigatorios: o que da pra deduzir (tipo de veiculo, modelo) e' preenchido sozinho; o resto vira campo na tela.
    const plano = await planejarAtributosML(id, ctx);
    fichaFaltando = plano.faltando.map((f) => ({ nome: f.nome, exemplo: f.exemplo, escolhas: f.escolhas }));
  } catch (e: any) {
    avisos.push('Não foi possível ler os atributos obrigatórios da categoria no Bling.');
  }

  return { ok: restricoes.length === 0, caminho, nome, restricoes, avisos, fichaFaltando };
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

async function escolherComIA(titulo: string, moto: string, condicao: string, candidatos: FolhaML[], usuario?: string | null) {
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

  const data: any = await chamarAnthropic({
    recurso: 'ml_categoria', usuario, contexto: titulo,
    body: {
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
    },
  });
  const uso = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === 'tool_use') : null;
  const id = String(uso?.input?.categoria_id || '').trim();
  if (!id) throw new Error('IA sem categoria');
  return { id, confianca: String(uso?.input?.confianca || ''), alternativas: Array.isArray(uso?.input?.alternativas) ? uso.input.alternativas.map(String) : [] };
}

// Cache em banco das escolhas da IA (por titulo+condicao): o mesmo anuncio nao gasta IA de novo, nem depois de um deploy.
let tabelaCacheCategoriaPronta: Promise<void> | null = null;
function garantirTabelaCacheCategoria() {
  if (!tabelaCacheCategoriaPronta) {
    tabelaCacheCategoriaPronta = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MlCategoriaSugestaoIA" ("chave" TEXT PRIMARY KEY, "categoriaId" TEXT NOT NULL, "confianca" TEXT, "alternativas" TEXT, "criadoEm" TIMESTAMP NOT NULL DEFAULT now())`)
      .then(() => undefined).catch((e) => { tabelaCacheCategoriaPronta = null; throw e; });
  }
  return tabelaCacheCategoriaPronta;
}

export type SugestaoCategoriaML = { id: string; nome: string; caminho: string; origem: 'ia' | 'palavras' | 'ml' | 'pre'; confianca: string; alternativas: FolhaML[] };

// ---------- qualquer categoria do ML (arvore completa) ----------
// A API publica do ML devolve a arvore inteira; usada pra sugerir/escolher categorias FORA das raizes de moto
// (ex.: "Pneus para Motos" fica em Pneus e Rodas) — o ML as vezes derruba o anuncio se a categoria nao for a que ele forca.
export type DetalheCategoriaML = { id: string; nome: string; caminho: string; folha: boolean; filhos: Array<{ id: string; nome: string }> };
const cacheDetalheCat = new Map<string, { d: DetalheCategoriaML; expira: number }>();

export async function detalheCategoriaML(id: string): Promise<DetalheCategoriaML> {
  const chave = String(id).trim();
  const hit = cacheDetalheCat.get(chave);
  if (hit && hit.expira > Date.now()) return hit.d;
  const cat = await mlGet(`/categories/${encodeURIComponent(chave)}`);
  const filhos = (Array.isArray(cat.children_categories) ? cat.children_categories : []).map((c: any) => ({ id: String(c.id), nome: String(c.name) }));
  const d: DetalheCategoriaML = {
    id: String(cat.id), nome: String(cat.name),
    caminho: (Array.isArray(cat.path_from_root) ? cat.path_from_root : []).map((p: any) => p.name).join(' > '),
    folha: filhos.length === 0, filhos,
  };
  cacheDetalheCat.set(chave, { d, expira: Date.now() + 12 * 60 * 60 * 1000 });
  if (cacheDetalheCat.size > 3000) cacheDetalheCat.delete(cacheDetalheCat.keys().next().value as string);
  return d;
}

export async function raizesML(): Promise<Array<{ id: string; nome: string }>> {
  const r = await mlGet('/sites/MLB/categories');
  return (Array.isArray(r) ? r : []).map((c: any) => ({ id: String(c.id), nome: String(c.name) }));
}

// Categoria-folha (a unica que aceita anuncio) a partir do ID; null se nao existir ou nao for folha.
export async function folhaMLPorId(id: string | null | undefined): Promise<FolhaML | null> {
  if (!id) return null;
  try {
    const d = await detalheCategoriaML(String(id));
    return d.folha ? { id: d.id, nome: d.nome, caminho: d.caminho } : null;
  } catch { return null; }
}

// Busca na API do ML (domain_discovery) as categorias-folha mais provaveis pro texto, em qualquer lugar da arvore.
export async function buscarCategoriasML(q: string, limite = 8): Promise<FolhaML[]> {
  const ids = (await candidatosDomainDiscovery(q)).filter((v, i, a) => a.indexOf(v) === i).slice(0, limite);
  const folhas = await Promise.all(ids.map((id) => folhaMLPorId(id)));
  return folhas.filter((f): f is FolhaML => !!f);
}

// modo 'auto' (padrao, SEM gastar IA): categoria do pre-cadastro -> sugestao do proprio ML -> escolha da IA ja guardada -> palavras (so se forte).
//   Se nada servir devolve null (a tela deixa "sem categoria" e voce escolhe a mao ou clica em "Sugerir com IA").
// modo 'ia' (clique explicito do usuario): a IA da Claude escolhe entre as categorias de moto + as candidatas do ML.
export async function sugerirCategoriaML(input: { titulo: string; marca?: string | null; modelo?: string | null; condicao: 'usado' | 'novo'; usuario?: string | null; modo?: 'auto' | 'ia'; preCadastroId?: string | null }): Promise<SugestaoCategoriaML | null> {
  const modo = input.modo === 'ia' ? 'ia' : 'auto';
  const chaveCache = norm(`${input.titulo}|${input.condicao}`);
  const chaveMem = `${modo}|${input.preCadastroId || ''}|${chaveCache}`;
  const hit = cacheSugestao.get(chaveMem);
  if (hit && hit.expira > Date.now()) return hit.r;
  const guardar = (r: SugestaoCategoriaML) => { cacheSugestao.set(chaveMem, { r, expira: Date.now() + 60 * 60 * 1000 }); return r; };

  const folhas = await carregarFolhasMoto();
  const porId = new Map(folhas.map((f) => [f.id, f] as [string, FolhaML]));

  const ignorar = new Set([...tokens(input.marca || ''), ...tokens(input.modelo || '')]);
  const titTokens = tokens(input.titulo, ignorar);
  const pontuados = folhas.map((f) => ({ f, s: pontuar(titTokens, f) })).sort((a, b) => b.s - a.s);

  // candidatas do proprio ML (qualquer lugar da arvore), na ordem de relevancia
  const candidatasML: FolhaML[] = [];
  for (const q of [`${input.titulo} moto`, input.titulo]) {
    try {
      const resp = await mlGet(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(q)}&limit=8`, 1);
      for (const x of (Array.isArray(resp) ? resp : [])) {
        const id = String(x?.category_id || '');
        if (!id || candidatasML.some((c) => c.id === id)) continue;
        const f = porId.get(id) || await folhaMLPorId(id);
        if (f) candidatasML.push(f);
      }
    } catch { /* ML fora do ar nessa consulta: segue */ }
    if (candidatasML.length) break;
  }

  if (modo === 'auto') {
    // 1) categoria que o pre-cadastro ja trouxe
    const pre = await folhaMLPorId(input.preCadastroId);
    if (pre) {
      registrarEvitadaAnthropic('ml_categoria', input.usuario, input.titulo);
      return guardar({ id: pre.id, nome: pre.nome, caminho: pre.caminho, origem: 'pre', confianca: 'media', alternativas: candidatasML.filter((c) => c.id !== pre.id).slice(0, 3) });
    }
    // 2) a sugestao do proprio ML (1o resultado)
    if (candidatasML[0]) {
      const topo = candidatasML[0];
      registrarEvitadaAnthropic('ml_categoria', input.usuario, input.titulo);
      return guardar({ id: topo.id, nome: topo.nome, caminho: topo.caminho, origem: 'ml', confianca: 'alta', alternativas: candidatasML.slice(1, 4) });
    }
    // 3) escolha da IA ja feita antes para o mesmo titulo (guardada em banco): nao gasta IA de novo
    try {
      await garantirTabelaCacheCategoria();
      const rows = await prisma.$queryRawUnsafe<Array<{ categoriaId: string; confianca: string | null; alternativas: string | null }>>(
        `SELECT "categoriaId","confianca","alternativas" FROM "MlCategoriaSugestaoIA" WHERE "chave" = $1 AND "criadoEm" > now() - interval '60 days'`, chaveCache,
      );
      const f = rows[0] ? (porId.get(rows[0].categoriaId) || await folhaMLPorId(rows[0].categoriaId)) : null;
      if (f) {
        const alts = String(rows[0].alternativas || '').split(',').map((a) => porId.get(a.trim())).filter((x): x is FolhaML => !!x && x.id !== f.id);
        registrarEvitadaAnthropic('ml_categoria_cache', input.usuario, input.titulo);
        return guardar({ id: f.id, nome: f.nome, caminho: f.caminho, origem: 'ia', confianca: rows[0].confianca || 'media', alternativas: alts.slice(0, 3) });
      }
    } catch { /* sem cache em banco */ }
    // 4) palavras: so quando a correspondencia e' forte; senao fica sem categoria (nunca cai em "Outros" sozinho)
    const melhor = pontuados[0];
    if (melhor && melhor.s >= 6) {
      return guardar({ id: melhor.f.id, nome: melhor.f.nome, caminho: melhor.f.caminho, origem: 'palavras', confianca: 'media', alternativas: pontuados.slice(1, 4).map((x) => x.f) });
    }
    return null;
  }

  // modo 'ia': candidatas = todas as folhas de moto + as do ML + a do pre-cadastro (pode estar fora das raizes de moto)
  const extras = [...candidatasML];
  const pre = await folhaMLPorId(input.preCadastroId);
  if (pre) extras.push(pre);
  const vistos = new Set(folhas.map((f) => f.id));
  const candidatos = [...folhas];
  for (const e of extras) if (!vistos.has(e.id)) { vistos.add(e.id); candidatos.push(e); }
  const porIdTodas = new Map(candidatos.map((f) => [f.id, f] as [string, FolhaML]));
  const moto = [input.marca, input.modelo].filter(Boolean).join(' ');
  const r = await escolherComIA(input.titulo, moto, input.condicao, candidatos, input.usuario);
  const f = porIdTodas.get(r.id);
  if (!f) throw new Error('A IA devolveu uma categoria fora da lista. Escolha manualmente.');
  const alternativas = r.alternativas.map((a: string) => porIdTodas.get(a)).filter((x: FolhaML | undefined): x is FolhaML => !!x && x.id !== f.id).slice(0, 3);
  prisma.$executeRawUnsafe(`INSERT INTO "MlCategoriaSugestaoIA" ("chave","categoriaId","confianca","alternativas","criadoEm") VALUES ($1,$2,$3,$4,now()) ON CONFLICT ("chave") DO UPDATE SET "categoriaId"=EXCLUDED."categoriaId","confianca"=EXCLUDED."confianca","alternativas"=EXCLUDED."alternativas","criadoEm"=now()`, chaveCache, f.id, r.confianca, alternativas.map((a: FolhaML) => a.id).join(',')).catch(() => undefined);
  return guardar({ id: f.id, nome: f.nome, caminho: f.caminho, origem: 'ia', confianca: r.confianca, alternativas });
}
