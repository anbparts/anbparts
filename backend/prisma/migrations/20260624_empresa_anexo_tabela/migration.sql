-- Tabela dedicada aos anexos da empresa (tira o base64 da ConfiguracaoGeral, que os schedulers reescrevem).
CREATE TABLE IF NOT EXISTS "EmpresaAnexo" (
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmpresaAnexo_pkey" PRIMARY KEY ("chave")
);

-- Copia os anexos atuais (apenas itens com dataUrl; ignora metadados __dadosEmpresa/__dadosBancarios).
INSERT INTO "EmpresaAnexo" ("chave", "nome", "arquivo")
SELECT a.key, a.value->>'name', a.value->>'dataUrl'
FROM "ConfiguracaoGeral" c
CROSS JOIN LATERAL jsonb_each(c."empresaAnexos") AS a(key, value)
WHERE jsonb_typeof(c."empresaAnexos") = 'object'
  AND left(a.key, 2) <> '__'
  AND (a.value->>'dataUrl') LIKE 'data:%'
ON CONFLICT ("chave") DO NOTHING;

-- Remove os documentos (base64) do JSON da config, mantendo apenas os metadados pequenos (chaves __...).
UPDATE "ConfiguracaoGeral" c
SET "empresaAnexos" = COALESCE((
    SELECT jsonb_object_agg(a.key, a.value)
    FROM jsonb_each(c."empresaAnexos") AS a(key, value)
    WHERE left(a.key, 2) = '__'
), '{}'::jsonb)
WHERE jsonb_typeof(c."empresaAnexos") = 'object';
