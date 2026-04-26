ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveClientId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveClientSecret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveAccessToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveRefreshToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveTokenExpiry" TIMESTAMP(3);
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveRootFolderId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConfiguracaoGeral" ADD COLUMN IF NOT EXISTS "googleDriveMotoDirs" JSONB NOT NULL DEFAULT '{}';
