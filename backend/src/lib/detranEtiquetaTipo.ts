// Tipo de peca POR ETIQUETA avulsa (tabela "DetranEtiquetaTipo", criada sob demanda: sem migration).
// Chave: (pecaId, preCadastro, etiqueta). preCadastro=true => pecaId e' o id do CadastroPeca; false => id da Peca.
// Na finalizacao do pre-cadastro os tipos sao copiados para as pecas criadas (copiarTiposCadastroParaPeca).
import { prisma } from './prisma';

let tabelaPronta = false;
export async function garantirTabelaTipoEtiqueta() {
  if (tabelaPronta) return;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DetranEtiquetaTipo" (
    "pecaId" INTEGER NOT NULL, "preCadastro" BOOLEAN NOT NULL DEFAULT false, "etiqueta" TEXT NOT NULL,
    "tipoPeca" TEXT NOT NULL, "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("pecaId", "preCadastro", "etiqueta"))`);
  tabelaPronta = true;
}

const normEtq = (s: any) => String(s || '').trim().toUpperCase();

// Grava (upsert) os tipos informados: { ETIQUETA: tipo }. Tipo vazio remove o registro daquela etiqueta.
export async function salvarTiposEtiqueta(pecaId: number, preCadastro: boolean, tipos: Record<string, string> | null | undefined) {
  if (!tipos || typeof tipos !== 'object') return;
  await garantirTabelaTipoEtiqueta();
  for (const [etqBruta, tipoBruto] of Object.entries(tipos)) {
    const etq = normEtq(etqBruta);
    const tipo = String(tipoBruto || '').trim();
    if (!etq) continue;
    if (!tipo) {
      await prisma.$executeRawUnsafe(`DELETE FROM "DetranEtiquetaTipo" WHERE "pecaId" = $1 AND "preCadastro" = $2 AND "etiqueta" = $3`, pecaId, preCadastro, etq);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DetranEtiquetaTipo" ("pecaId","preCadastro","etiqueta","tipoPeca") VALUES ($1,$2,$3,$4)
       ON CONFLICT ("pecaId","preCadastro","etiqueta") DO UPDATE SET "tipoPeca" = $4, "atualizadoEm" = now()`,
      pecaId, preCadastro, etq, tipo,
    );
  }
}

export async function lerTiposEtiqueta(pecaId: number, preCadastro: boolean): Promise<Record<string, string>> {
  try {
    await garantirTabelaTipoEtiqueta();
    const rows = await prisma.$queryRawUnsafe<{ etiqueta: string; tipoPeca: string }[]>(
      `SELECT "etiqueta","tipoPeca" FROM "DetranEtiquetaTipo" WHERE "pecaId" = $1 AND "preCadastro" = $2`, pecaId, preCadastro,
    );
    const out: Record<string, string> = {};
    for (const r of rows) out[normEtq(r.etiqueta)] = String(r.tipoPeca);
    return out;
  } catch {
    return {};
  }
}

// Pre-cadastro finalizado: cada peca criada herda o tipo das etiquetas que recebeu.
export async function copiarTiposCadastroParaPeca(cadastroId: number, pecaId: number, detranEtiqueta: string | null | undefined) {
  try {
    const tipos = await lerTiposEtiqueta(cadastroId, true);
    const etiquetas = String(detranEtiqueta || '').split('/').map(normEtq).filter(Boolean);
    const aGravar: Record<string, string> = {};
    for (const etq of etiquetas) if (tipos[etq]) aGravar[etq] = tipos[etq];
    await salvarTiposEtiqueta(pecaId, false, aGravar);
  } catch (e) {
    console.error('[detranEtiquetaTipo] falha ao copiar tipos do pre-cadastro:', e);
  }
}
