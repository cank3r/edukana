import { db } from "@/lib/db";

/** Persona en sesión: todo se consulta dentro de su institución. */
export type HomeActor = { id: string; institutionId: string };

/** La clase en vivo se puede abrir desde estos minutos antes de empezar y hasta que termina. */
export const JOIN_EARLY_MINUTES = 15;
/** Ventana de «Hoy y próximos días». */
export const UPCOMING_DAYS = 7;
const PENDING_LIMIT = 30;
const DEFAULT_TIMEZONE = "America/Santo_Domingo";

export type HomeLiveClass = {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  startsAt: Date;
  endsAt: Date;
  /** Texto listo para mostrar, en la hora de la institución. */
  when: string;
  /** Enlace solo si es https; si no, la clase se muestra sin botón. */
  joinUrl: string | null;
  canJoin: boolean;
};

export type StudentCourse = {
  courseId: string;
  name: string;
  code: string | null;
  teacherName: string;
  progressPercent: number;
  completed: boolean;
  finalGrade: number | null;
};

export type StudentPending = {
  kind: "assignment" | "exam";
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  href: string;
  dueAt: Date | null;
  dueText: string | null;
  overdue: boolean;
  /** Solo exámenes: ya lo presentó y le quedan intentos. */
  retry: boolean;
};

export type StudentHome = {
  timezone: string;
  /** Sin matrícula en ningún curso visible (ni activo ni completado). */
  notEnrolled: boolean;
  continueLesson: { courseId: string; courseName: string; lessonId: string; lessonTitle: string; href: string } | null;
  liveClasses: HomeLiveClass[];
  pending: StudentPending[];
  /** Cursos con matrícula activa. */
  courses: StudentCourse[];
};

/** Devuelve el enlace solo si es https; cualquier otra cosa se descarta. */
export function safeJoinUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeTimezone(value: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("es", { timeZone: value || DEFAULT_TIMEZONE });
    return value || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const dayKey = (value: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(value);

/** «Hoy, 3:00 p. m.», «Mañana, 9:00 a. m.» o «jue, 15 oct, 9:00 a. m.», en la hora de la institución. */
export function formatWhen(value: Date, now: Date, timeZone: string): string {
  const time = new Intl.DateTimeFormat("es", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(value);
  const key = dayKey(value, timeZone);
  if (key === dayKey(now, timeZone)) return `Hoy, ${time}`;
  if (key === dayKey(new Date(now.getTime() + 24 * 60 * 60_000), timeZone)) return `Mañana, ${time}`;
  const day = new Intl.DateTimeFormat("es", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(value);
  return `${day}, ${time}`;
}

type LiveClassRow = { id: string; title: string; startsAt: Date; durationMinutes: number; joinUrl: string; courseId: string; course: { name: string } };

export const liveClassSelect = { id: true, title: true, startsAt: true, durationMinutes: true, joinUrl: true, courseId: true, course: { select: { name: true } } } as const;

/** Clases que empiezan dentro de la ventana. Trae un día hacia atrás para incluir las que están en curso. */
export function liveClassWindow(now: Date) {
  return { gte: new Date(now.getTime() - 24 * 60 * 60_000), lte: new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60_000) };
}

export function toHomeLiveClasses(rows: LiveClassRow[], now: Date, timeZone: string): HomeLiveClass[] {
  return rows
    .map((row) => {
      const endsAt = new Date(row.startsAt.getTime() + row.durationMinutes * 60_000);
      const opensAt = new Date(row.startsAt.getTime() - JOIN_EARLY_MINUTES * 60_000);
      const joinUrl = safeJoinUrl(row.joinUrl);
      return {
        id: row.id,
        title: row.title,
        courseId: row.courseId,
        courseName: row.course.name,
        startsAt: row.startsAt,
        endsAt,
        when: formatWhen(row.startsAt, now, timeZone),
        joinUrl,
        canJoin: joinUrl !== null && now >= opensAt && now < endsAt,
      };
    })
    .filter((item) => item.endsAt > now);
}

/** Matrículas del estudiante en cursos publicados y no archivados de su institución. */
function findEnrollments(actor: HomeActor) {
  return db.enrollment.findMany({
    where: {
      studentId: actor.id,
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { institutionId: actor.institutionId, isPublished: true, archivedAt: null },
    },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      finalGrade: true,
      course: { select: { id: true, name: true, code: true, teacher: { select: { name: true } } } },
    },
    orderBy: [{ enrolledAt: "desc" }, { id: "asc" }],
  });
}

type EnrollmentRow = Awaited<ReturnType<typeof findEnrollments>>[number];

const toStudentCourse = (row: EnrollmentRow): StudentCourse => ({
  courseId: row.course.id,
  name: row.course.name,
  code: row.course.code,
  teacherName: row.course.teacher.name,
  progressPercent: Math.max(0, Math.min(100, Math.round(row.progressPercent))),
  completed: row.status === "COMPLETED",
  finalGrade: row.finalGrade,
});

/** «Mis cursos»: lista completa del estudiante, activos primero y luego los completados con su nota final. */
export async function getStudentCourses(actor: HomeActor): Promise<StudentCourse[]> {
  const rows = await findEnrollments(actor);
  return rows.map(toStudentCourse).sort((a, b) => Number(a.completed) - Number(b.completed));
}

/**
 * Inicio del estudiante: por dónde iba, sus clases, sus pendientes y sus cursos.
 * Dos rondas de consultas en paralelo; ninguna consulta por curso.
 */
export async function getStudentHome(actor: HomeActor, now = new Date()): Promise<StudentHome> {
  const [institution, enrollments] = await Promise.all([
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { timezone: true } }),
    findEnrollments(actor),
  ]);
  const timezone = safeTimezone(institution?.timezone);
  const active = enrollments.filter((row) => row.status === "ACTIVE");
  const courses = active.map(toStudentCourse);
  if (active.length === 0) {
    return { timezone, notEnrolled: enrollments.length === 0, continueLesson: null, liveClasses: [], pending: [], courses };
  }

  const institutionId = actor.institutionId;
  const courseIds = active.map((row) => row.course.id);
  const courseName = new Map(active.map((row) => [row.course.id, row.course.name]));

  const [lessons, progress, liveRows, assignments, exams] = await Promise.all([
    db.lesson.findMany({
      where: { institutionId, courseId: { in: courseIds }, isPublished: true, section: { isPublished: true } },
      select: { id: true, title: true, courseId: true },
      orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
    }),
    db.lessonProgress.findMany({
      where: { institutionId, enrollmentId: { in: active.map((row) => row.id) } },
      select: { lessonId: true, completed: true, updatedAt: true, enrollment: { select: { courseId: true } } },
    }),
    db.liveClass.findMany({
      where: { institutionId, courseId: { in: courseIds }, startsAt: liveClassWindow(now) },
      select: liveClassSelect,
      orderBy: { startsAt: "asc" },
    }),
    db.assignment.findMany({
      where: {
        courseId: { in: courseIds },
        course: { institutionId },
        isPublished: true,
        dueDate: { not: null },
        submissions: { none: { studentId: actor.id, status: { not: "DRAFT" } } },
      },
      select: { id: true, title: true, dueDate: true, courseId: true },
      orderBy: { dueDate: "asc" },
      take: PENDING_LIMIT,
    }),
    db.exam.findMany({
      where: {
        institutionId,
        courseId: { in: courseIds },
        isPublished: true,
        questions: { some: {} },
        AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: now } }] }, { OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
      },
      select: {
        id: true,
        title: true,
        closesAt: true,
        maxAttempts: true,
        courseId: true,
        attempts: { where: { studentId: actor.id }, select: { status: true, expiresAt: true } },
      },
      orderBy: [{ closesAt: "asc" }, { createdAt: "asc" }],
      take: PENDING_LIMIT,
    }),
  ]);

  // Continúa donde ibas: el curso con actividad más reciente que aún tenga una lección por hacer.
  const done = new Set(progress.filter((row) => row.completed).map((row) => row.lessonId));
  const lastActivity = new Map<string, number>();
  for (const row of progress) {
    const courseId = row.enrollment.courseId;
    lastActivity.set(courseId, Math.max(lastActivity.get(courseId) ?? 0, row.updatedAt.getTime()));
  }
  const nextLesson = new Map<string, { id: string; title: string }>();
  for (const lesson of lessons) {
    if (!done.has(lesson.id) && !nextLesson.has(lesson.courseId)) nextLesson.set(lesson.courseId, { id: lesson.id, title: lesson.title });
  }
  // `active` ya viene de la matrícula más reciente a la más antigua: sirve de desempate estable.
  const byRecency = [...active].sort((a, b) => (lastActivity.get(b.course.id) ?? 0) - (lastActivity.get(a.course.id) ?? 0));
  const target = byRecency.find((row) => nextLesson.has(row.course.id));
  const lesson = target ? nextLesson.get(target.course.id) : undefined;
  const continueLesson = target && lesson
    ? { courseId: target.course.id, courseName: target.course.name, lessonId: lesson.id, lessonTitle: lesson.title, href: `/dashboard/aula/${target.course.id}/leccion/${lesson.id}` }
    : null;

  const assignmentItems: StudentPending[] = assignments.map((item) => ({
    kind: "assignment",
    id: item.id,
    title: item.title,
    courseId: item.courseId,
    courseName: courseName.get(item.courseId) ?? "",
    href: `/dashboard/aula/${item.courseId}/tareas/${item.id}`,
    dueAt: item.dueDate,
    dueText: item.dueDate ? formatWhen(item.dueDate, now, timezone) : null,
    overdue: item.dueDate !== null && item.dueDate < now,
    retry: false,
  }));
  const examItems: StudentPending[] = exams
    .filter((exam) => exam.attempts.length < exam.maxAttempts || exam.attempts.some((attempt) => attempt.status === "IN_PROGRESS" && attempt.expiresAt !== null && attempt.expiresAt > now))
    .map((exam) => ({
      kind: "exam",
      id: exam.id,
      title: exam.title,
      courseId: exam.courseId,
      courseName: courseName.get(exam.courseId) ?? "",
      href: `/dashboard/aula/${exam.courseId}/presentar/${exam.id}`,
      dueAt: exam.closesAt,
      dueText: exam.closesAt ? formatWhen(exam.closesAt, now, timezone) : null,
      overdue: false,
      retry: exam.attempts.some((attempt) => attempt.status !== "IN_PROGRESS"),
    }));
  // Vencidas primero; después por fecha más cercana; lo que no tiene fecha va al final.
  const far = Number.MAX_SAFE_INTEGER;
  const pending = [...assignmentItems, ...examItems].sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueAt?.getTime() ?? far) - (b.dueAt?.getTime() ?? far),
  );

  return { timezone, notEnrolled: false, continueLesson, liveClasses: toHomeLiveClasses(liveRows, now, timezone), pending, courses };
}
