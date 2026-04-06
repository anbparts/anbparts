ALTER TABLE "BlingConfig"
ADD COLUMN IF NOT EXISTS "auditoriaAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "auditoriaHorario" TEXT NOT NULL DEFAULT '03:00',
ADD COLUMN IF NOT EXISTS "auditoriaEmailDestinatario" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "auditoriaResendApiKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "auditoriaResendFrom" TEXT NOT NULL DEFAULT 'alertas@mail.anbparts.com.br',
ADD COLUMN IF NOT EXISTS "auditoriaTamanhoLote" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS "auditoriaPausaMs" INTEGER NOT NULL DEFAULT 400,
ADD COLUMN IF NOT EXISTS "auditoriaUltimaExecucaoChave" TEXT,
ADD COLUMN IF NOT EXISTS "auditoriaUltimaExecucaoEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AuditoriaAutomaticaExecucao" (
  "id" SERIAL NOT NULL,
  "origem" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "totalSkus" INTEGER NOT NULL DEFAULT 0,
  "totalDivergencias" INTEGER NOT NULL DEFAULT 0,
  "totalSemDivergencia" INTEGER NOT NULL DEFAULT 0,
  "emailDestinatario" TEXT,
  "emailEnviado" BOOLEAN NOT NULL DEFAULT false,
  "emailAssunto" TEXT,
  "emailErro" TEXT,
  "erro" TEXT,
  "resumo" JSONB,
  "divergencias" JSONB,

  CONSTRAINT "AuditoriaAutomaticaExecucao_pkey" PRIMARY KEY ("id")
);
