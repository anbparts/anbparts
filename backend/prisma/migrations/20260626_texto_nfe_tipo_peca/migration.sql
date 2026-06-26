-- Templates de texto da NF-e por tipo de peça DETRAN + config do e-mail de aviso.
CREATE TABLE IF NOT EXISTS "TextoTipoPeca" (
  "id" SERIAL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TextoTipoPeca_tipo_key" ON "TextoTipoPeca"("tipo");

ALTER TABLE "ConfiguracaoGeral"
  ADD COLUMN IF NOT EXISTS "nfeTextoEmailDestinatario" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "nfeTextoEmailTitulo" TEXT NOT NULL DEFAULT 'ANB Parts - Texto da NF-e necessario - Verifique';
