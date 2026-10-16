CREATE TYPE "PlatformAnnouncementLevel" AS ENUM ('INFO', 'WARNING');
CREATE TYPE "PlatformAnnouncementAudience" AS ENUM ('ALL', 'ADMINS', 'INDEPENDENT');
CREATE TABLE "platform_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" "PlatformAnnouncementLevel" NOT NULL DEFAULT 'INFO',
    "audience" "PlatformAnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_announcements_startsAt_endsAt_idx" ON "platform_announcements"("startsAt", "endsAt");
