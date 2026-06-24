-- Tabela dedicada aos anexos das motos (1 linha por anexo), fora do JSON Moto.anexos.
CREATE TABLE IF NOT EXISTS "MotoAnexo" (
    "motoId" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MotoAnexo_pkey" PRIMARY KEY ("motoId", "chave")
);

CREATE INDEX IF NOT EXISTS "MotoAnexo_motoId_idx" ON "MotoAnexo" ("motoId");

-- Copia os anexos atuais do JSON Moto.anexos para a tabela (raw fica raw, zipado fica zipado).
-- NAO esvazia o Moto.anexos (fica como rede de seguranca; limpeza vira num passo posterior).
INSERT INTO "MotoAnexo" ("motoId", "chave", "nome", "arquivo")
SELECT m.id, a.key, a.value->>'name', a.value->>'dataUrl'
FROM "Moto" m
CROSS JOIN LATERAL jsonb_each(m."anexos") AS a(key, value)
WHERE jsonb_typeof(m."anexos") = 'object'
  AND (a.value->>'dataUrl') LIKE 'data:%'
  AND (a.value->>'name') IS NOT NULL
ON CONFLICT ("motoId", "chave") DO NOTHING;
