-- Baixa de etiqueta DETRAN por etiqueta individual (peça pode ter mais de uma, ex.: "Par")
CREATE TABLE "DetranEtiquetaBaixa" (
  "id" SERIAL NOT NULL,
  "pecaId" INTEGER NOT NULL,
  "etiqueta" TEXT NOT NULL,
  "baixadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comprovanteNome" TEXT,
  "comprovanteArquivo" TEXT,
  CONSTRAINT "DetranEtiquetaBaixa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DetranEtiquetaBaixa_pecaId_etiqueta_key" ON "DetranEtiquetaBaixa"("pecaId", "etiqueta");
CREATE INDEX "DetranEtiquetaBaixa_pecaId_idx" ON "DetranEtiquetaBaixa"("pecaId");

ALTER TABLE "DetranEtiquetaBaixa"
  ADD CONSTRAINT "DetranEtiquetaBaixa_pecaId_fkey"
  FOREIGN KEY ("pecaId") REFERENCES "Peca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: peças já marcadas como baixadas (detranBaixada=true) registram cada etiqueta como baixada,
-- preservando data e comprovante. Assim nada reaparece como pendente após o deploy.
INSERT INTO "DetranEtiquetaBaixa" ("pecaId", "etiqueta", "baixadaEm", "comprovanteNome", "comprovanteArquivo")
SELECT p."id",
       btrim(e.etq),
       COALESCE(p."detranBaixadaAt", CURRENT_TIMESTAMP),
       p."detranComprovanteNome",
       p."detranComprovanteArquivo"
FROM "Peca" p
CROSS JOIN LATERAL unnest(string_to_array(p."detranEtiqueta", '/')) AS e(etq)
WHERE p."detranBaixada" = true
  AND p."detranEtiqueta" IS NOT NULL
  AND btrim(e.etq) <> ''
ON CONFLICT ("pecaId", "etiqueta") DO NOTHING;
