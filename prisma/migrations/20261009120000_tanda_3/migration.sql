-- Tanda 3 (aditiva): tabla de pagos, notificaciones, venta de cursos (órdenes, cupones, reseñas)
-- y campos sueltos pendientes: imagen/precio/visibilidad del curso, nota para aprobar,
-- enlaces en versiones de entregas, vínculo solicitud→persona y color de marca.

ALTER TABLE "institutions" ADD COLUMN "brandColor" TEXT;

ALTER TABLE "courses" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "courses" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "courses" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "courses" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'DOP';

ALTER TABLE "exams" ADD COLUMN "passingPercent" INTEGER;

ALTER TABLE "admission_leads" ADD COLUMN "convertedUserId" TEXT;
ALTER TABLE "admission_leads" ADD COLUMN "convertedAt" TIMESTAMP(3);

ALTER TABLE "submission_revisions" ADD COLUMN "fileUrls" JSONB;

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_orders" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "couponId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DOP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_reviews" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_institutionId_conceptId_idx" ON "payments"("institutionId", "conceptId");
CREATE INDEX "payments_institutionId_paidOn_idx" ON "payments"("institutionId", "paidOn");
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
CREATE INDEX "notifications_institutionId_createdAt_idx" ON "notifications"("institutionId", "createdAt");
CREATE UNIQUE INDEX "coupons_institutionId_code_key" ON "coupons"("institutionId", "code");
CREATE INDEX "course_orders_institutionId_status_idx" ON "course_orders"("institutionId", "status");
CREATE INDEX "course_orders_courseId_buyerId_idx" ON "course_orders"("courseId", "buyerId");
CREATE UNIQUE INDEX "course_reviews_courseId_userId_key" ON "course_reviews"("courseId", "userId");
CREATE INDEX "course_reviews_institutionId_courseId_idx" ON "course_reviews"("institutionId", "courseId");

ALTER TABLE "payments" ADD CONSTRAINT "payments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "payment_concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
