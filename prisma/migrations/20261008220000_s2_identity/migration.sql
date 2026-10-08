-- S2 · Identidad global (aditiva).
-- Una "identity" es la cuenta de una persona en toda la plataforma: correo único, contraseña y
-- versión de sesión. Cada fila de "users" pasa a ser su pertenencia a una institución.
-- Ninguna relación existente cambia: todo sigue apuntando a "users".

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" GROUP BY "institutionId", lower("email") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 's2_identity: hay correos repetidos dentro de una misma institución (difieren solo en mayúsculas)';
  END IF;
END $$;

CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "identities_email_key" ON "identities"("email");

-- Una identidad por correo. La contraseña solo se hereda cuando el correo pertenece a una única
-- cuenta: si aparece en varias instituciones, la identidad nace sin contraseña y la persona la
-- define con el enlace de recuperación. Así nadie elige una contraseña por ella.
INSERT INTO "identities" ("id", "email", "passwordHash", "sessionVersion", "status", "updatedAt")
SELECT
  'idn_' || md5(lower("email")),
  lower("email"),
  CASE WHEN count(*) = 1 THEN max("password") END,
  CASE WHEN count(*) = 1 THEN max("sessionVersion") ELSE 0 END,
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM "users"
GROUP BY lower("email");

ALTER TABLE "users" ADD COLUMN "identityId" TEXT;
UPDATE "users" SET "identityId" = 'idn_' || md5(lower("email"));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "identityId" IS NULL) THEN
    RAISE EXCEPTION 's2_identity: quedaron cuentas sin identidad';
  END IF;
END $$;

CREATE INDEX "users_identityId_idx" ON "users"("identityId");
CREATE UNIQUE INDEX "users_institutionId_identityId_key" ON "users"("institutionId", "identityId");
ALTER TABLE "users" ADD CONSTRAINT "users_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
