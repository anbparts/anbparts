-- Configuracao da rotina de limpeza automatica das fotos de capa de pecas ja vendidas.
ALTER TABLE "ConfiguracaoGeral"
  ADD COLUMN IF NOT EXISTS "limpezaFotosPecaAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "limpezaFotosPecaHorario" TEXT NOT NULL DEFAULT '03:00',
  ADD COLUMN IF NOT EXISTS "limpezaFotosPecaDias" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "limpezaFotosPecaUltimaExecucaoChave" TEXT,
  ADD COLUMN IF NOT EXISTS "limpezaFotosPecaUltimaExecucaoEm" TIMESTAMP(3);
