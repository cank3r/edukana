import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

/** IDs fijos de `seed.sql`. `a` y `b` son dos instituciones con la misma forma. */
export function fixture(prefix: "a" | "b") {
  const id = (name: string) => `${prefix}_${name}`;
  return {
    institutionId: id("inst"),
    admin: { id: id("admin"), institutionId: id("inst"), role: "ADMIN" as const },
    coordinator: { id: id("coord"), institutionId: id("inst"), role: "COORDINATOR" as const },
    teacher: { id: id("teacher"), institutionId: id("inst"), role: "TEACHER" as const },
    teacher2: { id: id("teacher2"), institutionId: id("inst"), role: "TEACHER" as const },
    student: { id: id("student"), institutionId: id("inst"), role: "STUDENT" as const },
    student2: { id: id("student2"), institutionId: id("inst"), role: "STUDENT" as const },
    parent: { id: id("parent"), institutionId: id("inst"), role: "PARENT" as const },
    courseId: id("course"),
    course2Id: id("course2"),
    announcementId: id("announcement"),
    guardianshipId: id("guardianship"),
  };
}

export const A = fixture("a");
export const B = fixture("b");

/**
 * Carga la semilla una sola vez sobre una base recién migrada.
 * Se niega a ejecutarse fuera de una base de pruebas explícita.
 */
export async function ensureSeed() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.EDUKANA_INTEGRATION_DB !== "1" || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Las pruebas de integración solo corren con EDUKANA_INTEGRATION_DB=1 y una base local.");
  }
  if (await db.institution.count({ where: { id: A.institutionId } })) return;
  const sql = readFileSync(join(process.cwd(), "tests/integration/seed.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, ""))
    .filter(Boolean);
  await db.$transaction(statements.map((statement) => db.$executeRawUnsafe(statement)));
}
