CREATE TABLE IF NOT EXISTS "ShopeeConfig" (
    "id" SERIAL NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "shopId" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeConfig_pkey" PRIMARY KEY ("id")
);
