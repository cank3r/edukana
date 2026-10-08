-- S1 · Seguridad e historia académica (aditiva).
-- Todo lo que agrega esta migración es compatible con el código anterior:
-- columnas nuevas opcionales o con valor por defecto, tablas nuevas e índices.
-- Las columnas "institutionId" pasan a NOT NULL en una migración posterior
-- (s1_security_enforce), después de desplegar el código que las escribe.

-- 0. Guardas: detener si los datos violan el aislamiento que se va a materializar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "enrollments" e
    JOIN "users" u ON u."id" = e."studentId"
    JOIN "courses" c ON c."id" = e."courseId"
    WHERE u."institutionId" <> c."institutionId"
  ) THEN
    RAISE EXCEPTION 's1_security: hay matrículas cuyo estudiante y curso pertenecen a instituciones distintas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "submissions" s
    JOIN "assignments" a ON a."id" = s."assignmentId"
    JOIN "courses" c ON c."id" = a."courseId"
    JOIN "users" u ON u."id" = s."studentId"
    WHERE u."institutionId" <> c."institutionId"
  ) THEN
    RAISE EXCEPTION 's1_security: hay entregas cuyo estudiante y tarea pertenecen a instituciones distintas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "exam_questions" q
    JOIN "exams" e ON e."id" = q."examId"
    JOIN "question_bank_items" b ON b."id" = q."bankItemId"
    WHERE e."institutionId" <> b."institutionId"
  ) THEN
    RAISE EXCEPTION 's1_security: hay exámenes con preguntas del banco de otra institución';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "payment_concepts" p
    WHERE p."studentId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "users" u WHERE u."id" = p."studentId" AND u."institutionId" = p."institutionId"
      )
  ) THEN
    RAISE EXCEPTION 's1_security: hay cobros cuyo studentId no existe o pertenece a otra institución';
  END IF;
END $$;

-- 1. Sesión viva.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. Límite de intentos y recuperación de contraseña.
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_attempts_emailHash_createdAt_idx" ON "login_attempts"("emailHash", "createdAt");
CREATE INDEX "login_attempts_ipHash_createdAt_idx" ON "login_attempts"("ipHash", "createdAt");

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Examen con tiempo autoritativo e instantánea de preguntas.
ALTER TABLE "exam_attempts" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "exam_questions" ADD COLUMN "snapshot" JSONB;
UPDATE "exam_questions" q
SET "snapshot" = jsonb_build_object(
  'type', b."type",
  'prompt', b."prompt",
  'options', b."options",
  'answerKey', b."answerKey",
  'points', q."points"
)
FROM "question_bank_items" b
WHERE b."id" = q."bankItemId";

-- 4. institutionId físico (opcional por ahora) con backfill desde la relación.
ALTER TABLE "enrollments" ADD COLUMN "institutionId" TEXT;
UPDATE "enrollments" e SET "institutionId" = c."institutionId" FROM "courses" c WHERE c."id" = e."courseId";

ALTER TABLE "assignments" ADD COLUMN "institutionId" TEXT;
UPDATE "assignments" a SET "institutionId" = c."institutionId" FROM "courses" c WHERE c."id" = a."courseId";

ALTER TABLE "submissions" ADD COLUMN "institutionId" TEXT;
UPDATE "submissions" s SET "institutionId" = a."institutionId" FROM "assignments" a WHERE a."id" = s."assignmentId";

ALTER TABLE "exam_questions" ADD COLUMN "institutionId" TEXT;
UPDATE "exam_questions" q SET "institutionId" = e."institutionId" FROM "exams" e WHERE e."id" = q."examId";

ALTER TABLE "exam_answers" ADD COLUMN "institutionId" TEXT;
UPDATE "exam_answers" x SET "institutionId" = t."institutionId" FROM "exam_attempts" t WHERE t."id" = x."attemptId";

CREATE INDEX "enrollments_institutionId_courseId_idx" ON "enrollments"("institutionId", "courseId");
CREATE INDEX "assignments_institutionId_courseId_idx" ON "assignments"("institutionId", "courseId");
CREATE INDEX "submissions_institutionId_assignmentId_idx" ON "submissions"("institutionId", "assignmentId");
CREATE INDEX "exam_questions_institutionId_examId_idx" ON "exam_questions"("institutionId", "examId");
CREATE INDEX "exam_answers_institutionId_attemptId_idx" ON "exam_answers"("institutionId", "attemptId");

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Historia de entregas y de notas.
CREATE TABLE "submission_revisions" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "content" TEXT,
    "assetIds" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "submission_revisions_institutionId_submissionId_idx" ON "submission_revisions"("institutionId", "submissionId");
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "grade_entry_revisions" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "gradeEntryId" TEXT NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "newScore" DOUBLE PRECISION,
    "previousFeedback" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_entry_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "grade_entry_revisions_institutionId_gradeEntryId_idx" ON "grade_entry_revisions"("institutionId", "gradeEntryId");
ALTER TABLE "grade_entry_revisions" ADD CONSTRAINT "grade_entry_revisions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_entry_revisions" ADD CONSTRAINT "grade_entry_revisions_gradeEntryId_fkey" FOREIGN KEY ("gradeEntryId") REFERENCES "grade_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_entry_revisions" ADD CONSTRAINT "grade_entry_revisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Dinero en centavos e integridad de cobros. "amount" se conserva en lectura dual.
ALTER TABLE "payment_concepts" ADD COLUMN "amountCents" INTEGER;
UPDATE "payment_concepts" SET "amountCents" = ROUND(("amount" * 100)::numeric)::integer;
CREATE INDEX "payment_concepts_institutionId_status_idx" ON "payment_concepts"("institutionId", "status");
CREATE INDEX "payment_concepts_institutionId_studentId_idx" ON "payment_concepts"("institutionId", "studentId");
ALTER TABLE "payment_concepts" ADD CONSTRAINT "payment_concepts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Índices por institución que faltaban.
CREATE INDEX "audit_logs_institutionId_createdAt_idx" ON "audit_logs"("institutionId", "createdAt");
CREATE INDEX "admission_leads_institutionId_stage_idx" ON "admission_leads"("institutionId", "stage");
CREATE INDEX "calendar_events_institutionId_startDate_idx" ON "calendar_events"("institutionId", "startDate");

-- 8. Un aviso sin audiencia explícita ya no queda visible para toda la institución.
ALTER TABLE "announcements" ALTER COLUMN "audience" SET DEFAULT 'ROLE';
