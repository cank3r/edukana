-- Additive announcement composer schema. Existing announcements remain readable during rollout.
ALTER TABLE "announcements" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "announcements" ADD COLUMN "audienceInstitution" BOOLEAN NOT NULL DEFAULT false;
UPDATE "announcements" SET "audienceInstitution" = true WHERE "audience" = 'ALL';

ALTER TABLE "storage_assets" ADD COLUMN "announcementId" TEXT;
ALTER TABLE "storage_assets" ADD COLUMN "confirmedAt" TIMESTAMP(3);
UPDATE "storage_assets" SET "confirmedAt" = "createdAt" WHERE "checksum" IS NOT NULL;

CREATE TABLE "organizational_units" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizational_unit_memberships" (
  "institutionId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizational_unit_memberships_pkey" PRIMARY KEY ("unitId", "userId")
);

CREATE TABLE "announcement_role_targets" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  CONSTRAINT "announcement_role_targets_pkey" PRIMARY KEY ("announcementId", "role")
);

CREATE TABLE "announcement_course_targets" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  CONSTRAINT "announcement_course_targets_pkey" PRIMARY KEY ("announcementId", "courseId")
);

CREATE TABLE "announcement_user_targets" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "announcement_user_targets_pkey" PRIMARY KEY ("announcementId", "userId")
);

CREATE TABLE "announcement_unit_targets" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  CONSTRAINT "announcement_unit_targets_pkey" PRIMARY KEY ("announcementId", "unitId")
);

CREATE TABLE "announcement_related_courses" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  CONSTRAINT "announcement_related_courses_pkey" PRIMARY KEY ("announcementId", "courseId")
);

CREATE TABLE "announcement_mentions" (
  "institutionId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "announcement_mentions_pkey" PRIMARY KEY ("announcementId", "userId")
);

-- Preserve legacy ROLE/COURSE targeting in normalized tables.
INSERT INTO "announcement_role_targets" ("institutionId", "announcementId", "role")
SELECT "institutionId", "id", "audienceId"::"Role" FROM "announcements"
WHERE "audience" = 'ROLE' AND "audienceId" IN ('SUPER_ADMIN','ADMIN','COORDINATOR','TEACHER','STUDENT','PARENT');

INSERT INTO "announcement_course_targets" ("institutionId", "announcementId", "courseId")
SELECT a."institutionId", a."id", c."id" FROM "announcements" a
JOIN "courses" c ON c."id" = a."audienceId" AND c."institutionId" = a."institutionId"
WHERE a."audience" = 'COURSE';

CREATE UNIQUE INDEX "organizational_units_institutionId_name_key" ON "organizational_units"("institutionId", "name");
CREATE INDEX "organizational_units_institutionId_parentId_idx" ON "organizational_units"("institutionId", "parentId");
CREATE INDEX "organizational_unit_memberships_institutionId_userId_idx" ON "organizational_unit_memberships"("institutionId", "userId");
CREATE INDEX "announcement_role_targets_institutionId_role_idx" ON "announcement_role_targets"("institutionId", "role");
CREATE INDEX "announcement_course_targets_institutionId_courseId_idx" ON "announcement_course_targets"("institutionId", "courseId");
CREATE INDEX "announcement_user_targets_institutionId_userId_idx" ON "announcement_user_targets"("institutionId", "userId");
CREATE INDEX "announcement_unit_targets_institutionId_unitId_idx" ON "announcement_unit_targets"("institutionId", "unitId");
CREATE INDEX "announcement_related_courses_institutionId_courseId_idx" ON "announcement_related_courses"("institutionId", "courseId");
CREATE INDEX "announcement_mentions_institutionId_userId_idx" ON "announcement_mentions"("institutionId", "userId");
CREATE INDEX "announcements_institutionId_publishedAt_idx" ON "announcements"("institutionId", "publishedAt");
CREATE INDEX "storage_assets_institutionId_announcementId_idx" ON "storage_assets"("institutionId", "announcementId");

ALTER TABLE "organizational_units" ADD CONSTRAINT "organizational_units_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizational_units" ADD CONSTRAINT "organizational_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "organizational_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizational_unit_memberships" ADD CONSTRAINT "organizational_unit_memberships_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizational_unit_memberships" ADD CONSTRAINT "organizational_unit_memberships_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizational_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizational_unit_memberships" ADD CONSTRAINT "organizational_unit_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_role_targets" ADD CONSTRAINT "announcement_role_targets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_role_targets" ADD CONSTRAINT "announcement_role_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_course_targets" ADD CONSTRAINT "announcement_course_targets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_course_targets" ADD CONSTRAINT "announcement_course_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_course_targets" ADD CONSTRAINT "announcement_course_targets_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_user_targets" ADD CONSTRAINT "announcement_user_targets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_user_targets" ADD CONSTRAINT "announcement_user_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_user_targets" ADD CONSTRAINT "announcement_user_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_unit_targets" ADD CONSTRAINT "announcement_unit_targets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_unit_targets" ADD CONSTRAINT "announcement_unit_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_unit_targets" ADD CONSTRAINT "announcement_unit_targets_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizational_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_related_courses" ADD CONSTRAINT "announcement_related_courses_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_related_courses" ADD CONSTRAINT "announcement_related_courses_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_related_courses" ADD CONSTRAINT "announcement_related_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_mentions" ADD CONSTRAINT "announcement_mentions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_mentions" ADD CONSTRAINT "announcement_mentions_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_mentions" ADD CONSTRAINT "announcement_mentions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
