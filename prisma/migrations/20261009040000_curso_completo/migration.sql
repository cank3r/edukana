-- Curso completo (aditiva): publicar/archivar cursos, retiro con motivo,
-- programas, grupos de estudiantes y clases en vivo con enlace externo.

ALTER TABLE "courses" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "courses" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "enrollments" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN "withdrawReason" TEXT;

CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_courses" (
    "institutionId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "program_courses_pkey" PRIMARY KEY ("programId","courseId")
);

CREATE TABLE "student_groups" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_group_members" (
    "institutionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_group_members_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE "student_group_courses" (
    "institutionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "student_group_courses_pkey" PRIMARY KEY ("groupId","courseId")
);

CREATE TABLE "live_classes" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "joinUrl" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "programs_institutionId_name_key" ON "programs"("institutionId", "name");
CREATE INDEX "program_courses_institutionId_idx" ON "program_courses"("institutionId");
CREATE UNIQUE INDEX "student_groups_institutionId_name_key" ON "student_groups"("institutionId", "name");
CREATE INDEX "student_group_members_institutionId_userId_idx" ON "student_group_members"("institutionId", "userId");
CREATE INDEX "student_group_courses_institutionId_idx" ON "student_group_courses"("institutionId");
CREATE INDEX "live_classes_institutionId_startsAt_idx" ON "live_classes"("institutionId", "startsAt");
CREATE INDEX "live_classes_courseId_startsAt_idx" ON "live_classes"("courseId", "startsAt");

ALTER TABLE "programs" ADD CONSTRAINT "programs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "student_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_group_courses" ADD CONSTRAINT "student_group_courses_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "student_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_group_courses" ADD CONSTRAINT "student_group_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
