-- Campos pra guardar o anuncio Shopee de cada peca (mesmo padrao do mercadoLivreItemId/mercadoLivreLink)
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "shopeeItemId" TEXT;
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "shopeeLink" TEXT;
ALTER TABLE "Peca" ADD COLUMN IF NOT EXISTS "shopeeCategoriaId" TEXT;

-- Config da loja Shopee dentro do Bling (mesmo padrao do nuvemshopLojaId)
ALTER TABLE "BlingConfig" ADD COLUMN IF NOT EXISTS "shopeeAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlingConfig" ADD COLUMN IF NOT EXISTS "shopeeLojaId" INTEGER;
