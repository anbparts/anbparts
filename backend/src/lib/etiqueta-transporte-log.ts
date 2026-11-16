// Registro interno do que os marketplaces devolveram para a etiqueta de transporte (arquivo bruto + PDF gerado + respostas),
// para analise posterior (ex.: qualidade, formato, QR) sem precisar gerar a etiqueta de novo. Falha aqui NUNCA derruba a geracao.
import { prisma } from './prisma';

let tabelaOk = false;
async function garantirTabela() {
  if (tabelaOk) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EtiquetaTransporteLog" (
      "id" SERIAL PRIMARY KEY,
      "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "canal" TEXT NOT NULL,
      "referencias" TEXT,
      "tipoDocumento" TEXT,
      "formatoOrigem" TEXT,
      "brutoNome" TEXT,
      "brutoBase64" TEXT,
      "pdfBase64" TEXT,
      "detalhes" TEXT
    )`);
  tabelaOk = true;
}

export async function registrarEtiquetaTransporte(d: {
  canal: string; referencias: string[]; tipoDocumento?: string; formatoOrigem?: string;
  bruto?: Buffer | null; brutoNome?: string; pdf?: Buffer | null; detalhes?: any;
}) {
  try {
    await garantirTabela();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EtiquetaTransporteLog" ("canal","referencias","tipoDocumento","formatoOrigem","brutoNome","brutoBase64","pdfBase64","detalhes")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      d.canal, d.referencias.join(','), d.tipoDocumento || null, d.formatoOrigem || null, d.brutoNome || null,
      d.bruto ? d.bruto.toString('base64') : null, d.pdf ? d.pdf.toString('base64') : null,
      d.detalhes === undefined ? null : JSON.stringify(d.detalhes).slice(0, 200000),
    );
  } catch (e: any) {
    console.error('[etiqueta-transporte-log] nao foi possivel registrar:', e?.message || e);
  }
}

export async function listarEtiquetaTransporteLog() {
  await garantirTabela();
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","criadoEm","canal","referencias","tipoDocumento","formatoOrigem","brutoNome",
            LENGTH("brutoBase64") AS "brutoBytesB64", LENGTH("pdfBase64") AS "pdfBytesB64"
       FROM "EtiquetaTransporteLog" ORDER BY "id" DESC LIMIT 200`);
}

export async function lerEtiquetaTransporteLog(id: number) {
  await garantirTabela();
  const [r] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EtiquetaTransporteLog" WHERE "id" = $1`, id);
  return r || null;
}
