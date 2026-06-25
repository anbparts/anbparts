-- Rotina de alerta por WhatsApp das fotos pendentes de tratamento no Drive.
ALTER TABLE "ConfiguracaoGeral"
  ADD COLUMN IF NOT EXISTS "whatsappFotosPendentesAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappFotosPendentesIntervaloHoras" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "whatsappFotosPendentesUltimaExecucaoEm" TIMESTAMP(3);

-- Controle de SKUs ja avisados (evita repetir o aviso da mesma pasta pendente).
CREATE TABLE IF NOT EXISTS "FotoPendenteNotificada" (
  "id" SERIAL PRIMARY KEY,
  "sku" TEXT NOT NULL,
  "notificadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FotoPendenteNotificada_sku_key" ON "FotoPendenteNotificada"("sku");
