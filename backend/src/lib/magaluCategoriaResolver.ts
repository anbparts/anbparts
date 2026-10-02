import { prisma } from './prisma';
import { MAGALU_PREFIXO_CAMINHO, sugerirMagaluCategoriaCaminho } from './magaluCategoria';

// Resolve o CAMINHO sugerido (magaluCategoria.ts, sem dependencia de banco) pro UUID real da
// categoria na tabela MagaluCategoria. A comparacao ignora NBSP/acentuacao composta porque o
// proprio Magalu devolve nomes com espaco nao-separavel em alguns caminhos.
function norm(s: string) {
  return String(s || '').replace(/ /g, ' ').normalize('NFC').trim();
}

let cache: { ts: number; porCaminho: Map<string, string> } | null = null;

async function carregarMapa() {
  const agora = Date.now();
  if (cache && agora - cache.ts < 5 * 60_000) return cache.porCaminho;
  const categorias = await prisma.magaluCategoria.findMany({ where: { folha: true }, select: { id: true, path: true } });
  const porCaminho = new Map<string, string>();
  for (const c of categorias) porCaminho.set(norm(c.path), c.id);
  cache = { ts: agora, porCaminho };
  return porCaminho;
}

export function invalidarCacheMagaluCategorias() {
  cache = null;
}

export async function resolverMagaluCategoriaIdPorCaminho(caminhoSemPrefixo: string): Promise<string | null> {
  const mapa = await carregarMapa();
  return mapa.get(norm(MAGALU_PREFIXO_CAMINHO + caminhoSemPrefixo)) || null;
}

/** Sugere o UUID da categoria Magalu pra peca. Null se a tabela MagaluCategoria ainda nao foi sincronizada. */
export async function sugerirMagaluCategoriaId(descricao?: string | null, tipoPeca?: string | null): Promise<string | null> {
  return resolverMagaluCategoriaIdPorCaminho(sugerirMagaluCategoriaCaminho(descricao, tipoPeca));
}
