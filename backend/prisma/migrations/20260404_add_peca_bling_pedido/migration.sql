ALTER TABLE "Peca"
ADD COLUMN IF NOT EXISTS "blingPedidoId" INTEGER,
ADD COLUMN IF NOT EXISTS "blingPedidoNum" TEXT;

CREATE INDEX IF NOT EXISTS "Peca_blingPedidoId_idx" ON "Peca" ("blingPedidoId");
CREATE INDEX IF NOT EXISTS "Peca_blingPedidoNum_idx" ON "Peca" ("blingPedidoNum");
