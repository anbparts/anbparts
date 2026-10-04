// Tags de busca da Nuvemshop geradas no pre-cadastro. Mesma ideia da sugestao por IA da aba
// Categoria (routes/nuvemshop.ts /sugerir-ia): partes do nome do produto, marca/modelo/ano da moto,
// prefixo do SKU e termos tecnicos, so com letras/numeros/espacos/hifens. Aqui e' 1 SKU por vez,
// gravado no pre-cadastro (CadastroPeca.nuvemshopTags) e depois usado na criacao do anuncio.
// Se a IA falhar (sem chave, timeout, resposta ruim), cai numa montagem por regra — a criacao do
// anuncio nunca fica travada por causa de tag.
import { prisma } from './prisma';

const MODELO_IA = 'claude-sonnet-4-6';
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

async function tagsPorIA(input: TagsInput): Promise<string[]> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error('ANTHROPIC_API_KEY nao configurado');

  const moto = input.moto || {};
  const motoTexto = [moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ').replace(/["\\]/g, '');
  const titulo = String(input.titulo || '').replace(/["\\]/g, '');
  const prompt = `Voce e um especialista em e-commerce de pecas de moto usadas. Sugira tags de busca para este produto de uma loja Nuvemshop.

SKU: ${input.sku}
Titulo: ${titulo}
Moto: ${motoTexto}
${input.numeroPeca ? `Codigo da peca (PN): ${input.numeroPeca}` : ''}

Condicao: ${String(input.condicao || '').toLowerCase() === 'novo' ? 'nova (peca nova)' : 'usada (peca de moto usada)'}

Gere de 10 a ${MAX_TAGS} tags, seguindo este padrao:
- SEMPRE inclua: o ano da moto, o prefixo do SKU (ex: BM03), a marca, o modelo escrito de duas formas (com e sem espaco, ex: "F800 GS" e "F800GS") e "moto <marca>".
- Inclua o nome da peca e suas variacoes, sinonimos e termos tecnicos que o cliente digitaria na busca, alem da area geral da peca (ex: suspensao, eletrica, freio, transmissao).
- Inclua uma tag de condicao: "usada"/"usado" (conforme o genero da peca) ou "nova"/"novo" se a peca for nova.
- Palavras em portugues em minusculas e SEM acento; marca, modelo e siglas (ABS, TBI, ECU) mantem a grafia.
- Apenas letras, numeros, espacos e hifens. NAO use aspas, virgulas ou caracteres especiais. Cada tag com no maximo ${MAX_TAMANHO_TAG} caracteres.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': chave },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: 1000,
        tool_choice: { type: 'tool', name: 'responder_tags' },
        tools: [{
          name: 'responder_tags',
          description: 'Retorna as tags de busca sugeridas para o produto.',
          input_schema: {
            type: 'object',
            additionalProperties: false,
            properties: { tags: { type: 'array', items: { type: 'string' } } },
            required: ['tags'],
          },
        }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
    const data: any = await resp.json();
    const uso = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'responder_tags') : null;
    const tags = Array.isArray(uso?.input?.tags) ? uso.input.tags.map((t: any) => String(t)) : [];
    if (!tags.length) throw new Error('IA sem tags');
    return tags;
  } finally {
    clearTimeout(timeout);
  }
}

// Gera as tags (IA, com plano B por regra) e devolve no formato da Nuvemshop: "a, b, c".
export async function gerarTagsNuvemshop(input: TagsInput): Promise<string> {
  let tags: string[] = [];
  try {
    tags = normalizarLista(await tagsPorIA(input));
  } catch (e: any) {
    console.warn(`[nuvemshopTags] IA indisponivel (${e?.message || e}) — usando regra pro SKU ${input.sku}`);
  }
  // Completa/substitui pela regra se a IA devolveu pouco.
  if (tags.length < 8) tags = normalizarLista([...tags, ...tagsPorRegra(input)]);
  return tags.join(', ');
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
