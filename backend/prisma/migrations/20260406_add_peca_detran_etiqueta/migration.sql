ALTER TABLE "Peca"
ADD COLUMN "detranEtiqueta" TEXT;

CREATE INDEX "Peca_motoId_detranEtiqueta_idx" ON "Peca"("motoId", "detranEtiqueta");
