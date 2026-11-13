// Catalogo de categorias de despesa: cada categoria pertence a um GRUPO do DRE e e' FIXA ou VARIAVEL.
// A despesa continua guardando so o nome da categoria (Despesa.categoria); o DRE le este catalogo para saber
// onde cada categoria entra. Tabela criada sob demanda (sem migration), com carga inicial na primeira leitura.
import { prisma } from './prisma';

export type GrupoDespesa = 'deducao' | 'cmv_aquisicao' | 'cmv_insumo' | 'adm' | 'pessoal' | 'comercial' | 'imobilizado';
export type TipoCusto = 'fixa' | 'variavel';

export const GRUPOS_DESPESA: { valor: GrupoDespesa; rotulo: string; ajuda: string }[] = [
  { valor: 'adm', rotulo: 'Administrativas e de estrutura', ajuda: 'Despesas operacionais (aluguel, energia, sistemas, contador...)' },
  { valor: 'imobilizado', rotulo: 'Investimento em ativos', ajuda: 'Compra de ativos da empresa (Empresa > Estrutura): NÃO entra como despesa no DRE; o custo aparece pela depreciação do ativo' },
  { valor: 'pessoal', rotulo: 'Pessoal', ajuda: 'Despesas operacionais com equipe (salários, encargos, benefícios)' },
  { valor: 'comercial', rotulo: 'Comerciais e de vendas', ajuda: 'Despesas operacionais de venda (comissões, fretes, embalagens, marketing)' },
  { valor: 'cmv_insumo', rotulo: 'CMV · Insumos diretos', ajuda: 'Entra no custo das mercadorias vendidas (etiquetas, lacres, químicos)' },
  { valor: 'cmv_aquisicao', rotulo: 'CMV · Custos de aquisição da moto', ajuda: 'Leiloeiro, pátio e guincho: rateados no custo das peças vendidas' },
  { valor: 'deducao', rotulo: 'Deduções da receita (impostos)', ajuda: 'Impostos sobre vendas (DAS): saem antes da receita líquida' },
];

export type CategoriaDespesa = {
  nome: string;
  grupo: GrupoDespesa;
  tipo: TipoCusto;
  ativa: boolean;
  legado: boolean;
  ordem: number;
};

const SEED: { nome: string; grupo: GrupoDespesa; tipo: TipoCusto; legado?: boolean }[] = [
  // Administrativas e de estrutura (fixas)
  { nome: 'Aluguel', grupo: 'adm', tipo: 'fixa' },
  { nome: 'IPTU e Condomínio', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Energia Elétrica e Água', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Internet e Telefonia', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Sistemas e Softwares', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Honorários Contábeis', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Despachante / Taxas Detran', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Segurança e Monitoramento', grupo: 'adm', tipo: 'fixa' },
  { nome: 'Material de Escritório e Limpeza', grupo: 'adm', tipo: 'fixa' },
  // Pessoal
  { nome: 'Salários e Ordenados', grupo: 'pessoal', tipo: 'fixa' },
  { nome: 'Encargos Sociais e Trabalhistas', grupo: 'pessoal', tipo: 'fixa' },
  { nome: 'Benefícios', grupo: 'pessoal', tipo: 'fixa' },
  // Comerciais e de vendas (variaveis)
  { nome: 'Comissões de Marketplaces', grupo: 'comercial', tipo: 'variavel' },
  { nome: 'Fretes de Envio', grupo: 'comercial', tipo: 'variavel' },
  { nome: 'Embalagens de Envio', grupo: 'comercial', tipo: 'variavel' },
  { nome: 'Marketing e Anúncios', grupo: 'comercial', tipo: 'variavel' },
  { nome: 'Comissões de Vendedores', grupo: 'comercial', tipo: 'variavel' },
  // Investimento em ativos (compras de ativos da Estrutura; fora do DRE, depreciacao entra nas administrativas)
  { nome: 'Equipamentos e Ferramentas', grupo: 'imobilizado', tipo: 'fixa' },
  { nome: 'Móveis e Utensílios', grupo: 'imobilizado', tipo: 'fixa' },
  { nome: 'Informática e Eletrônicos', grupo: 'imobilizado', tipo: 'fixa' },
  { nome: 'Obras e Instalações', grupo: 'imobilizado', tipo: 'fixa' },
  { nome: 'Veículos', grupo: 'imobilizado', tipo: 'fixa' },
  // Categorias que ja existiam (mantidas para nao perder o historico; reclassifique para as novas)
  { nome: 'Imposto', grupo: 'deducao', tipo: 'variavel' },
  { nome: 'Moto', grupo: 'cmv_aquisicao', tipo: 'variavel' },
  { nome: 'Insumo', grupo: 'cmv_insumo', tipo: 'variavel' },
  { nome: 'Servicos', grupo: 'adm', tipo: 'variavel', legado: true },
  { nome: 'Taxas', grupo: 'adm', tipo: 'variavel', legado: true },
  { nome: 'Sistemas', grupo: 'adm', tipo: 'fixa', legado: true },
  { nome: 'Outros', grupo: 'adm', tipo: 'variavel', legado: true },
];

const GRUPOS_VALIDOS = GRUPOS_DESPESA.map((g) => g.valor) as string[];
const txt = (v: any) => String(v ?? '').trim();
export const semAcento = (v: any) => txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DespesaCategoria" (
    "nome" TEXT PRIMARY KEY, "grupo" TEXT NOT NULL, "tipo" TEXT NOT NULL, "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT TRUE, "legado" BOOLEAN NOT NULL DEFAULT FALSE, "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "DespesaCategoria"`);
  if (!n) {
    for (let i = 0; i < SEED.length; i++) {
      const s = SEED[i];
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DespesaCategoria" ("nome","grupo","tipo","ordem","legado") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("nome") DO NOTHING`,
        s.nome, s.grupo, s.tipo, i + 1, !!s.legado,
      );
    }
  }
  // categorias novas do catalogo entram tambem em instalacoes que ja tinham o catalogo carregado (nao mexe nas existentes)
  for (let i = 0; i < SEED.length; i++) {
    const s = SEED[i];
    if (s.grupo !== 'imobilizado') continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DespesaCategoria" ("nome","grupo","tipo","ordem","legado") VALUES ($1,$2,$3,$4,FALSE) ON CONFLICT ("nome") DO NOTHING`,
      s.nome, s.grupo, s.tipo, 500 + i,
    );
  }
  tabelaPronta = true;
}

// Categorias usadas em despesas mas ausentes do catalogo (ex.: "Contador", digitadas antes) entram como administrativas/variaveis.
async function registrarFaltantes() {
  const usadas = await prisma.$queryRawUnsafe<{ categoria: string }[]>(
    `SELECT DISTINCT "categoria" FROM "Despesa" WHERE "categoria" IS NOT NULL AND btrim("categoria") <> ''`,
  );
  if (!usadas.length) return;
  const existentes = await prisma.$queryRawUnsafe<{ nome: string }[]>(`SELECT "nome" FROM "DespesaCategoria"`);
  const conhecidas = new Set(existentes.map((e) => semAcento(e.nome)));
  let ordem = 1000;
  for (const u of usadas) {
    const nome = txt(u.categoria);
    if (!nome || conhecidas.has(semAcento(nome))) continue;
    conhecidas.add(semAcento(nome));
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DespesaCategoria" ("nome","grupo","tipo","ordem","legado") VALUES ($1,'adm','variavel',$2,TRUE) ON CONFLICT ("nome") DO NOTHING`,
      nome, ordem++,
    );
  }
}

export async function listarCategoriasDespesa(): Promise<CategoriaDespesa[]> {
  await garantirTabela();
  await registrarFaltantes();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "nome","grupo","tipo","ativa","legado","ordem" FROM "DespesaCategoria" ORDER BY "ordem","nome"`);
  return rows.map((r) => ({
    nome: r.nome,
    grupo: (GRUPOS_VALIDOS.includes(r.grupo) ? r.grupo : 'adm') as GrupoDespesa,
    tipo: (r.tipo === 'fixa' ? 'fixa' : 'variavel') as TipoCusto,
    ativa: !!r.ativa,
    legado: !!r.legado,
    ordem: Number(r.ordem) || 0,
  }));
}

// Mapa (sem acento / minusculo) -> categoria, para o DRE agrupar as despesas.
export async function mapaCategoriasDespesa() {
  const lista = await listarCategoriasDespesa();
  const mapa = new Map<string, CategoriaDespesa>();
  for (const c of lista) mapa.set(semAcento(c.nome), c);
  return mapa;
}

export async function contarDespesasPorCategoria(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ categoria: string; n: number }[]>(
    `SELECT "categoria", count(*)::int AS n FROM "Despesa" GROUP BY "categoria"`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.categoria] = r.n;
  return out;
}

function validar(grupo: any, tipo: any) {
  if (!GRUPOS_VALIDOS.includes(String(grupo))) throw Object.assign(new Error('Grupo do DRE invalido'), { status: 400 });
  if (tipo !== 'fixa' && tipo !== 'variavel') throw Object.assign(new Error('Tipo deve ser fixa ou variavel'), { status: 400 });
}

export async function criarCategoriaDespesa(nomeRaw: any, grupo: any, tipo: any) {
  await garantirTabela();
  const nome = txt(nomeRaw);
  if (!nome) throw Object.assign(new Error('Informe o nome da categoria'), { status: 400 });
  validar(grupo, tipo);
  const existentes = await listarCategoriasDespesa();
  if (existentes.some((c) => semAcento(c.nome) === semAcento(nome))) throw Object.assign(new Error('Ja existe uma categoria com esse nome'), { status: 400 });
  const ordem = existentes.reduce((m, c) => Math.max(m, c.ordem), 0) + 1;
  await prisma.$executeRawUnsafe(`INSERT INTO "DespesaCategoria" ("nome","grupo","tipo","ordem") VALUES ($1,$2,$3,$4)`, nome, grupo, tipo, ordem);
}

export async function atualizarCategoriaDespesa(nomeRaw: any, dados: { grupo?: any; tipo?: any; ativa?: any }) {
  await garantirTabela();
  const nome = txt(nomeRaw);
  const atual = (await listarCategoriasDespesa()).find((c) => c.nome === nome);
  if (!atual) throw Object.assign(new Error('Categoria nao encontrada'), { status: 404 });
  const grupo = dados.grupo ?? atual.grupo;
  const tipo = dados.tipo ?? atual.tipo;
  validar(grupo, tipo);
  const ativa = dados.ativa === undefined ? atual.ativa : !!dados.ativa;
  await prisma.$executeRawUnsafe(`UPDATE "DespesaCategoria" SET "grupo"=$2,"tipo"=$3,"ativa"=$4 WHERE "nome"=$1`, nome, grupo, tipo, ativa);
}
