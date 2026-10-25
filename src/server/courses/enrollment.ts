import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Tx = Prisma.TransactionClient;
type EnrollmentStatus = "ACTIVE" | "DROPPED" | "COMPLETED" | "FAILED";

export type EnrollResult =
  | { ok: true; enrolled: number; reinstated: number; already: number; skipped: number }
  | { ok: false; message: string };
export type EnrollmentChangeResult = { ok: true } | { ok: false; message: string };

export type CourseStudentRow = {
  enrollmentId: string;
  studentId: string;
  name: string;
  email: string;
  status: EnrollmentStatus;
  progressPercent: number;
  lessonsCompleted: number;
  assignmentsSubmitted: number;
  lastActivityAt: Date | null;
  enrolledAt: Date;
  fallingBehind: boolean;
};
export type WithdrawnStudentRow = {
  enrollmentId: string;
  studentId: string;
  name: string;
  email: string;
  withdrawnAt: Date | null;
  withdrawReason: string | null;
};
export type CourseStudents = {
  course: { id: string; name: string; maxStudents: number | null; archived: boolean };
  publishedLessons: number;
  publishedAssignments: number;
  activeCount: number;
  averageProgress: number;
  seatsLeft: number | null;
  students: CourseStudentRow[];
  withdrawn: WithdrawnStudentRow[];
};

const MAX_BATCH = 500;
const INACTIVITY_DAYS = 14;
const NO_ACCESS = "No encontramos ese curso o no tienes permiso para gestionarlo.";
// El bloqueo de la fila del curso (FOR UPDATE) serializa las inscripciones; READ COMMITTED basta.
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

/** Curso de la institución de quien actúa, solo si lo gestiona (su docente o quien ve todos los cursos). */
async function manageableCourse(actor: Actor, courseId: string) {
  if (!courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({
    where: { AND: [where, { id: courseId }] },
    select: { id: true, name: true, maxStudents: true, archivedAt: true },
  });
}

async function lockCourse(tx: Tx, institutionId: string, courseId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; maxStudents: number | null; archivedAt: Date | null }>>`
    SELECT "id", "maxStudents", "archivedAt" FROM "courses"
    WHERE "id" = ${courseId} AND "institutionId" = ${institutionId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

function seatsMessage(need: number, left: number) {
  const seats = left <= 0 ? "ya no quedan cupos" : left === 1 ? "solo queda 1 cupo" : `solo quedan ${left} cupos`;
  return `No caben todos: ${need === 1 ? "es 1 estudiante" : `son ${need} estudiantes`} y ${seats} en el curso. No se inscribió a nadie.`;
}

export function progressPercentOf(completed: number, published: number, stored: number) {
  if (published > 0) return Math.min(100, Math.round((completed / published) * 100));
  return Math.max(0, Math.min(100, Math.round(stored)));
}

/**
 * «Se está quedando atrás»: avanza menos de la mitad del promedio del curso (con al menos
 * 3 inscritos) o lleva 14 días sin actividad (contados desde su inscripción si nunca tuvo).
 */
export function isFallingBehind(
  student: { progressPercent: number; lastActivityAt: Date | null; enrolledAt: Date },
  course: { activeCount: number; averageProgress: number },
  now = new Date(),
) {
  if (course.activeCount >= 3 && student.progressPercent < course.averageProgress / 2) return true;
  const reference = student.lastActivityAt ?? student.enrolledAt;
  return now.getTime() - reference.getTime() > INACTIVITY_DAYS * 24 * 60 * 60_000;
}

const latest = (...dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null);

/** Inscritos del curso con su avance. Devuelve null si quien actúa no gestiona el curso. */
export async function listCourseStudents(actor: Actor, courseId: string, now = new Date()): Promise<CourseStudents | null> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;

  const publishedLesson = { courseId: course.id, isPublished: true, section: { isPublished: true } };
  const [enrollments, publishedLessons, publishedAssignments, completed, activity, submissions] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: course.id },
      select: {
        id: true,
        studentId: true,
        status: true,
        progressPercent: true,
        enrolledAt: true,
        withdrawnAt: true,
        withdrawReason: true,
        student: { select: { name: true, email: true } },
      },
      orderBy: { student: { name: "asc" } },
    }),
    db.lesson.count({ where: publishedLesson }),
    db.assignment.count({ where: { courseId: course.id, isPublished: true } }),
    db.lessonProgress.groupBy({
      by: ["enrollmentId"],
      where: { completed: true, lesson: publishedLesson },
      _count: { _all: true },
    }),
    db.lessonProgress.groupBy({
      by: ["enrollmentId"],
      where: { lesson: { courseId: course.id } },
      _max: { updatedAt: true },
    }),
    db.submission.groupBy({
      by: ["enrollmentId"],
      where: { status: { not: "DRAFT" }, assignment: { courseId: course.id, isPublished: true } },
      _count: { _all: true },
      _max: { submittedAt: true },
    }),
  ]);

  const completedBy = new Map(completed.map((row) => [row.enrollmentId, row._count._all]));
  const activityBy = new Map(activity.map((row) => [row.enrollmentId, row._max.updatedAt]));
  const submissionsBy = new Map(submissions.map((row) => [row.enrollmentId, row]));

  const rows = enrollments
    .filter((enrollment) => enrollment.status !== "DROPPED")
    .map((enrollment) => {
      const lessonsCompleted = completedBy.get(enrollment.id) ?? 0;
      const submitted = submissionsBy.get(enrollment.id);
      return {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        name: enrollment.student.name,
        email: enrollment.student.email,
        status: enrollment.status as EnrollmentStatus,
        progressPercent: progressPercentOf(lessonsCompleted, publishedLessons, enrollment.progressPercent),
        lessonsCompleted,
        assignmentsSubmitted: submitted?._count._all ?? 0,
        lastActivityAt: latest(activityBy.get(enrollment.id), submitted?._max.submittedAt),
        enrolledAt: enrollment.enrolledAt,
      };
    });

  const active = rows.filter((row) => row.status === "ACTIVE");
  const averageProgress = active.length ? Math.round(active.reduce((sum, row) => sum + row.progressPercent, 0) / active.length) : 0;
  const summary = { activeCount: active.length, averageProgress };

  return {
    course: { id: course.id, name: course.name, maxStudents: course.maxStudents, archived: Boolean(course.archivedAt) },
    publishedLessons,
    publishedAssignments,
    activeCount: active.length,
    averageProgress,
    seatsLeft: course.maxStudents === null ? null : Math.max(0, course.maxStudents - active.length),
    students: rows.map((row) => ({ ...row, fallingBehind: row.status === "ACTIVE" && isFallingBehind(row, summary, now) })),
    withdrawn: enrollments
      .filter((enrollment) => enrollment.status === "DROPPED")
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        name: enrollment.student.name,
        email: enrollment.student.email,
        withdrawnAt: enrollment.withdrawnAt,
        withdrawReason: enrollment.withdrawReason,
      })),
  };
}

/** Estudiantes activos de la institución que se pueden inscribir: sin inscripción en el curso, o retirados. */
export async function searchEnrollableStudents(actor: Actor, courseId: string, query: string, take = 50) {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;
  const q = query.trim().slice(0, 100);
  const students = await db.user.findMany({
    where: {
      institutionId: actor.institutionId,
      role: "STUDENT",
      status: "ACTIVE",
      enrollments: { none: { courseId: course.id, status: { not: "DROPPED" } } },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: take + 1,
  });
  return { students: students.slice(0, take), more: students.length > take };
}

/** Grupos de la institución con cuántos miembros tienen, para «Inscribir un grupo completo». */
export async function listGroupsForEnrollment(actor: Actor) {
  const groups = await db.studentGroup.findMany({
    where: { institutionId: actor.institutionId },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
    take: 200,
  });
  return groups.map((group) => ({ id: group.id, name: group.name, members: group._count.members }));
}

/**
 * Núcleo compartido: con el curso bloqueado, inscribe a quien falta, reincorpora a quien estaba
 * retirado y deja igual a quien ya estaba. Si el cupo no alcanza para todos, no cambia nada.
 */
async function enrollLocked(
  tx: Tx,
  actor: Actor,
  courseId: string,
  studentIds: string[],
  audit: { action: string; extra?: Record<string, string | number> },
  skipped = 0,
): Promise<EnrollResult> {
  const course = await lockCourse(tx, actor.institutionId, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (course.archivedAt) return { ok: false, message: "Este curso está archivado. Recupéralo antes de inscribir estudiantes." };

  const existing = await tx.enrollment.findMany({
    where: { courseId, studentId: { in: studentIds } },
    select: { id: true, studentId: true, status: true },
  });
  const known = new Set(existing.map((enrollment) => enrollment.studentId));
  const toReinstate = existing.filter((enrollment) => enrollment.status === "DROPPED");
  const toCreate = studentIds.filter((id) => !known.has(id));
  const already = existing.length - toReinstate.length;
  const need = toCreate.length + toReinstate.length;

  if (need > 0 && course.maxStudents !== null) {
    const active = await tx.enrollment.count({ where: { courseId, status: "ACTIVE" } });
    const left = course.maxStudents - active;
    if (need > left) return { ok: false, message: seatsMessage(need, left) };
  }
  if (need === 0) return { ok: true, enrolled: 0, reinstated: 0, already, skipped };

  if (toCreate.length) {
    await tx.enrollment.createMany({
      data: toCreate.map((studentId) => ({ institutionId: actor.institutionId, studentId, courseId, status: "ACTIVE" as const })),
    });
  }
  if (toReinstate.length) {
    await tx.enrollment.updateMany({
      where: { id: { in: toReinstate.map((enrollment) => enrollment.id) } },
      data: { status: "ACTIVE", withdrawnAt: null, withdrawReason: null },
    });
  }
  await tx.auditLog.create({
    data: {
      institutionId: actor.institutionId,
      userId: actor.id,
      action: audit.action,
      entity: "Course",
      entityId: courseId,
      changes: { ...audit.extra, enrolled: toCreate.length, reinstated: toReinstate.length, already, studentIds: [...toCreate, ...toReinstate.map((enrollment) => enrollment.studentId)] },
    },
  });
  return { ok: true, enrolled: toCreate.length, reinstated: toReinstate.length, already, skipped };
}

/**
 * Inscribe a varios estudiantes de una vez. Repetirlo no duplica; quien estaba retirado vuelve
 * a estar activo con su historial. Si alguno no es estudiante activo de la institución, o no
 * caben todos, no se inscribe a nadie.
 */
export async function enrollStudents(actor: Actor, courseId: string, studentIds: string[]): Promise<EnrollResult> {
  const ids = [...new Set(studentIds.filter((id) => typeof id === "string" && id))];
  if (!ids.length) return { ok: false, message: "Elige al menos un estudiante." };
  if (ids.length > MAX_BATCH) return { ok: false, message: `Puedes inscribir hasta ${MAX_BATCH} estudiantes a la vez.` };
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };

  const valid = await db.user.count({ where: { id: { in: ids }, institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" } });
  if (valid !== ids.length) {
    return { ok: false, message: "Alguna de las personas elegidas ya no es un estudiante activo de tu institución. Vuelve a buscar y elige de nuevo." };
  }
  return db.$transaction((tx) => enrollLocked(tx, actor, course.id, ids, { action: "COURSE_STUDENTS_ENROLLED" }), rowLocked);
}

/** Inscribe a todos los estudiantes activos de un grupo de la institución. */
export async function enrollGroup(actor: Actor, courseId: string, groupId: string): Promise<EnrollResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  const group = groupId
    ? await db.studentGroup.findFirst({
        where: { id: groupId, institutionId: actor.institutionId },
        select: { id: true, name: true, members: { select: { user: { select: { id: true, institutionId: true, role: true, status: true } } } } },
      })
    : null;
  if (!group) return { ok: false, message: "No encontramos ese grupo." };

  const ids = group.members
    .filter(({ user }) => user.institutionId === actor.institutionId && user.role === "STUDENT" && user.status === "ACTIVE")
    .map(({ user }) => user.id);
  if (!ids.length) return { ok: false, message: `El grupo «${group.name}» todavía no tiene estudiantes activos.` };
  if (ids.length > MAX_BATCH) return { ok: false, message: `El grupo tiene más de ${MAX_BATCH} estudiantes. Inscríbelos por partes desde el buscador.` };

  return db.$transaction(
    (tx) => enrollLocked(tx, actor, course.id, ids, { action: "COURSE_GROUP_ENROLLED", extra: { groupId: group.id } }, group.members.length - ids.length),
    rowLocked,
  );
}

/** Retira a un estudiante del curso. No borra nada: notas, entregas y avance se conservan. */
export async function withdrawStudent(actor: Actor, courseId: string, enrollmentId: string, reason: string, now = new Date()): Promise<EnrollmentChangeResult> {
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, message: "Escribe el motivo del retiro." };
  if (cleanReason.length > 500) return { ok: false, message: "El motivo es demasiado largo." };
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };

  return db.$transaction(async (tx) => {
    if (!(await lockCourse(tx, actor.institutionId, course.id))) return { ok: false, message: NO_ACCESS } as const;
    const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, courseId: course.id }, select: { id: true, studentId: true, status: true } });
    if (!enrollment) return { ok: false, message: "No encontramos a ese estudiante en este curso." } as const;
    if (enrollment.status === "DROPPED") return { ok: true } as const;
    if (enrollment.status !== "ACTIVE") return { ok: false, message: "Este estudiante ya terminó el curso y no se puede retirar." } as const;

    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "DROPPED", withdrawnAt: now, withdrawReason: cleanReason } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_STUDENT_WITHDRAWN",
        entity: "Enrollment",
        entityId: enrollment.id,
        changes: { courseId: course.id, studentId: enrollment.studentId, reason: cleanReason },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Devuelve al curso a un estudiante retirado, si queda cupo. */
export async function reinstateStudent(actor: Actor, courseId: string, enrollmentId: string): Promise<EnrollmentChangeResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };

  return db.$transaction(async (tx) => {
    const locked = await lockCourse(tx, actor.institutionId, course.id);
    if (!locked) return { ok: false, message: NO_ACCESS } as const;
    const enrollment = await tx.enrollment.findFirst({
      where: { id: enrollmentId, courseId: course.id },
      select: { id: true, studentId: true, status: true, student: { select: { status: true } } },
    });
    if (!enrollment) return { ok: false, message: "No encontramos a ese estudiante en este curso." } as const;
    if (enrollment.status !== "DROPPED") return { ok: true } as const;
    if (locked.archivedAt) return { ok: false, message: "Este curso está archivado. Recupéralo antes de reincorporar estudiantes." } as const;
    if (enrollment.student.status !== "ACTIVE") return { ok: false, message: "Esta persona tiene el acceso suspendido. Reactívala primero en Personas y acceso." } as const;
    if (locked.maxStudents !== null) {
      const active = await tx.enrollment.count({ where: { courseId: course.id, status: "ACTIVE" } });
      if (active >= locked.maxStudents) return { ok: false, message: "El curso está lleno: ya no quedan cupos para reincorporar a este estudiante." } as const;
    }

    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", withdrawnAt: null, withdrawReason: null } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_STUDENT_REINSTATED",
        entity: "Enrollment",
        entityId: enrollment.id,
        changes: { courseId: course.id, studentId: enrollment.studentId },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Detalle del avance de un estudiante: cada lección publicada y cada tarea publicada con su estado. */
export async function getStudentProgress(actor: Actor, courseId: string, enrollmentId: string) {
  const course = await manageableCourse(actor, courseId);
  if (!course || !enrollmentId) return null;
  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, courseId: course.id },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      finalGrade: true,
      enrolledAt: true,
      completedAt: true,
      withdrawnAt: true,
      withdrawReason: true,
      student: { select: { id: true, name: true, email: true } },
    },
  });
  if (!enrollment) return null;

  const [sections, assignments] = await Promise.all([
    db.courseSection.findMany({
      where: { courseId: course.id, isPublished: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        lessons: {
          where: { isPublished: true },
          orderBy: { order: "asc" },
          select: { id: true, title: true, progress: { where: { enrollmentId: enrollment.id }, select: { completed: true, completedAt: true, updatedAt: true } } },
        },
      },
    }),
    db.assignment.findMany({
      where: { courseId: course.id, isPublished: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        maxScore: true,
        submissions: { where: { enrollmentId: enrollment.id }, select: { status: true, score: true, submittedAt: true } },
      },
    }),
  ]);

  const chapters = sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => {
      const progress = lesson.progress[0];
      const completed = Boolean(progress?.completed);
      return { id: lesson.id, title: lesson.title, completed, completedAt: completed ? (progress?.completedAt ?? progress?.updatedAt ?? null) : null };
    }),
  }));
  const lessons = chapters.flatMap((chapter) => chapter.lessons);
  const lessonsCompleted = lessons.filter((lesson) => lesson.completed).length;

  return {
    course: { id: course.id, name: course.name },
    enrollment: {
      id: enrollment.id,
      status: enrollment.status as EnrollmentStatus,
      finalGrade: enrollment.finalGrade,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      withdrawnAt: enrollment.withdrawnAt,
      withdrawReason: enrollment.withdrawReason,
    },
    student: enrollment.student,
    progressPercent: progressPercentOf(lessonsCompleted, lessons.length, enrollment.progressPercent),
    lessonsCompleted,
    lessonsTotal: lessons.length,
    chapters,
    assignments: assignments.map((assignment) => {
      const submission = assignment.submissions.find((entry) => entry.status !== "DRAFT");
      return {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        maxScore: assignment.maxScore,
        status: (submission?.status ?? "PENDING") as "PENDING" | "SUBMITTED" | "GRADED" | "RETURNED",
        score: submission?.score ?? null,
        submittedAt: submission?.submittedAt ?? null,
      };
    }),
  };
}
