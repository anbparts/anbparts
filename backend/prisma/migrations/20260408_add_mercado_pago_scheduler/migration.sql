ALTER TABLE "MercadoLivreConfig"
ADD COLUMN "mercadoPagoSaldoAutoAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mercadoPagoSaldoAutoHorario" TEXT NOT NULL DEFAULT '06:00',
ADD COLUMN "mercadoPagoSaldoAutoUltimaExecucaoChave" TEXT,
ADD COLUMN "mercadoPagoSaldoAutoUltimaExecucaoEm" TIMESTAMP(3);
