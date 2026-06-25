-- Telefone/WhatsApp do usuario (destinatario de alertas via WhatsApp).
ALTER TABLE "AppUser"
  ADD COLUMN IF NOT EXISTS "telefone" TEXT NOT NULL DEFAULT '';
