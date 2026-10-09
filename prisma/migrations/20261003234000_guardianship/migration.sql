CREATE TYPE "GuardianshipRelationship" AS ENUM ('MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER');
CREATE TYPE "GuardianshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TABLE "guardianships" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationship" "GuardianshipRelationship" NOT NULL,
    "status" "GuardianshipStatus" NOT NULL DEFAULT 'PENDING',
    "canViewAcademics" BOOLEAN NOT NULL DEFAULT false,
    "canViewAttendance" BOOLEAN NOT NULL DEFAULT false,
    "canViewSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canViewAnnouncements" BOOLEAN NOT NULL DEFAULT false,
    "canViewFinance" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "guardianships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardianships_institutionId_parentId_studentId_key"
ON "guardianships"("institutionId", "parentId", "studentId");
CREATE INDEX "guardianships_institutionId_parentId_status_idx"
ON "guardianships"("institutionId", "parentId", "status");
CREATE INDEX "guardianships_institutionId_studentId_status_idx"
ON "guardianships"("institutionId", "studentId", "status");

ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
