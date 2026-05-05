-- Adiciona campo etiquetaPendente na tabela Peca
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "etiquetaPendente" BOOLEAN NOT NULL DEFAULT false;

-- Cria tabela HistoricoDevolucao
CREATE TABLE IF NOT EXISTS "HistoricoDevolucao" (
  "id"                SERIAL PRIMARY KEY,
  "pecaId"            INTEGER NOT NULL,
  "idPeca"            TEXT NOT NULL,
  "descricao"         TEXT NOT NULL,
  "motoId"            INTEGER NOT NULL,
  "motoNome"          TEXT NOT NULL,
  "pedidoBlingId"     TEXT,
  "pedidoBlingNum"    TEXT,
  "valorLiq"          DECIMAL(12,2) NOT NULL DEFAULT 0,
  "valorFrete"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "valorTaxas"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "precoML"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dataVenda"         TIMESTAMP(3),
  "dataDevolucao"     TIMESTAMP(3) NOT NULL,
  "etiquetasDetran"   TEXT,
  "nfVendaNumero"     TEXT,
  "nfDevolucaoNumero" TEXT,
  "observacoes"       TEXT,
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("pecaId") REFERENCES "Peca"("id"),
  FOREIGN KEY ("motoId") REFERENCES "Moto"("id")
);

CREATE INDEX IF NOT EXISTS "HistoricoDevolucao_idPeca_idx" ON "HistoricoDevolucao"("idPeca");
CREATE INDEX IF NOT EXISTS "HistoricoDevolucao_motoId_idx" ON "HistoricoDevolucao"("motoId");
CREATE INDEX IF NOT EXISTS "HistoricoDevolucao_dataDevolucao_idx" ON "HistoricoDevolucao"("dataDevolucao");
CREATE INDEX IF NOT EXISTS "HistoricoDevolucao_dataVenda_idx" ON "HistoricoDevolucao"("dataVenda");
CREATE INDEX IF NOT EXISTS "HistoricoDevolucao_pedidoBlingNum_idx" ON "HistoricoDevolucao"("pedidoBlingNum");
