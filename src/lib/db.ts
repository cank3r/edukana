import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Raw Prisma query/error logs can include personal data or secrets from arguments.
    // Services report operational failures using explicit, sanitized diagnostics instead.
    log: [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
