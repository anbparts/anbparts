-- Rotina de aviso por e-mail: fotos prontas no Drive (pasta com zip + fotos fora do padrão).
CREATE TABLE IF NOT EXISTS "FotosDrivePendenteConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "intervaloMin" INTEGER NOT NULL DEFAULT 20,
  "emailDestinatario" TEXT NOT NULL DEFAULT '',
  "emailTitulo" TEXT NOT NULL DEFAULT 'ANB Parts - Fotos prontas no Drive - Processar',
  "ultimaExecucaoEm" TIMESTAMP(3),
  CONSTRAINT "FotosDrivePendenteConfig_pkey" PRIMARY KEY ("id")
);

-- SKUs já avisados (dedup 1x por SKU; removidos ao sumir do scan para reavisar se reaparecerem)
CREATE TABLE IF NOT EXISTS "FotosDrivePendenteNotificado" (
  "sku" TEXT NOT NULL,
  "nomePasta" TEXT NOT NULL DEFAULT '',
  "notificadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FotosDrivePendenteNotificado_pkey" PRIMARY KEY ("sku")
);
