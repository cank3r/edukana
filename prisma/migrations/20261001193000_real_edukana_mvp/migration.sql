-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('TEXT', 'VIDEO', 'DOCUMENT', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('DOCUMENT', 'VIDEO', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetVisibility" AS ENUM ('COURSE', 'PRIVATE', 'INSTITUTION');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "completionThreshold" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "courseId" TEXT NOT NULL,
ADD COLUMN     "institutionId" TEXT NOT NULL,
ADD COLUMN     "sessionId" TEXT NOT NULL,
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "allowLate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "type" "LessonType" NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 10,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_periods" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "grading_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_categories" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "gradingPeriodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "dropLowest" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grade_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_items" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "gradingPeriodId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "examId" TEXT,
    "title" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "grade_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_entries" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "gradeItemId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "isExcused" BOOLEAN NOT NULL DEFAULT false,
    "gradedById" TEXT NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "answerKey" TEXT NOT NULL,
    "explanation" TEXT,
    "defaultPoints" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "showReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "bankItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "bankItemId" TEXT NOT NULL,
    "response" TEXT,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "classroom" TEXT NOT NULL,
    "startsOn" DATE,
    "endsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_assets" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT,
    "lessonId" TEXT,
    "assignmentId" TEXT,
    "submissionId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'edukana',
    "objectPath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "visibility" "AssetVisibility" NOT NULL DEFAULT 'COURSE',
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "verificationHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_sections_institutionId_courseId_idx" ON "course_sections"("institutionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_sections_courseId_order_key" ON "course_sections"("courseId", "order");

-- CreateIndex
CREATE INDEX "lessons_institutionId_courseId_idx" ON "lessons"("institutionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_sectionId_order_key" ON "lessons"("sectionId", "order");

-- CreateIndex
CREATE INDEX "attendance_sessions_institutionId_date_idx" ON "attendance_sessions"("institutionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_courseId_date_key" ON "attendance_sessions"("courseId", "date");

-- CreateIndex
CREATE INDEX "grading_periods_institutionId_courseId_idx" ON "grading_periods"("institutionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "grading_periods_courseId_name_key" ON "grading_periods"("courseId", "name");

-- CreateIndex
CREATE INDEX "grade_categories_institutionId_courseId_idx" ON "grade_categories"("institutionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "grade_categories_gradingPeriodId_name_key" ON "grade_categories"("gradingPeriodId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_items_assignmentId_key" ON "grade_items"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "grade_items_examId_key" ON "grade_items"("examId");

-- CreateIndex
CREATE INDEX "grade_items_institutionId_courseId_idx" ON "grade_items"("institutionId", "courseId");

-- CreateIndex
CREATE INDEX "grade_entries_institutionId_enrollmentId_idx" ON "grade_entries"("institutionId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "grade_entries_gradeItemId_enrollmentId_key" ON "grade_entries"("gradeItemId", "enrollmentId");

-- CreateIndex
CREATE INDEX "question_bank_items_institutionId_courseId_type_idx" ON "question_bank_items"("institutionId", "courseId", "type");

-- CreateIndex
CREATE INDEX "exams_institutionId_courseId_idx" ON "exams"("institutionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_bankItemId_key" ON "exam_questions"("examId", "bankItemId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_order_key" ON "exam_questions"("examId", "order");

-- CreateIndex
CREATE INDEX "exam_attempts_institutionId_examId_idx" ON "exam_attempts"("institutionId", "examId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_examId_studentId_attemptNumber_key" ON "exam_attempts"("examId", "studentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attemptId_bankItemId_key" ON "exam_answers"("attemptId", "bankItemId");

-- CreateIndex
CREATE INDEX "schedule_slots_institutionId_weekday_startMinutes_idx" ON "schedule_slots"("institutionId", "weekday", "startMinutes");

-- CreateIndex
CREATE INDEX "schedule_slots_teacherId_weekday_idx" ON "schedule_slots"("teacherId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "storage_assets_objectPath_key" ON "storage_assets"("objectPath");

-- CreateIndex
CREATE INDEX "storage_assets_institutionId_courseId_idx" ON "storage_assets"("institutionId", "courseId");

-- CreateIndex
CREATE INDEX "lesson_progress_institutionId_lessonId_idx" ON "lesson_progress"("institutionId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_enrollmentId_lessonId_key" ON "lesson_progress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verificationCode_key" ON "certificates"("verificationCode");

-- CreateIndex
CREATE INDEX "certificates_institutionId_issuedAt_idx" ON "certificates"("institutionId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_enrollmentId_courseId_key" ON "certificates"("enrollmentId", "courseId");

-- CreateIndex
CREATE INDEX "users_institutionId_role_idx" ON "users"("institutionId", "role");

-- CreateIndex
CREATE INDEX "academic_periods_institutionId_startDate_idx" ON "academic_periods"("institutionId", "startDate");

-- CreateIndex
CREATE INDEX "courses_institutionId_teacherId_idx" ON "courses"("institutionId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_institutionId_code_key" ON "courses"("institutionId", "code");

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");

-- CreateIndex
CREATE INDEX "attendances_institutionId_courseId_date_idx" ON "attendances"("institutionId", "courseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_sessionId_enrollmentId_key" ON "attendances"("sessionId", "enrollmentId");

-- CreateIndex
CREATE INDEX "assignments_courseId_dueDate_idx" ON "assignments"("courseId", "dueDate");

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_gradingPeriodId_fkey" FOREIGN KEY ("gradingPeriodId") REFERENCES "grading_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_gradingPeriodId_fkey" FOREIGN KEY ("gradingPeriodId") REFERENCES "grading_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "grade_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_gradeItemId_fkey" FOREIGN KEY ("gradeItemId") REFERENCES "grade_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "question_bank_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "question_bank_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_assets" ADD CONSTRAINT "storage_assets_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ProvisionSupabaseStorage
-- Creates or hardens the private bucket when the database exposes Supabase's storage schema.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'edukana',
            'edukana',
            false,
            104857600,
            ARRAY[
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'text/plain',
                'video/mp4',
                'video/webm'
            ]::text[]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
END $$;
