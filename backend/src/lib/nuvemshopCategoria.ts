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
  [/cabo (da |de |do )?embreagem/, 'Embreagem'],
  [/cabo (da |de |do )?acelerador|cabo acelera/, 'Acelerador'],
  [/cabo (da |de |do )?(conta giro|contagiro|tacometro)/, 'Conta-giros'],
  [/cabo (da |de |do )?velocimetro/, 'Velocimetro'],
  [/cabo (da |de |do )?freio/, 'Freio'],
  [/\bcabo(s)?\b/, 'Outros Cabos'],

  // Freios
  [/sensor.*(freio|pedal)|(freio|pedal).*sensor/, 'Sensores'],
  [/pastilha/, 'Pastilhas de freio'],
  [/disco (do |de )?(abs|freio)/, 'Discos de freio'],
  [/reservatorio (de )?(fluido |oleo )?freio|fluido (de )?freio/, 'Bombas de freio'],
  [/bomba (de )?freio|cilindro (de )?freio|cilindro freio|cilindro mestre|burrinho/, 'Bombas de freio'],
  [/(tubo|flexivel|mangueira) (de )?freio|flexivel/, 'Tubos de freio'],
  [/pinca/, 'Pinças de freio'],
  [/\bfreio(s)?\b/, 'Outras Peças Freio'],

  // Transmissao / cambio
  [/kit (de )?(relacao|transmissao)|\bcoroa\b|pinhao/, 'Coroa e Pinhão'],
  [/manete (de |da )?embreagem/, 'Manoplas e Manetes'],
  [/capa (da |de )?corrente|protetor (de )?corrente|guarda corrente|\btensor\b/, 'Outras Peças Transmissão'],
  [/\bcorrente\b/, 'Corrente'],
  [/cebolinha|eixo seletor|garfo (de )?(cambio|marcha)/, 'Cebolinha'],
  [/caixa (de )?(cambio|marcha)|cambio completo/, 'Caixa de câmbio Completa'],
  [/pedal (de )?(cambio|marcha)/, 'Pedal de câmbio'],
  [/cambio|transmissao|embreagem|campana|bendix/, 'Outras Peças Transmissão'],

  // Arrefecimento (antes de Motor: "bomba d'agua", "tampa de radiador")
  [/tampa (do )?radiador/, 'Tampa de radiador'],
  [/mangueira|cano (de )?agua|duto (de )?agua/, 'Mangueiras'],
  [/suporte (do )?radiador/, 'Outras Peças Arrefecimento'],
  [/radiador/, 'Radiador'],
  [/termostato/, 'Termostato'],
  [/arrefecimento|ventoinha|reservatorio (de )?(agua|expansao)|bomba (de )?agua/, 'Outras Peças Arrefecimento'],

  // Escape
  [/coletor|intermediario|tubo (de )?escape/, 'Coletor e Intermediário'],
  [/ponteira|silenciador|silencioso/, 'Ponteira'],
  [/catalisador/, 'Catalisador'],
  [/flange (do |de )?(escape|escapamento|coletor)/, 'Flange'],
  [/escapamento|\bescape\b/, 'Outras Peças Escape'],

  // Pecas do banco (antes de Suspensao: "amortecedor do banco" e' do assento, nao da suspensao)
  [/(amortecedor|trava|mola|fechadura|dobradica) (do |de )?banco/, 'Banco'],

  // Itens genericos que citam outra peca no nome (antes de Suspensao/Motor): "parafuso da mesa" e'
  // parafuso, "acabamento da mesa/logo" e' acabamento, "bomba de combustivel" fica ligada ao tanque.
  [/parafuso|presilha|grampo/, 'Parafusos / Presilhas e Outros'],
  [/carenagem.*(logo|emblema)|(logo|emblema).*carenagem/, 'Carenagem (dianteira, lateral, traseira)'],
  [/emblema|\blogo\b/, 'Outras Peças Carroceria'],
  [/acabamento plastico/, 'Carenagem (dianteira, lateral, traseira)'],
  [/^flange (da |de )?bomba/, 'Outras Peças Carroceria'],
  [/bomba (de )?combustivel/, 'Tanque de combustível'],
  [/^(?!.*sensor).*(cavalete|descanso)/, 'Outras Peças Acessórios'],
  [/^(?!.*sensor).*caixa (de |do )?(ar|filtro)/, 'Outras Peças Carroceria'],
  [/valvula (de )?comutacao|ar secundario/, 'Sensores'],
  [/atuador|marcha lenta|\bidle\b/, 'Carburador / Corpo de Injeção'],

  // Suspensao
  [/bengala|\bgarfo\b|\bmesa\b|guarda (po|pó)/, 'Garfo / Bengala'],
  [/amortecedor/, 'Amortecedores'],
  [/balanca|suspensao|mono ?choque|monoshock|rolamento (de )?direcao|caixa (de )?direcao|bieleta|batente/, 'Outras Peças Suspensão'],

  // Eletrica
  [/farol|lente (do )?farol/, 'Faróis'],
  [/pisca|\bseta\b/, 'Pisca-pisca'],
  [/chicote|fiacao|cabo (de )?(vela|bateria)/, 'Fiação elétrica'],
  [/\brele\b/, 'Relé'],
  [/alternador|estator|magneto|volante (do )?motor|(?<!suporte )(retificador|regulador)/, 'Alternador / Estator e Magneto'],
  [/punho|botoeira|interruptor|comando (de )?(luz|partida)|chave (de )?(ignicao|luz)|miolo/, 'Punhos e Botoeiras'],
  [/sensor|sonda|\bmap\b|\btps\b|\bckp\b/, 'Sensores'],
  [/bobina|\bcdi\b|modulo|\becu\b|\becm\b|lanterna|suporte (do )?(retificador|regulador)|bateria|\bvela\b|motor (de )?partida|solenoide|alarme|buzina|eletrica/, 'Outras Peças Elétrica'],

  // Carroceria
  [/carenagem|rabeta|capota|\bbolha\b|\bbico (frontal|dianteiro|traseiro)\b|\blateral\b|spoiler|\bkit (de )?plastico/, 'Carenagem (dianteira, lateral, traseira)'],
  [/tanque|bocal/, 'Tanque de combustível'],
  [/boia|medidor (de )?nivel/, 'Boias e Medidores de Nível'],
  [/\bbanco\b|assento/, 'Banco'],
  [/painel|instrumento|velocimetro|conta giro/, 'Painel de instrumentos'],
  [/\bpneu(s)?\b/, 'Pneus'],
  [/\broda(s)?\b|\baro\b/, 'Roda'],

  // Acessorios
  [/manopla|manete|manoplas/, 'Manoplas e Manetes'],
  [/\bacelerad(or|o)\b/, 'Punhos e Botoeiras'],
  [/guidao|guidon/, 'Guidão'],
  [/alforje|bagageiro|\bbau\b/, 'Alforjes'],
  [/capa (de |para )?banco/, 'Capas de banco'],
  [/parabarro|para ?lama|paralama|suporte (de )?placa/, 'Parabarro'],
  [/parafuso|presilha|grampo/, 'Parafusos / Presilhas e Outros'],
  [/retrovisor|espelho/, 'Retrovisores'],
  [/alto falante/, 'Alto-falantes'],
  [/slider|defletor|protetor (de )?mao|viseira|acessorio/, 'Outras Peças Acessórios'],

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
  [/protetor|chassi|subchassi|quadro|suporte|pedaleira|descanso|cavalete|guarda|bagagem/, 'Outras Peças Carroceria'],
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
