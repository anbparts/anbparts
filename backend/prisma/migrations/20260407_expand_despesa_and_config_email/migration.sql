ALTER TABLE "Despesa"
ADD COLUMN IF NOT EXISTS "statusPagamento" TEXT NOT NULL DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS "dataPagamento" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "chavePix" TEXT,
ADD COLUMN IF NOT EXISTS "codigoBarras" TEXT,
ADD COLUMN IF NOT EXISTS "observacao" TEXT,
ADD COLUMN IF NOT EXISTS "anexoNome" TEXT,
ADD COLUMN IF NOT EXISTS "anexoArquivo" TEXT,
ADD COLUMN IF NOT EXISTS "comprovanteNome" TEXT,
ADD COLUMN IF NOT EXISTS "comprovanteArquivo" TEXT;

CREATE INDEX IF NOT EXISTS "Despesa_statusPagamento_idx" ON "Despesa"("statusPagamento");
CREATE INDEX IF NOT EXISTS "Despesa_data_idx" ON "Despesa"("data");
CREATE INDEX IF NOT EXISTS "Despesa_dataPagamento_idx" ON "Despesa"("dataPagamento");

ALTER TABLE "ConfiguracaoGeral"
ADD COLUMN IF NOT EXISTS "despesasEmailAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "despesasEmailHorario" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN IF NOT EXISTS "despesasEmailDestinatario" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "despesasEmailTitulo" TEXT NOT NULL DEFAULT 'ALERTA ANB Parts - Despesas do Dia - Verifique',
ADD COLUMN IF NOT EXISTS "despesasEmailUltimaExecucaoChave" TEXT,
ADD COLUMN IF NOT EXISTS "despesasEmailUltimaExecucaoEm" TIMESTAMP(3);
