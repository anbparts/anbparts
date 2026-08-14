CREATE TABLE IF NOT EXISTS "Transportadora" (
  "id"        SERIAL PRIMARY KEY,
  "nome"      TEXT NOT NULL,
  "ordem"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Transportadora_nome_key" UNIQUE ("nome")
);

CREATE TABLE IF NOT EXISTS "TransportadoraObservacao" (
  "id"               SERIAL PRIMARY KEY,
  "transportadoraId" INTEGER NOT NULL,
  "texto"            TEXT NOT NULL,
  "ordem"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "TransportadoraObservacao_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Transportadora"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TransportadoraObservacao_transportadoraId_idx" ON "TransportadoraObservacao"("transportadoraId");
