-- Categorias da Nuvemshop por SKU base (alimenta o relatorio Curva ABC)
CREATE TABLE "SkuCategoria" (
  "id" SERIAL NOT NULL,
  "sku" TEXT NOT NULL,
  "categoriaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SkuCategoria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkuCategoria_sku_categoriaId_key" ON "SkuCategoria"("sku", "categoriaId");
CREATE INDEX "SkuCategoria_sku_idx" ON "SkuCategoria"("sku");
CREATE INDEX "SkuCategoria_nome_idx" ON "SkuCategoria"("nome");
