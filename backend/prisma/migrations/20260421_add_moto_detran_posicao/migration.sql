CREATE TABLE IF NOT EXISTS "MotoDetranPosicao" (
  "id"       SERIAL PRIMARY KEY,
  "motoId"   INTEGER NOT NULL,
  "posicao"  INTEGER NOT NULL,
  "tipo"     TEXT NOT NULL,
  "status"   TEXT,
  "idPeca"   TEXT,
  "etiqueta" TEXT,
  CONSTRAINT "MotoDetranPosicao_motoId_posicao_key" UNIQUE ("motoId", "posicao"),
  CONSTRAINT "MotoDetranPosicao_motoId_fkey" FOREIGN KEY ("motoId") REFERENCES "Moto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MotoDetranPosicao_motoId_idx" ON "MotoDetranPosicao"("motoId");
