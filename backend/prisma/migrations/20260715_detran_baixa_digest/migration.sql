-- Digest consolidado de baixa de etiqueta DETRAN (1 e-mail agrupando as vendidas pendentes).
CREATE TABLE IF NOT EXISTS "DetranBaixaConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "intervaloMin" INTEGER NOT NULL DEFAULT 20,
  "ultimaExecucaoEm" TIMESTAMP(3),
  CONSTRAINT "DetranBaixaConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DetranBaixaNotificado" (
  "chave" TEXT NOT NULL,
  "notificadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DetranBaixaNotificado_pkey" PRIMARY KEY ("chave")
);
