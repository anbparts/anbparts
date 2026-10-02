CREATE TABLE IF NOT EXISTS "MagaluCategoria" (
    "id" TEXT PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "folha" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "MagaluCategoria_path_idx" ON "MagaluCategoria"("path");
