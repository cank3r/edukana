import { db } from "@/lib/db";
import { liveClassSelect, liveClassWindow, safeTimezone, toHomeLiveClasses, type HomeActor, type HomeLiveClass } from "@/server/student-home";

export type TeacherCourse = {
  courseId: string;
  name: string;
  code: string | null;
  isPublished: boolean;
  students: number;
  /** Entregas recibidas que esperan nota. */
  toGrade: number;
};

/** Examen con intentos cuyas respuestas cortas esperan revisión del docente. */
export type TeacherExamReview = { courseId: string; courseName: string; examId: string; examTitle: string; attempts: number };

export type TeacherHome = {
  timezone: string;
  courses: TeacherCourse[];
  /** Solo los cursos con entregas por calificar. */
  toGrade: TeacherCourse[];
  toGradeTotal: number;
  /** Exámenes con respuestas cortas por revisar (intentos entregados aún sin nota final). */
  toReview: TeacherExamReview[];
  liveClasses: HomeLiveClass[];
};

/**
 * Inicio del docente: entregas por calificar, sus clases en vivo y sus cursos.
 * Solo cursos de su institución en los que es el docente y que no están archivados; una ronda de consultas en paralelo.
 */
export async function getTeacherHome(actor: HomeActor, now = new Date()): Promise<TeacherHome> {
  const ownCourse = { institutionId: actor.institutionId, teacherId: actor.id, archivedAt: null };
  const [institution, courseRows, gradingRows, reviewRows, liveRows] = await Promise.all([
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { timezone: true } }),
    db.course.findMany({
      where: ownCourse,
      // Quien completó el curso sigue siendo estudiante del curso; solo quien se retiró deja de contar.
      select: { id: true, name: true, code: true, isPublished: true, _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.assignment.findMany({
      where: { course: ownCourse, submissions: { some: { status: "SUBMITTED" } } },
      select: { courseId: true, _count: { select: { submissions: { where: { status: "SUBMITTED" } } } } },
    }),
    db.exam.findMany({
      where: { institutionId: actor.institutionId, course: ownCourse, attempts: { some: { status: "SUBMITTED" } } },
      select: { id: true, title: true, courseId: true, course: { select: { name: true } }, _count: { select: { attempts: { where: { status: "SUBMITTED" } } } } },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    }),
    db.liveClass.findMany({
      where: { institutionId: actor.institutionId, course: ownCourse, startsAt: liveClassWindow(now) },
      select: liveClassSelect,
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const timezone = safeTimezone(institution?.timezone);

  const waiting = new Map<string, number>();
  for (const row of gradingRows) waiting.set(row.courseId, (waiting.get(row.courseId) ?? 0) + row._count.submissions);

  const courses: TeacherCourse[] = courseRows.map((row) => ({
    courseId: row.id,
    name: row.name,
    code: row.code,
    isPublished: row.isPublished,
    students: row._count.enrollments,
    toGrade: waiting.get(row.id) ?? 0,
  }));
  const toGrade = courses.filter((course) => course.toGrade > 0).sort((a, b) => b.toGrade - a.toGrade);

  return {
    timezone,
    courses,
    toGrade,
    toGradeTotal: toGrade.reduce((sum, course) => sum + course.toGrade, 0),
    toReview: reviewRows.map((row) => ({ courseId: row.courseId, courseName: row.course.name, examId: row.id, examTitle: row.title, attempts: row._count.attempts })),
    liveClasses: toHomeLiveClasses(liveRows, now, timezone),
  };
}
