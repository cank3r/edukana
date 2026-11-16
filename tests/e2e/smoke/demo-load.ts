/**
 * Carga «Instituto Técnico Demo» (`scripts/demo/demo-seed.ts`) en la base efímera del recorrido en navegador
 * y deja en `smoke-artifacts/demo.json` los ids que necesita la galería (`demo-galeria.smoke.ts`).
 *
 * Solo corre sobre una base local de pruebas (igual que `seed.ts`), después de la semilla pequeña:
 *   EDUKANA_INTEGRATION_DB=1 DEMO_PASSWORD=… node --require ./tests/integration/stub-server-only.cjs --import tsx tests/e2e/smoke/demo-load.ts
 *
 * La contraseña llega por `DEMO_PASSWORD` (en CI es aleatoria por ejecución) y nunca se escribe ni se muestra.
 * No toca «Instituto Demo» ni «Colegio Nuevo Amanecer»: la demo usa otro identificador y correos @demo.edukana.do.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { ADMIN, COORDINATOR, GUARDIANS, TEACHERS } from "../../../scripts/demo/content";
import { createDemo, DEMO_SLUG } from "../../../scripts/demo/demo-seed";
import { SMOKE_DIR } from "./shared";
import { DEMO_GALLERY_FILE, type DemoGallery } from "./demo-shared";

const STUDENT_EMAIL = "ana.reyes@demo.edukana.do";
const AT_RISK_EMAIL = "yaritza.mejia@demo.edukana.do";
const TEACHER_COURSE = "Anatomía y Fisiología Básica";

function must<T>(what: string, value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error(`Demo: no se encontró ${what}.`);
  return value;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.EDUKANA_INTEGRATION_DB !== "1" || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("La carga de la demo para el recorrido solo corre con EDUKANA_INTEGRATION_DB=1 y una base local.");
  }
  const password = process.env.DEMO_PASSWORD?.trim() ?? "";
  if (password.length < 8) throw new Error("Falta DEMO_PASSWORD (al menos 8 caracteres).");

  const started = Date.now();
  const result = await createDemo({ password, log: (message) => console.log(`· ${message}`) });
  if (!result.created) throw new Error("«Instituto Técnico Demo» ya existía: la galería necesita una base recién migrada.");
  for (const warning of result.warnings) console.log(`Aviso: ${warning}`);
  console.log(`Demo cargada en ${Math.round((Date.now() - started) / 1000)} s.`);

  const institutionId = result.institutionId;
  const institution = must("la institución demo", await db.institution.findUnique({ where: { id: institutionId }, select: { slug: true, plan: true } }));
  if (institution.slug !== DEMO_SLUG) throw new Error("Demo: la institución creada no es la de demostración.");
  const subscription = await db.institutionSubscription.findUnique({ where: { institutionId }, select: { planCode: true, status: true } });
  if (subscription?.planCode !== "PRO" || subscription.status !== "ACTIVE") throw new Error("Demo: la institución no quedó con el plan PRO activo.");

  const user = async (email: string) =>
    must(`la cuenta ${email}`, await db.user.findFirst({ where: { institutionId, email }, select: { id: true } })).id;
  const studentId = await user(STUDENT_EMAIL);
  const atRiskId = await user(AT_RISK_EMAIL);
  const now = new Date();

  // Docente: su curso, la última práctica vencida con una entrega sin calificar y el examen con respuestas por revisar.
  const teacherCourse = must("el curso de la docente", await db.course.findFirst({ where: { institutionId, name: TEACHER_COURSE }, select: { id: true } }));
  const pendingSubmission = must("una entrega por calificar", await db.submission.findFirst({
    where: { institutionId, status: "SUBMITTED", assignment: { courseId: teacherCourse.id, dueDate: { lt: now } } },
    orderBy: [{ assignment: { dueDate: "desc" } }, { submittedAt: "desc" }],
    select: { id: true, assignmentId: true },
  }));
  const exam = must("el examen del curso", await db.exam.findFirst({ where: { institutionId, courseId: teacherCourse.id }, select: { id: true } }));

  // Estudiante: un curso suyo con lección de video, una tarea por entregar y un examen ya presentado.
  const enrollments = await db.enrollment.findMany({ where: { institutionId, studentId, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { courseId: true, status: true } });
  const activeCourses = enrollments.filter((row) => row.status === "ACTIVE").map((row) => row.courseId);
  const video = must("una lección con video", await db.lesson.findFirst({
    where: { institutionId, courseId: { in: activeCourses }, type: "VIDEO", isPublished: true, section: { isPublished: true } },
    orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
    select: { id: true, courseId: true },
  }));
  const homework = must("una tarea por entregar", await db.assignment.findFirst({
    where: { institutionId, courseId: { in: activeCourses }, isPublished: true, dueDate: { gt: now } },
    orderBy: { dueDate: "asc" },
    select: { id: true, courseId: true },
  }));
  const attempt = must("un examen presentado", await db.examAttempt.findFirst({
    where: { institutionId, studentId, status: { in: ["SUBMITTED", "GRADED"] }, exam: { courseId: { in: activeCourses } } },
    orderBy: { submittedAt: "desc" },
    select: { examId: true, exam: { select: { courseId: true } } },
  }));
  const catalogCourse = must("un curso del catálogo", await db.course.findFirst({ where: { institutionId, isPublic: true, isPublished: true }, orderBy: { name: "asc" }, select: { id: true } }));

  const operators = (process.env.PLATFORM_OPERATOR_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const gallery: DemoGallery = {
    institutionId,
    institutionSlug: institution.slug,
    accounts: {
      director: ADMIN.email,
      coordinator: COORDINATOR.email,
      teacher: TEACHERS.rosa.email,
      student: STUDENT_EMAIL,
      guardian: must("la tutora de Ana", GUARDIANS.find((guardian) => guardian.studentEmail === STUDENT_EMAIL)).email,
    },
    operatorEmail: operators[0] ?? null,
    atRiskStudentId: atRiskId,
    teacher: { courseId: teacherCourse.id, assignmentId: pendingSubmission.assignmentId, submissionId: pendingSubmission.id, examId: exam.id },
    student: {
      studentId,
      courseId: video.courseId,
      videoLessonId: video.id,
      homework: { courseId: homework.courseId, assignmentId: homework.id },
      examResult: { courseId: attempt.exam.courseId, examId: attempt.examId },
    },
    catalogCourseId: catalogCourse.id,
  };
  mkdirSync(join(process.cwd(), SMOKE_DIR), { recursive: true });
  writeFileSync(join(process.cwd(), DEMO_GALLERY_FILE), JSON.stringify(gallery, null, 2));
  console.log(`Galería: ids de la demo en ${DEMO_GALLERY_FILE} (sin contraseñas).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
