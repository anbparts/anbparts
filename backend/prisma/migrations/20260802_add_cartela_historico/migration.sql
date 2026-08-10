CREATE TABLE IF NOT EXISTS "Cartela" (
  "id"               SERIAL PRIMARY KEY,
  "motoId"           INTEGER NOT NULL,
  "cartelaId"        TEXT NOT NULL,
  "ativa"            BOOLEAN NOT NULL DEFAULT true,
  "ativadaEm"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "inativadaEm"      TIMESTAMP(3),
  "motivoInativacao" TEXT,
  "observacao"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Cartela_motoId_cartelaId_key" UNIQUE ("motoId", "cartelaId"),
  CONSTRAINT "Cartela_motoId_fkey" FOREIGN KEY ("motoId") REFERENCES "Moto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Cartela_motoId_idx" ON "Cartela"("motoId");
CREATE INDEX IF NOT EXISTS "Cartela_ativa_idx" ON "Cartela"("ativa");

CREATE TABLE IF NOT EXISTS "CartelaPosicao" (
  "id"                SERIAL PRIMARY KEY,
  "cartelaRegistroId" INTEGER NOT NULL,
  "posicao"           INTEGER NOT NULL,
  "tipo"              TEXT NOT NULL,
  "status"            TEXT,
  "idPeca"            TEXT,
  "etiqueta"          TEXT,
  CONSTRAINT "CartelaPosicao_cartelaRegistroId_posicao_key" UNIQUE ("cartelaRegistroId", "posicao"),
  CONSTRAINT "CartelaPosicao_cartelaRegistroId_fkey" FOREIGN KEY ("cartelaRegistroId") REFERENCES "Cartela"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CartelaPosicao_cartelaRegistroId_idx" ON "CartelaPosicao"("cartelaRegistroId");

-- Backfill: toda moto que ja tem uma cartela cadastrada (detranCartelaId preenchido) ganha
-- automaticamente um registro Cartela ATIVA, e as posicoes ja salvas em MotoDetranPosicao sao
-- copiadas pra CartelaPosicao. Sem isso, cartelas ja existentes so apareceriam na tela nova
-- depois que alguem reabrisse e salvasse o modal de Etiqueta de cada moto manualmente.
INSERT INTO "Cartela" ("motoId", "cartelaId", "ativa", "ativadaEm", "createdAt", "updatedAt")
SELECT m."id", m."detranCartelaId", true, now(), now(), now()
FROM "Moto" m
WHERE m."detranCartelaId" IS NOT NULL AND m."detranCartelaId" <> ''
ON CONFLICT ("motoId", "cartelaId") DO NOTHING;

INSERT INTO "CartelaPosicao" ("cartelaRegistroId", "posicao", "tipo", "status", "idPeca", "etiqueta")
SELECT c."id", p."posicao", p."tipo", p."status", p."idPeca", p."etiqueta"
FROM "MotoDetranPosicao" p
JOIN "Moto" m ON m."id" = p."motoId"
JOIN "Cartela" c ON c."motoId" = p."motoId" AND c."cartelaId" = m."detranCartelaId"
ON CONFLICT ("cartelaRegistroId", "posicao") DO NOTHING;
