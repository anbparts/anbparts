// Categoria automatica da Nuvemshop (pre-cadastro): regras por palavra-chave na descricao da peca,
// mesmo padrao de shopeeCategoria.ts / magaluCategoria.ts. O destino e' a categoria FILHA da arvore
// real da loja (GET /categories — 11 pais, ~64 filhas); o ID e' resolvido pelo NOME na hora, entao
// renomear/recriar categoria na loja nao quebra o codigo (so uma regra que aponte pra nome que
// deixou de existir retorna null = "categoria pendente", ajuste manual na aba Anuncio).
// O pai e' derivado da arvore na criacao do produto (categories: [pai, filha]).
import { nuvemReq } from '../routes/nuvemshop';

export type NuvemshopCategoriaNo = { id: number; parentId: number | null; nome: string; caminho: string };

function normalizar(s: string | null | undefined): string {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function nomeCategoria(c: any): string {
  const n = c?.name;
  if (typeof n === 'string') return n;
  return String(n?.pt || n?.['pt-BR'] || (n && Object.values(n)[0]) || c?.id || '');
}

let cache: { nos: NuvemshopCategoriaNo[]; porId: Map<number, NuvemshopCategoriaNo>; porNome: Map<string, NuvemshopCategoriaNo>; expiresAt: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export function invalidarCacheNuvemshopCategorias() {
  cache = null;
}

export async function carregarArvoreNuvemshop() {
  if (cache && cache.expiresAt > Date.now()) return cache;

  let todas: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const lote = (await nuvemReq(`/categories?per_page=200&page=${page}`)) as any[];
    if (!Array.isArray(lote) || !lote.length) break;
    todas = todas.concat(lote);
    if (lote.length < 200) break;
  }

  const base = new Map<number, { id: number; parentId: number | null; nome: string }>();
  for (const c of todas) {
    const id = Number(c.id);
    const parentId = c.parent ? Number(c.parent) : null;
    base.set(id, { id, parentId, nome: nomeCategoria(c) });
  }

  const nos: NuvemshopCategoriaNo[] = [];
  for (const n of base.values()) {
    const pai = n.parentId ? base.get(n.parentId) : null;
    nos.push({ ...n, caminho: pai ? `${pai.nome} > ${n.nome}` : n.nome });
  }
  nos.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'));

  const porId = new Map<number, NuvemshopCategoriaNo>(nos.map((n) => [n.id, n] as [number, NuvemshopCategoriaNo]));
  const porNome = new Map<string, NuvemshopCategoriaNo>();
  for (const n of nos) {
    const chave = normalizar(n.nome);
    if (!porNome.has(chave)) porNome.set(chave, n);
  }

  cache = { nos, porId, porNome, expiresAt: Date.now() + TTL_MS };
  return cache;
}

// Lista as categorias "selecionaveis" (folhas; pai so entra se nao tiver filhas), pro modal de ajuste.
export async function listarCategoriasNuvemshopSelecionaveis() {
  const { nos } = await carregarArvoreNuvemshop();
  const comFilhas = new Set(nos.filter((n) => n.parentId).map((n) => n.parentId as number));
  return nos.filter((n) => !comFilhas.has(n.id));
}

// Regras (ordem importa: compostos antes dos genericos). Destino = NOME da categoria filha.
const REGRAS: Array<[RegExp, string]> = [
  // Cabos
  [/cabo (de )?embreagem/, 'Embreagem'],
  [/cabo (de )?acelerador|cabo acelera/, 'Acelerador'],
  [/cabo (de )?(conta giro|contagiro|tacometro)/, 'Conta-giros'],
  [/cabo (de )?velocimetro/, 'Velocimetro'],
  [/cabo (de )?freio/, 'Freio'],
  [/\bcabo(s)?\b/, 'Outros Cabos'],

  // Freios
  [/pastilha/, 'Pastilhas de freio'],
  [/disco (de )?freio|disco freio/, 'Discos de freio'],
  [/bomba (de )?freio|cilindro (de )?freio|cilindro freio|cilindro mestre/, 'Bombas de freio'],
  [/(tubo|flexivel|mangueira) (de )?freio|flexivel/, 'Tubos de freio'],
  [/pinca/, 'Pinças de freio'],
  [/\bfreio(s)?\b/, 'Outras Peças Freio'],

  // Transmissao / cambio
  [/kit (de )?(relacao|transmissao)|\bcoroa\b|pinhao/, 'Coroa e Pinhão'],
  [/\bcorrente\b/, 'Corrente'],
  [/cebolinha|eixo seletor|garfo (de )?(cambio|marcha)/, 'Cebolinha'],
  [/caixa (de )?(cambio|marcha)|cambio completo/, 'Caixa de câmbio Completa'],
  [/pedal (de )?(cambio|marcha)/, 'Pedal de câmbio'],
  [/cambio|transmissao|embreagem|campana|bendix/, 'Outras Peças Transmissão'],

  // Arrefecimento (antes de Motor: "bomba d'agua", "tampa de radiador")
  [/tampa (do )?radiador/, 'Tampa de radiador'],
  [/radiador/, 'Radiador'],
  [/termostato/, 'Termostato'],
  [/mangueira|cano (de )?agua|duto (de )?agua/, 'Mangueiras'],
  [/arrefecimento|ventoinha|reservatorio (de )?(agua|expansao)|bomba (de )?agua/, 'Outras Peças Arrefecimento'],

  // Escape
  [/coletor|intermediario|tubo (de )?escape/, 'Coletor e Intermediário'],
  [/ponteira|silenciador|silencioso/, 'Ponteira'],
  [/catalisador/, 'Catalisador'],
  [/\bflange\b/, 'Flange'],
  [/escapamento|\bescape\b/, 'Outras Peças Escape'],

  // Suspensao
  [/bengala|\bgarfo\b|\bmesa\b|guarda (po|pó)/, 'Garfo / Bengala'],
  [/amortecedor/, 'Amortecedores'],
  [/balanca|suspensao|mono ?choque|monoshock|rolamento (de )?direcao|caixa (de )?direcao|bieleta|batente/, 'Outras Peças Suspensão'],

  // Eletrica
  [/farol|lente (do )?farol|lanterna/, 'Faróis'],
  [/pisca|\bseta\b/, 'Pisca-pisca'],
  [/chicote|fiacao|cabo (de )?(vela|bateria)/, 'Fiação elétrica'],
  [/\brele\b/, 'Relé'],
  [/alternador|estator|magneto|volante (do )?motor/, 'Alternador / Estator e Magneto'],
  [/punho|botoeira|interruptor|comando (de )?(luz|partida)|chave (de )?(ignicao|luz)|miolo/, 'Punhos e Botoeiras'],
  [/sensor|sonda|\bmap\b|\btps\b|\bckp\b/, 'Sensores'],
  [/bobina|\bcdi\b|modulo|\becu\b|\becm\b|regulador|retificador|bateria|\bvela\b|motor (de )?partida|solenoide|alarme|buzina|eletrica/, 'Outras Peças Elétrica'],

  // Carroceria
  [/tanque|bocal/, 'Tanque de combustível'],
  [/boia|medidor (de )?nivel/, 'Boias e Medidores de Nível'],
  [/\bbanco\b|assento/, 'Banco'],
  [/painel|instrumento|velocimetro|conta giro/, 'Painel de instrumentos'],
  [/carenagem|rabeta|capota|\bbico\b|\blateral\b|para ?lama|paralama|spoiler|\bkit (de )?plastico/, 'Carenagem (dianteira, lateral, traseira)'],
  [/\bpneu(s)?\b/, 'Pneus'],
  [/\broda(s)?\b|\baro\b/, 'Roda'],

  // Acessorios
  [/manopla|manete|manoplas/, 'Manoplas e Manetes'],
  [/guidao|guidon/, 'Guidão'],
  [/alforje|bagageiro|\bbau\b/, 'Alforjes'],
  [/capa (de |para )?banco/, 'Capas de banco'],
  [/parabarro/, 'Parabarro'],
  [/parafuso|presilha|grampo/, 'Parafusos / Presilhas e Outros'],
  [/retrovisor|espelho/, 'Retrovisores'],
  [/alto falante/, 'Alto-falantes'],
  [/slider|defletor|protetor (de )?mao|bolha|viseira|acessorio/, 'Outras Peças Acessórios'],

  // Motor
  [/cabecote|tampa (de )?valvula/, 'Cabeçote'],
  [/pistao|piston|\banel\b|aneis/, 'Pistão'],
  [/\bbiela\b/, 'Biela'],
  [/virabrequim|virbrequim|girabrequim/, 'Virabrequim'],
  [/valvula/, 'Válvulas de Admissão e Escape'],
  [/carburador|corpo (de )?injecao|\btbi\b|\btbs\b|bico injetor|injetor/, 'Carburador / Corpo de Injeção'],
  [/bomba (de )?oleo/, 'Bomba de óleo'],
  [/motor|carter|bloco|cilindro|comando|correia|engrenagem|filtro|respiro/, 'Outras Peças Motor'],

  // Estrutura / chassi (ultimo recurso dentro de Carroceria)
  [/protetor|chassi|subchassi|quadro|suporte|pedaleira|descanso|cavalete|guarda/, 'Outras Peças Carroceria'],
];

// Devolve o texto das tags de categoria no formato usado na criacao: [pai, filha] como numeros.
export async function nuvemshopCategoriasDoProduto(categoriaFilhaId: string | number): Promise<number[]> {
  const { porId } = await carregarArvoreNuvemshop();
  const filha = porId.get(Number(categoriaFilhaId));
  if (!filha) return [Number(categoriaFilhaId)].filter((n) => Number.isFinite(n));
  return filha.parentId ? [filha.parentId, filha.id] : [filha.id];
}

// ID (string) da categoria filha sugerida pra descricao, ou null quando nenhuma regra casa.
export async function sugerirNuvemshopCategoriaId(descricao?: string | null, _tipoPeca?: string | null): Promise<string | null> {
  const texto = normalizar(descricao);
  if (!texto) return null;
  const { porNome } = await carregarArvoreNuvemshop();
  for (const [regex, destino] of REGRAS) {
    if (!regex.test(texto)) continue;
    const no = porNome.get(normalizar(destino));
    return no ? String(no.id) : null;
  }
  return null;
}
