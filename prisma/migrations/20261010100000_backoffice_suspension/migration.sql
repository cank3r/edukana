-- Additive only: existing institutions remain active and all memberships are preserved.
CREATE TYPE "InstitutionStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TABLE "institutions"
  ADD COLUMN "status" "InstitutionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT;
