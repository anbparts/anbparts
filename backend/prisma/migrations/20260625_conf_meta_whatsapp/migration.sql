-- Credenciais da integracao com a API oficial da Meta (WhatsApp Cloud API).
ALTER TABLE "ConfiguracaoGeral"
  ADD COLUMN IF NOT EXISTS "whatsappToken" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappPhoneNumberId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappWabaId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappTemplateNome" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappAtivo" BOOLEAN NOT NULL DEFAULT false;
