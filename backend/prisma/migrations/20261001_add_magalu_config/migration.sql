CREATE TABLE IF NOT EXISTS "MagaluConfig" (
    "id" SERIAL PRIMARY KEY,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL
);
