ALTER TABLE "Despesa"
ADD COLUMN "recorrenciaSerieId" TEXT,
ADD COLUMN "recorrenciaTipo" TEXT,
ADD COLUMN "recorrenciaFim" TIMESTAMP(3),
ADD COLUMN "recorrenciaGerada" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Despesa_recorrenciaSerieId_idx" ON "Despesa"("recorrenciaSerieId");
CREATE INDEX "Despesa_recorrenciaTipo_idx" ON "Despesa"("recorrenciaTipo");
