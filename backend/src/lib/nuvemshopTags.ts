// Tags de busca da Nuvemshop geradas no pre-cadastro. Mesma ideia da sugestao por IA da aba
// Categoria (routes/nuvemshop.ts /sugerir-ia): partes do nome do produto, marca/modelo/ano da moto,
// prefixo do SKU e termos tecnicos, so com letras/numeros/espacos/hifens. Aqui e' 1 SKU por vez,
// gravado no pre-cadastro (CadastroPeca.nuvemshopTags) e depois usado na criacao do anuncio.
// Agora 100% interno (sem chamar IA): regra por titulo/moto + termos aprendidos com as tags que a IA ja gerou antes
// (CadastroPeca.nuvemshopTags): palavras do nome da peca que costumam vir acompanhadas de sinonimos e da area geral.
import { prisma } from './prisma';

// Padrao extraido da base real da Nuvemshop (48 SKUs BM03 preenchidos pela IA da aba Categoria):
// 10 a 12 tags por produto; SEMPRE ano, prefixo do SKU (ex: BM03), marca e o modelo escrito de duas
// formas ("F800 GS" e "F800GS"); quase sempre "moto <marca>", o nome da peca + sinonimos, a categoria
// geral (suspensao, eletrica, freio...) e uma tag de condicao (usada/usado). Palavras em portugues
// em minusculas e SEM acento; marca, modelo e siglas (ABS, TBI) mantem a grafia.
const MAX_TAGS = 12;
const MAX_TAMANHO_TAG = 40;

export type TagsInput = {
  sku: string;
  titulo: string;
  moto?: { marca?: string | null; modelo?: string | null; ano?: number | string | null } | null;
  numeroPeca?: string | null;
  condicao?: string | null; // usado | novo
};

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'e', 'a', 'o', 'as', 'os', 'par', 'kit', 'peca', 'pecas']);

function semAcento(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function limparTag(tag: string): string {
  return semAcento(String(tag || ''))
    .replace(/[^\p{L}\p{N} -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAMANHO_TAG)
    .trim();
}

function normalizarLista(tags: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruta of tags) {
    const tag = limparTag(bruta);
    if (tag.length < 2) continue;
    const chave = tag.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(tag);
    if (saida.length >= MAX_TAGS) break;
  }
  return saida;
}

// Plano B sem IA: palavras do titulo + combinacoes com a moto + prefixo do SKU + PN.
export function tagsPorRegra(input: TagsInput): string[] {
  const moto = input.moto || {};
  const marca = limparTag(String(moto.marca || ''));
  const modelo = limparTag(String(moto.modelo || ''));
  const ano = moto.ano ? String(moto.ano) : '';
  const prefixo = String(input.sku || '').toUpperCase().split('_')[0]; // ex: BM03_0087 -> BM03
  const novo = String(input.condicao || '').toLowerCase() === 'novo';

  // O modelo aparece no titulo com ou sem espaco ("F800 GS" / "F800GS"): acha a grafia do titulo,
  // usa as duas formas como tag e remove do titulo pra sobrar so o nome da peca.
  const modeloSemEspaco = modelo.replace(/ /g, '');
  const modeloRegex = modeloSemEspaco
    ? new RegExp(modeloSemEspaco.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'i')
    : null;
  const achado = modeloRegex ? semAcento(input.titulo).match(modeloRegex) : null;
  const modeloComEspaco = achado ? limparTag(achado[0]) : modelo;
  const tituloSemModelo = modeloRegex ? semAcento(input.titulo).replace(modeloRegex, ' ') : semAcento(input.titulo);

  // Nome da peca = titulo sem marca/modelo/ano/condicao (o que sobra e' a descricao da peca).
  const ruido = new Set([marca, ano, 'usd', 'usado', 'usada'].filter(Boolean).map((x) => x.toLowerCase()));
  const palavras = limparTag(tituloSemModelo)
    .split(' ')
    .filter((p) => p.length >= 3 && !STOPWORDS.has(p.toLowerCase()) && !ruido.has(p.toLowerCase()) && !/^\d+$/.test(p));
  const nomePeca = palavras.slice(0, 3).join(' ').toLowerCase();

  const tags: string[] = [];
  if (ano) tags.push(ano);
  if (prefixo) tags.push(prefixo);
  if (marca) tags.push(marca);
  if (modelo) {
    tags.push(modeloComEspaco);
    if (modeloSemEspaco !== modeloComEspaco) tags.push(modeloSemEspaco);
  }
  if (marca) tags.push(`moto ${marca}`);
  if (nomePeca) tags.push(nomePeca);
  tags.push(...palavras.map((p) => p.toLowerCase()));
  if (palavras[0] && palavras[1]) tags.push(`${palavras[0]} ${palavras[1]}`.toLowerCase());
  tags.push(novo ? 'nova' : 'usada');
  return normalizarLista(tags);
}

// ───────────── Aprendizado com as tags ja geradas ─────────────
// Para cada palavra do nome da peca guarda quais tags "genericas" (sinonimos, termos tecnicos, area geral) apareceram junto, e quantas vezes.
// Tags especificas (ano, prefixo do SKU, marca, modelo, PN, condicao) ficam de fora: essas a regra monta sozinha.
type Aprendizado = Map<string, Map<string, number>>;
let cacheAprendizado: { expira: number; mapa: Aprendizado } | null = null;
const MIN_OCORRENCIAS = 2; // a tag so e sugerida se apareceu em pelo menos 2 produtos com essa palavra

function palavrasDoNome(titulo: string, marca: string, modelo: string, ano: string): string[] {
  const modeloSem = limparTag(modelo).replace(/ /g, '').toLowerCase();
  const ignorar = new Set([limparTag(marca).toLowerCase(), ano, 'usd', 'usado', 'usada', 'nova', 'novo'].filter(Boolean));
  return limparTag(titulo).toLowerCase().split(' ')
    .filter((p) => p.length >= 3 && !STOPWORDS.has(p) && !ignorar.has(p) && !/^\d+$/.test(p) && p.replace(/ /g, '') !== modeloSem && !modeloSem.includes(p));
}

async function carregarAprendizado(): Promise<Aprendizado> {
  if (cacheAprendizado && cacheAprendizado.expira > Date.now()) return cacheAprendizado.mapa;
  const mapa: Aprendizado = new Map();
  try {
    const linhas: any[] = await (prisma as any).cadastroPeca.findMany({
      where: { nuvemshopTags: { not: null } },
      select: { idPeca: true, descricao: true, nuvemshopTags: true, moto: { select: { marca: true, modelo: true, ano: true } } },
      take: 5000,
    });
    for (const l of linhas) {
      const marca = String(l.moto?.marca || ''); const modelo = String(l.moto?.modelo || ''); const ano = l.moto?.ano ? String(l.moto.ano) : '';
      const prefixo = String(l.idPeca || '').toUpperCase().split('_')[0].toLowerCase();
      const marcaT = limparTag(marca).toLowerCase(); const modeloT = limparTag(modelo).toLowerCase().replace(/ /g, '');
      const palavras = palavrasDoNome(String(l.descricao || ''), marca, modelo, ano);
      if (!palavras.length) continue;
      const tags = String(l.nuvemshopTags || '').split(',').map((t) => limparTag(t).toLowerCase()).filter((t) => t.length >= 3);
      for (const tag of tags) {
        const compacta = tag.replace(/ /g, '');
        if (tag === ano || tag === prefixo || tag === 'usada' || tag === 'usado' || tag === 'nova' || tag === 'novo') continue;
        if ((marcaT && tag.includes(marcaT)) || (modeloT && compacta.includes(modeloT)) || /\d{4,}/.test(tag)) continue;
        for (const p of palavras) {
          const m = mapa.get(p) || new Map<string, number>();
          m.set(tag, (m.get(tag) || 0) + 1);
          mapa.set(p, m);
        }
      }
    }
  } catch (e: any) { console.warn('[nuvemshopTags] nao foi possivel carregar o aprendizado:', e?.message || e); }
  cacheAprendizado = { expira: Date.now() + 30 * 60 * 1000, mapa };
  return mapa;
}

async function tagsAprendidas(input: TagsInput, jaTem: string[]): Promise<string[]> {
  const moto = input.moto || {};
  const palavras = palavrasDoNome(input.titulo, String(moto.marca || ''), String(moto.modelo || ''), moto.ano ? String(moto.ano) : '');
  if (!palavras.length) return [];
  const mapa = await carregarAprendizado();
  const existentes = new Set(jaTem.map((t) => t.toLowerCase()));
  const pontos = new Map<string, number>();
  for (const p of palavras) {
    for (const [tag, n] of Array.from((mapa.get(p) || new Map()).entries())) {
      if (n < MIN_OCORRENCIAS || existentes.has(tag)) continue;
      pontos.set(tag, (pontos.get(tag) || 0) + n);
    }
  }
  return Array.from(pontos.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

// Gera as tags 100% internas e devolve no formato da Nuvemshop: "a, b, c".
// Base por regra (ano, prefixo, marca, modelo, nome da peca...) + ate 3 termos aprendidos; a tag de condicao (usada/nova) sempre fica.
export async function gerarTagsNuvemshop(input: TagsInput): Promise<string> {
  const base = tagsPorRegra(input);
  const condicao = base.find((t) => /^(nova|usada)$/i.test(t)) || (String(input.condicao || '').toLowerCase() === 'novo' ? 'nova' : 'usada');
  const semCondicao = base.filter((t) => t !== condicao);
  const aprendidas = (await tagsAprendidas(input, semCondicao)).slice(0, 3);
  const reservadas = aprendidas.length + 1; // aprendidas + condicao
  return normalizarLista([...semCondicao.slice(0, Math.max(0, MAX_TAGS - reservadas)), ...aprendidas, condicao]).join(', ');
}

// Pre-cadastro: gera e grava CadastroPeca.nuvemshopTags em segundo plano (nao bloqueia a resposta).
export function gerarTagsCadastroEmSegundoPlano(cadastroId: number) {
  (async () => {
    const c: any = await (prisma as any).cadastroPeca.findUnique({
      where: { id: cadastroId },
      include: { moto: { select: { marca: true, modelo: true, ano: true } } },
    });
    if (!c) return;
    const tags = await gerarTagsNuvemshop({ sku: c.idPeca, titulo: c.descricao, moto: c.moto, numeroPeca: c.numeroPeca, condicao: c.condicao });
    await (prisma as any).cadastroPeca.update({ where: { id: cadastroId }, data: { nuvemshopTags: tags } });
  })().catch((e: any) => console.error(`[nuvemshopTags] falha ao gravar tags do cadastro ${cadastroId}: ${e?.message || e}`));
}
