-- Log de reajuste manual de preco na tela Estoque, com motivo e reversao automatica
-- (desconto ao cliente nao efetivado em 3 dias volta ao preco anterior).
CREATE TABLE IF NOT EXISTS "HistoricoPrecoPeca" (
  "id" SERIAL NOT NULL,
  "pecaId" INTEGER NOT NULL,
  "sku" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "valorAnterior" DECIMAL(12,2) NOT NULL,
  "valorNovo" DECIMAL(12,2) NOT NULL,
  "motivo" TEXT NOT NULL,
  "observacao" TEXT,
  "usuario" TEXT,
  "reverterEm" TIMESTAMP(3),
  "revertido" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoPrecoPeca_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HistoricoPrecoPeca_pecaId_idx" ON "HistoricoPrecoPeca"("pecaId");
CREATE INDEX IF NOT EXISTS "HistoricoPrecoPeca_reverterEm_idx" ON "HistoricoPrecoPeca"("reverterEm");
CREATE INDEX IF NOT EXISTS "HistoricoPrecoPeca_sku_idx" ON "HistoricoPrecoPeca"("sku");
