ALTER TABLE "Peca"
ADD COLUMN "mercadoLivreItemId" TEXT;

CREATE INDEX "Peca_mercadoLivreItemId_idx" ON "Peca"("mercadoLivreItemId");

ALTER TABLE "BlingConfig"
ADD COLUMN "auditoriaLinkMlAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "auditoriaLinkMlHorario" TEXT NOT NULL DEFAULT '05:00',
ADD COLUMN "auditoriaLinkMlIntervaloDias" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "auditoriaLinkMlUltimaExecucaoChave" TEXT,
ADD COLUMN "auditoriaLinkMlUltimaExecucaoEm" TIMESTAMP(3);
