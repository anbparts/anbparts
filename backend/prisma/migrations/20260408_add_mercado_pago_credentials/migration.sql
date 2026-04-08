ALTER TABLE "MercadoLivreConfig"
ADD COLUMN "mercadoPagoClientId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mercadoPagoClientSecret" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mercadoPagoAccessToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mercadoPagoRefreshToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mercadoPagoConnectedAt" TIMESTAMP(3),
ADD COLUMN "mercadoPagoUserId" TEXT NOT NULL DEFAULT '';
