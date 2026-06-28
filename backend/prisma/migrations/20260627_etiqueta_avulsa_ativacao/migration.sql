-- Nº da Nota Fiscal de Entrada da moto (usado na ativação de etiqueta avulsa)
ALTER TABLE "Moto" ADD COLUMN "notaFiscalEntrada" TEXT;

-- Ativação (entrada no DETRAN) de etiqueta avulsa, por etiqueta individual
CREATE TABLE "DetranEtiquetaAtivacao" (
  "id" SERIAL NOT NULL,
  "pecaId" INTEGER NOT NULL,
  "etiqueta" TEXT NOT NULL,
  "ativadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comprovanteNome" TEXT,
  "comprovanteArquivo" TEXT,
  CONSTRAINT "DetranEtiquetaAtivacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DetranEtiquetaAtivacao_pecaId_etiqueta_key" ON "DetranEtiquetaAtivacao"("pecaId", "etiqueta");
CREATE INDEX "DetranEtiquetaAtivacao_pecaId_idx" ON "DetranEtiquetaAtivacao"("pecaId");

ALTER TABLE "DetranEtiquetaAtivacao"
  ADD CONSTRAINT "DetranEtiquetaAtivacao_pecaId_fkey"
  FOREIGN KEY ("pecaId") REFERENCES "Peca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sem backfill: etiquetas avulsas com cadastro > 30 dias são consideradas ativas por idade (derivado em runtime).
