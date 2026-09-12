ALTER TABLE "CadastroPeca" ADD COLUMN IF NOT EXISTS "sucata" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "sucata" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Peca_sucata_disponivel_idx" ON "Peca"("sucata", "disponivel");
