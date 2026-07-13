-- Origem da categoria: importada da Nuvemshop ou atribuida manualmente no sistema.
-- Categorias manuais (peças antigas já vendidas, ausentes da Nuvemshop) não são
-- sobrescritas pela sincronização automática.
ALTER TABLE "SkuCategoria" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'nuvemshop';
CREATE INDEX IF NOT EXISTS "SkuCategoria_origem_idx" ON "SkuCategoria"("origem");
