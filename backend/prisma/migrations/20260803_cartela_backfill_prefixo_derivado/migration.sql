-- Backfill adicional: muitas motos tem posicoes salvas em MotoDetranPosicao (com o codigo
-- completo da etiqueta, ex: SP22102017680001) mas nunca tiveram o campo Moto.detranCartelaId
-- (o prefixo, "ID da Cartela") preenchido explicitamente. Sem o prefixo, a migration anterior
-- (20260802_add_cartela_historico) nao conseguia registrar a Cartela dessas motos.
--
-- Aqui deduzimos o prefixo a partir dos proprios codigos ja salvos: cada etiqueta valida de
-- cartela e "prefixo" + posicao com 3 digitos (ex: posicao 1 -> final "001"). Filtramos so as
-- linhas onde os 3 ultimos digitos batem com a posicao (evita lixo/dado inconsistente) e, por
-- moto, pegamos o prefixo mais frequente entre as posicoes salvas.

WITH prefixos_candidatos AS (
  SELECT
    "motoId",
    left("etiqueta", length("etiqueta") - 3) AS prefixo_derivado,
    count(*) AS qtd
  FROM "MotoDetranPosicao"
  WHERE "etiqueta" IS NOT NULL
    AND length("etiqueta") > 3
    AND right("etiqueta", 3) = lpad("posicao"::text, 3, '0')
  GROUP BY "motoId", left("etiqueta", length("etiqueta") - 3)
),
melhor_prefixo AS (
  SELECT DISTINCT ON ("motoId") "motoId", prefixo_derivado
  FROM prefixos_candidatos
  WHERE prefixo_derivado <> ''
  ORDER BY "motoId", qtd DESC
)
UPDATE "Moto" m
SET "detranCartelaId" = mp.prefixo_derivado
FROM melhor_prefixo mp
WHERE mp."motoId" = m."id"
  AND (m."detranCartelaId" IS NULL OR m."detranCartelaId" = '');

-- Repete o mesmo backfill da migration anterior (idempotente via ON CONFLICT DO NOTHING) —
-- agora cobre tambem as motos cujo prefixo acabou de ser deduzido e preenchido acima.
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
