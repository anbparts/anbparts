CREATE TABLE "AppUserNotificationSetting" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUserNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppNotificationRead" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUserNotificationSetting_userId_type_key" ON "AppUserNotificationSetting"("userId", "type");
CREATE INDEX "AppUserNotificationSetting_type_idx" ON "AppUserNotificationSetting"("type");
CREATE UNIQUE INDEX "AppNotificationRead_username_type_itemKey_key" ON "AppNotificationRead"("username", "type", "itemKey");
CREATE INDEX "AppNotificationRead_username_type_idx" ON "AppNotificationRead"("username", "type");

ALTER TABLE "AppUserNotificationSetting" ADD CONSTRAINT "AppUserNotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
