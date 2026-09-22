ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "painelDespesasReceitaLinhas" JSONB NOT NULL DEFAULT '[]';
