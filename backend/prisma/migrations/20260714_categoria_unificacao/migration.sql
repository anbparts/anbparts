-- Unificação de categorias (agrupamento) para a Curva ABC + modo de contagem de múltiplas.
CREATE TABLE IF NOT EXISTS "CategoriaUnificacao" (
  "id" SERIAL NOT NULL,
  "origem" TEXT NOT NULL,
  "destino" TEXT NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoriaUnificacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaUnificacao_origem_key" ON "CategoriaUnificacao"("origem");

ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "curvaAbcModoMultiplas" TEXT NOT NULL DEFAULT 'todas';
