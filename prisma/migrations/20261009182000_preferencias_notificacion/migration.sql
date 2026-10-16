-- Preferencias de notificación por correo (aditiva: solo crea una tabla nueva).
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_preferences_institutionId_idx" ON "notification_preferences"("institutionId");

CREATE UNIQUE INDEX "notification_preferences_userId_kind_key" ON "notification_preferences"("userId", "kind");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
