CREATE TABLE "role_capability_overrides" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "capability" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_capability_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_capability_overrides_institutionId_role_capability_key"
ON "role_capability_overrides"("institutionId", "role", "capability");

CREATE INDEX "role_capability_overrides_institutionId_role_idx"
ON "role_capability_overrides"("institutionId", "role");

ALTER TABLE "role_capability_overrides"
ADD CONSTRAINT "role_capability_overrides_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_capability_overrides"
ADD CONSTRAINT "role_capability_overrides_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
