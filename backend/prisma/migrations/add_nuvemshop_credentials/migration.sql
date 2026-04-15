ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "nuvemshopAppId"        TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "nuvemshopClientSecret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "nuvemshopAccessToken"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "nuvemshopStoreId"      TEXT NOT NULL DEFAULT '';
