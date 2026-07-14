-- Espelho da hierarquia de categorias da Nuvemshop (para o modo "mais específica" da Curva ABC).
CREATE TABLE IF NOT EXISTS "NuvemshopCategoria" (
  "categoriaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "parentId" TEXT NOT NULL DEFAULT '',
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NuvemshopCategoria_pkey" PRIMARY KEY ("categoriaId")
);
