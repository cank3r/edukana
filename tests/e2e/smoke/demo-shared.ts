import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SMOKE_DIR } from "./shared";

/** Ids de «Instituto Técnico Demo» que deja `demo-load.ts` para la galería de capturas. */
export const DEMO_GALLERY_FILE = `${SMOKE_DIR}/demo.json`;

export type DemoGallery = {
  institutionId: string;
  institutionSlug: string;
  accounts: { director: string; coordinator: string; teacher: string; student: string; guardian: string };
  /** Primer correo de `PLATFORM_OPERATOR_EMAILS` (cuenta de la semilla pequeña), si el job lo define. */
  operatorEmail: string | null;
  atRiskStudentId: string;
  teacher: { courseId: string; assignmentId: string; submissionId: string; examId: string };
  student: {
    studentId: string;
    courseId: string;
    videoLessonId: string;
    homework: { courseId: string; assignmentId: string };
    examResult: { courseId: string; examId: string };
  };
  catalogCourseId: string;
};

/** La galería solo corre si la demo se cargó en esta base (en CI, el job la carga antes del recorrido). */
export function loadDemoGallery(): DemoGallery | null {
  const file = join(process.cwd(), DEMO_GALLERY_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as DemoGallery) : null;
}
