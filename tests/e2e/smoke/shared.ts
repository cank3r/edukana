import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Carpeta con todo lo que el recorrido deja como evidencia (capturas, informe, ids de la semilla). */
export const SMOKE_DIR = "smoke-artifacts";
export const SMOKE_SEED_FILE = `${SMOKE_DIR}/seed.json`;

/** Contraseña de prueba, igual para todas las cuentas de la semilla. Solo existe en bases locales de CI. */
export const SMOKE_PASSWORD = "RecorridoDemo2026";
export const SMOKE_ACCOUNTS = {
  admin: "admin@instituto-demo.test",
  teacher: "docente@instituto-demo.test",
  student1: "ana@instituto-demo.test",
  student2: "pedro@instituto-demo.test",
} as const;

export type SmokeSeed = {
  institutionId: string;
  courseId: string;
  lessonIds: string[];
  assignmentId: string;
  examId: string;
  questionIds: string[];
  programId: string;
  groupId: string;
  announcementId: string;
  studentIds: string[];
};

export function loadSeed(): SmokeSeed {
  return JSON.parse(readFileSync(join(process.cwd(), SMOKE_SEED_FILE), "utf8")) as SmokeSeed;
}

/** Día del calendario de la institución de la semilla, `offset` días después de hoy (AAAA-MM-DD). */
export function demoDayKey(offset: number) {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
