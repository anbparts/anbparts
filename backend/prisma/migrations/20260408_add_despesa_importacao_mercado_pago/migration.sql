ALTER TABLE "Despesa"
ADD COLUMN "importOrigem" TEXT,
ADD COLUMN "importChave" TEXT,
ADD COLUMN "importArquivo" TEXT;

CREATE UNIQUE INDEX "Despesa_importChave_key" ON "Despesa"("importChave");
CREATE INDEX "Despesa_importOrigem_idx" ON "Despesa"("importOrigem");
