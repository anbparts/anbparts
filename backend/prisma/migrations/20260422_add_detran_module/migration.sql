CREATE TABLE IF NOT EXISTS "DetranConfig" (
  "slug" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sisdevCpf" TEXT NOT NULL DEFAULT '',
  "sisdevPassword" TEXT NOT NULL DEFAULT '',
  "empresaCnpj" TEXT NOT NULL DEFAULT '',
  "empresaCodigo" TEXT NOT NULL DEFAULT '',
  "empresaNome" TEXT NOT NULL DEFAULT '',
  "gmailEmail" TEXT NOT NULL DEFAULT '',
  "gmailClientId" TEXT NOT NULL DEFAULT '',
  "gmailClientSecret" TEXT NOT NULL DEFAULT '',
  "gmailRefreshToken" TEXT NOT NULL DEFAULT '',
  "otpRemetente" TEXT NOT NULL DEFAULT 'detran.sisdev@sp.gov.br',
  "otpAssunto" TEXT NOT NULL DEFAULT '[DETRAN-SISDEV] Codigo de Verificacao',
  "otpRegex" TEXT NOT NULL DEFAULT '([A-Z0-9]{4,10})\\s+e seu codigo de verificacao',
  "reuseSession" BOOLEAN NOT NULL DEFAULT true,
  "runHeadless" BOOLEAN NOT NULL DEFAULT true,
  "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
  "screenshotEachStep" BOOLEAN NOT NULL DEFAULT true,
  "htmlAfterProximo" BOOLEAN NOT NULL DEFAULT true,
  "captureNetworkTrace" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DetranConfig_pkey" PRIMARY KEY ("slug")
);

CREATE TABLE IF NOT EXISTS "DetranExecucao" (
  "id" SERIAL NOT NULL,
  "runId" TEXT NOT NULL,
  "flow" TEXT NOT NULL DEFAULT 'peca_avulsa_poc',
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "placa" TEXT,
  "renavam" TEXT,
  "chassi" TEXT,
  "tipoPeca" TEXT,
  "notaFiscalEntrada" TEXT,
  "cartelaNumero" TEXT,
  "etiquetaInformada" TEXT,
  "modoEtiqueta" TEXT DEFAULT 'direta',
  "observacoes" TEXT,
  "resultadoMensagem" TEXT,
  "errorMessage" TEXT,
  "currentUrl" TEXT,
  "pageTitle" TEXT,
  "duracaoMs" INTEGER,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "artifacts" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DetranExecucao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DetranExecucaoEtapa" (
  "id" SERIAL NOT NULL,
  "execucaoId" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "url" TEXT,
  "title" TEXT,
  "message" TEXT,
  "durationMs" INTEGER,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DetranExecucaoEtapa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DetranExecucaoEtapa_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "DetranExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DetranExecucao_runId_key" ON "DetranExecucao"("runId");
CREATE INDEX IF NOT EXISTS "DetranExecucao_status_createdAt_idx" ON "DetranExecucao"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DetranExecucao_flow_createdAt_idx" ON "DetranExecucao"("flow", "createdAt");
CREATE INDEX IF NOT EXISTS "DetranExecucao_createdBy_createdAt_idx" ON "DetranExecucao"("createdBy", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "DetranExecucaoEtapa_execucaoId_step_key" ON "DetranExecucaoEtapa"("execucaoId", "step");
CREATE INDEX IF NOT EXISTS "DetranExecucaoEtapa_execucaoId_ordem_idx" ON "DetranExecucaoEtapa"("execucaoId", "ordem");
CREATE INDEX IF NOT EXISTS "DetranExecucaoEtapa_status_idx" ON "DetranExecucaoEtapa"("status");
