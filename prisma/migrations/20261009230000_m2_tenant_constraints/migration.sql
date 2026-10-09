-- M2 tenant constraints (aditiva): valida datos existentes y convierte las relaciones
-- críticas a claves foráneas compuestas por institutionId. No modifica las migraciones
-- históricas ya aplicadas y no activa RLS hasta que el runtime establezca app.institution_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "courses" c
    JOIN "academic_periods" p ON p."id" = c."periodId"
    JOIN "users" t ON t."id" = c."teacherId"
    WHERE c."institutionId" <> p."institutionId"
       OR c."institutionId" <> t."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: curso relacionado con período o docente de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "enrollments" e
    JOIN "courses" c ON c."id" = e."courseId"
    JOIN "users" s ON s."id" = e."studentId"
    WHERE e."institutionId" IS NULL
       OR e."institutionId" <> c."institutionId"
       OR e."institutionId" <> s."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: matrícula sin institución o con relaciones cruzadas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "program_courses" pc
    JOIN "programs" p ON p."id" = pc."programId"
    JOIN "courses" c ON c."id" = pc."courseId"
    WHERE pc."institutionId" <> p."institutionId"
       OR pc."institutionId" <> c."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: programa y curso pertenecen a instituciones distintas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "student_groups" g
    JOIN "programs" p ON p."id" = g."programId"
    WHERE g."programId" IS NOT NULL AND g."institutionId" <> p."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: grupo relacionado con programa de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "student_group_members" gm
    JOIN "student_groups" g ON g."id" = gm."groupId"
    JOIN "users" u ON u."id" = gm."userId"
    WHERE gm."institutionId" <> g."institutionId"
       OR gm."institutionId" <> u."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: miembro relacionado con grupo o usuario de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "student_group_courses" gc
    JOIN "student_groups" g ON g."id" = gc."groupId"
    JOIN "courses" c ON c."id" = gc."courseId"
    WHERE gc."institutionId" <> g."institutionId"
       OR gc."institutionId" <> c."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: grupo relacionado con curso de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "live_classes" l
    JOIN "courses" c ON c."id" = l."courseId"
    JOIN "users" u ON u."id" = l."createdById"
    WHERE l."institutionId" <> c."institutionId"
       OR l."institutionId" <> u."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: clase relacionada con curso o creador de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "payments" p
    JOIN "payment_concepts" pc ON pc."id" = p."conceptId"
    JOIN "users" u ON u."id" = p."recordedById"
    WHERE p."institutionId" <> pc."institutionId"
       OR p."institutionId" <> u."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: pago relacionado con concepto o registrador de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "notifications" n
    JOIN "users" u ON u."id" = n."userId"
    WHERE n."institutionId" <> u."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: notificación relacionada con usuario de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "course_orders" o
    JOIN "courses" c ON c."id" = o."courseId"
    JOIN "users" u ON u."id" = o."buyerId"
    LEFT JOIN "coupons" cp ON cp."id" = o."couponId"
    WHERE o."institutionId" <> c."institutionId"
       OR o."institutionId" <> u."institutionId"
       OR (o."couponId" IS NOT NULL AND o."institutionId" <> cp."institutionId")
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: orden relacionada con curso, comprador o cupón de otra institución';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "course_reviews" r
    JOIN "courses" c ON c."id" = r."courseId"
    JOIN "users" u ON u."id" = r."userId"
    WHERE r."institutionId" <> c."institutionId"
       OR r."institutionId" <> u."institutionId"
  ) THEN
    RAISE EXCEPTION 'm2_tenant_constraints: reseña relacionada con curso o usuario de otra institución';
  END IF;
END $$;

ALTER TABLE "enrollments" ALTER COLUMN "institutionId" SET NOT NULL;

CREATE UNIQUE INDEX "users_institutionId_id_key" ON "users"("institutionId", "id");
CREATE UNIQUE INDEX "academic_periods_institutionId_id_key" ON "academic_periods"("institutionId", "id");
CREATE UNIQUE INDEX "courses_institutionId_id_key" ON "courses"("institutionId", "id");
CREATE UNIQUE INDEX "programs_institutionId_id_key" ON "programs"("institutionId", "id");
CREATE UNIQUE INDEX "student_groups_institutionId_id_key" ON "student_groups"("institutionId", "id");
CREATE UNIQUE INDEX "payment_concepts_institutionId_id_key" ON "payment_concepts"("institutionId", "id");
CREATE UNIQUE INDEX "coupons_institutionId_id_key" ON "coupons"("institutionId", "id");

ALTER TABLE "courses" DROP CONSTRAINT "courses_periodId_fkey";
ALTER TABLE "courses" DROP CONSTRAINT "courses_teacherId_fkey";
ALTER TABLE "courses" ADD CONSTRAINT "courses_institutionId_periodId_fkey"
  FOREIGN KEY ("institutionId", "periodId") REFERENCES "academic_periods"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_institutionId_teacherId_fkey"
  FOREIGN KEY ("institutionId", "teacherId") REFERENCES "users"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_studentId_fkey";
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_courseId_fkey";
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institutionId_studentId_fkey"
  FOREIGN KEY ("institutionId", "studentId") REFERENCES "users"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_courses" DROP CONSTRAINT "program_courses_programId_fkey";
ALTER TABLE "program_courses" DROP CONSTRAINT "program_courses_courseId_fkey";
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_institutionId_programId_fkey"
  FOREIGN KEY ("institutionId", "programId") REFERENCES "programs"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_groups" DROP CONSTRAINT "student_groups_programId_fkey";
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_institutionId_programId_fkey"
  FOREIGN KEY ("institutionId", "programId") REFERENCES "programs"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_group_members" DROP CONSTRAINT "student_group_members_groupId_fkey";
ALTER TABLE "student_group_members" DROP CONSTRAINT "student_group_members_userId_fkey";
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_institutionId_groupId_fkey"
  FOREIGN KEY ("institutionId", "groupId") REFERENCES "student_groups"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_institutionId_userId_fkey"
  FOREIGN KEY ("institutionId", "userId") REFERENCES "users"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_group_courses" DROP CONSTRAINT "student_group_courses_groupId_fkey";
ALTER TABLE "student_group_courses" DROP CONSTRAINT "student_group_courses_courseId_fkey";
ALTER TABLE "student_group_courses" ADD CONSTRAINT "student_group_courses_institutionId_groupId_fkey"
  FOREIGN KEY ("institutionId", "groupId") REFERENCES "student_groups"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_group_courses" ADD CONSTRAINT "student_group_courses_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_classes" DROP CONSTRAINT "live_classes_courseId_fkey";
ALTER TABLE "live_classes" DROP CONSTRAINT "live_classes_createdById_fkey";
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_institutionId_createdById_fkey"
  FOREIGN KEY ("institutionId", "createdById") REFERENCES "users"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT "payments_conceptId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_recordedById_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_institutionId_conceptId_fkey"
  FOREIGN KEY ("institutionId", "conceptId") REFERENCES "payment_concepts"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_institutionId_recordedById_fkey"
  FOREIGN KEY ("institutionId", "recordedById") REFERENCES "users"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institutionId_userId_fkey"
  FOREIGN KEY ("institutionId", "userId") REFERENCES "users"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_orders" DROP CONSTRAINT "course_orders_courseId_fkey";
ALTER TABLE "course_orders" DROP CONSTRAINT "course_orders_buyerId_fkey";
ALTER TABLE "course_orders" DROP CONSTRAINT "course_orders_couponId_fkey";
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_institutionId_buyerId_fkey"
  FOREIGN KEY ("institutionId", "buyerId") REFERENCES "users"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_institutionId_couponId_fkey"
  FOREIGN KEY ("institutionId", "couponId") REFERENCES "coupons"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_courseId_fkey";
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_userId_fkey";
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_institutionId_courseId_fkey"
  FOREIGN KEY ("institutionId", "courseId") REFERENCES "courses"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_institutionId_userId_fkey"
  FOREIGN KEY ("institutionId", "userId") REFERENCES "users"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
