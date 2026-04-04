ALTER TABLE "Peca"
ALTER COLUMN "blingPedidoId" TYPE TEXT
USING "blingPedidoId"::TEXT;

DROP INDEX IF EXISTS "Peca_blingPedidoId_idx";
CREATE INDEX IF NOT EXISTS "Peca_blingPedidoId_idx" ON "Peca" ("blingPedidoId");
