ALTER TABLE "Peca"
ADD COLUMN "mercadoLivreLink" TEXT;

CREATE INDEX "Peca_mercadoLivreLink_idx" ON "Peca"("mercadoLivreLink");
