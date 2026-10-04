// Tags de busca da Nuvemshop geradas no pre-cadastro. Mesma ideia da sugestao por IA da aba
// Categoria (routes/nuvemshop.ts /sugerir-ia): partes do nome do produto, marca/modelo/ano da moto,
// prefixo do SKU e termos tecnicos, so com letras/numeros/espacos/hifens. Aqui e' 1 SKU por vez,
// gravado no pre-cadastro (CadastroPeca.nuvemshopTags) e depois usado na criacao do anuncio.
// Se a IA falhar (sem chave, timeout, resposta ruim), cai numa montagem por regra — a criacao do
// anuncio nunca fica travada por causa de tag.
import { prisma } from './prisma';

const MODELO_IA = 'claude-sonnet-4-6';
const MAX_TAGS = 20;
const MAX_TAMANHO_TAG = 40;

export type TagsInput = {
  sku: string;
  titulo: string;
  moto?: { marca?: string | null; modelo?: string | null; ano?: number | string | null } | null;
  numeroPeca?: string | null;
};

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'e', 'a', 'o', 'as', 'os', 'par', 'kit', 'peca', 'pecas']);

function limparTag(tag: string): string {
  return String(tag || '')
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
  const titulo = limparTag(input.titulo);
  const moto = input.moto || {};
  const marca = limparTag(String(moto.marca || ''));
  const modelo = limparTag(String(moto.modelo || ''));
  const ano = moto.ano ? String(moto.ano) : '';
  const prefixo = String(input.sku || '').toUpperCase().replace(/_.*$/, '').replace(/\d+$/, '');

  const palavras = titulo.split(' ').filter((p) => p.length >= 3 && !STOPWORDS.has(p.toLowerCase()) && !/^\d{4}$/.test(p));
  const tags: string[] = [];
  if (titulo) tags.push(titulo);
  tags.push(...palavras);
  if (marca && modelo) tags.push(`${marca} ${modelo}`);
  if (modelo && ano) tags.push(`${modelo} ${ano}`);
  if (marca) tags.push(marca);
  if (modelo) tags.push(modelo);
  if (ano) tags.push(ano);
  if (palavras[0] && modelo) tags.push(`${palavras[0]} ${modelo}`);
  if (palavras[0] && marca) tags.push(`${palavras[0]} ${marca}`);
  if (input.numeroPeca) tags.push(String(input.numeroPeca));
  if (prefixo) tags.push(prefixo);
  tags.push('peça de moto', 'moto usada', 'peça original');
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

Regras: inclua partes do nome do produto, marca da moto, modelo, ano, prefixo do SKU e termos tecnicos que um cliente digitaria na busca (sinonimos e nomes populares da peca). Use apenas letras, numeros, espacos e hifens. NAO use aspas, virgulas ou caracteres especiais. Entre 8 e ${MAX_TAGS} tags, cada uma com no maximo ${MAX_TAMANHO_TAG} caracteres.`;

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
  if (tags.length < 5) tags = normalizarLista([...tags, ...tagsPorRegra(input)]);
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
    const tags = await gerarTagsNuvemshop({ sku: c.idPeca, titulo: c.descricao, moto: c.moto, numeroPeca: c.numeroPeca });
    await (prisma as any).cadastroPeca.update({ where: { id: cadastroId }, data: { nuvemshopTags: tags } });
  })().catch((e: any) => console.error(`[nuvemshopTags] falha ao gravar tags do cadastro ${cadastroId}: ${e?.message || e}`));
}
