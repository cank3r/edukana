CREATE TYPE "InstitutionSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');
CREATE TABLE "platform_plans" (
 "code" "Plan" NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "priceCents" INTEGER NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'DOP', "maxStudents" INTEGER, "maxStorageMb" INTEGER,
 "aiRequestsPerMonth" INTEGER, "features" JSONB NOT NULL DEFAULT '{}', "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "institution_subscriptions" (
 "id" TEXT NOT NULL PRIMARY KEY, "institutionId" TEXT NOT NULL, "planCode" "Plan" NOT NULL,
 "status" "InstitutionSubscriptionStatus" NOT NULL DEFAULT 'TRIAL', "currentPeriodStart" TIMESTAMP(3) NOT NULL,
 "currentPeriodEnd" TIMESTAMP(3) NOT NULL, "trialEndsAt" TIMESTAMP(3), "priceCents" INTEGER NOT NULL,
 "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "institution_subscriptions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "institution_subscriptions_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "platform_plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "institution_subscriptions_institutionId_key" ON "institution_subscriptions"("institutionId");
CREATE INDEX "institution_subscriptions_status_currentPeriodEnd_idx" ON "institution_subscriptions"("status", "currentPeriodEnd");
CREATE TABLE "platform_invoices" (
 "id" TEXT NOT NULL PRIMARY KEY, "institutionId" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL,
 "periodEnd" TIMESTAMP(3) NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'DOP',
 "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'OPEN', "dueDate" TIMESTAMP(3) NOT NULL,
 "paidAt" TIMESTAMP(3), "paymentMethod" TEXT, "reference" TEXT, "recordedBy" TEXT NOT NULL,
 "provider" TEXT, "providerRef" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "platform_invoices_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "platform_invoices_institutionId_status_idx" ON "platform_invoices"("institutionId", "status");
CREATE INDEX "platform_invoices_status_dueDate_idx" ON "platform_invoices"("status", "dueDate");
