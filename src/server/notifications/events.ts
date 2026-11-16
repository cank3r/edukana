import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { formatZonedDay, formatZonedTime, isValidTimeZone } from "@/lib/timezone";
import { studentAssignmentGrade } from "@/server/assessment/assignment-policies";
import { formatMoney } from "@/server/finance/money";
import { notify, notifySafely, notifyWithinTransaction, withSavepoint, type EmailRequest } from "./index";

/**
 * Una función por evento. Todas se llaman DESPUÉS de que la acción principal quedó guardada
 * (o, las que reciben `tx`, dentro de su transacción con un punto de guardado) y ninguna lanza:
 * un fallo al notificar se registra y la acción sigue siendo un éxito.
 *
 * El correo sigue las preferencias de cada persona (`email-policy.ts`): por omisión llegan por
 * correo los avisos, las notas y los cargos; el resto solo si la persona lo activa.
 */

const DEFAULT_TIME_ZONE = "America/Santo_Domingo";
/** Con más destinatarios que esto, un aviso llega solo a la aplicación (sin correo). */
export const ANNOUNCEMENT_EMAIL_LIMIT = 200;

async function safely(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`notificación «${label}» falló`, { correlationId: crypto.randomUUID(), error });
  }
}

const zoneOf = (timezone: string | null | undefined) => (timezone && isValidTimeZone(timezone) ? timezone : DEFAULT_TIME_ZONE);
const when = (instant: Date, timeZone: string) => `${formatZonedDay(instant, timeZone)} a las ${formatZonedTime(instant, timeZone)}`;

/** Estudiantes con matrícula ACTIVA en un curso publicado y no archivado de la institución. */
async function activeStudentsOf(institutionId: string, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, institutionId, isPublished: true, archivedAt: null },
    select: {
      id: true,
      name: true,
      institution: { select: { timezone: true } },
      enrollments: { where: { status: "ACTIVE", institutionId }, select: { studentId: true } },
    },
  });
  if (!course) return null;
  return { name: course.name, timeZone: zoneOf(course.institution.timezone), studentIds: course.enrollments.map((row) => row.studentId) };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export type AnnouncementAudience = { institution: boolean; roles: Role[]; courseIds: string[]; userIds: string[]; unitIds: string[] };

/**
 * Las personas que verán un aviso: la misma regla que `announcementRecipientWhere`
 * (toda la institución, por rol, por curso —quien estudia o enseña—, por persona o por unidad),
 * más los tutores que tienen permiso de ver los avisos de su estudiante.
 */
export async function announcementAudienceUserIds(institutionId: string, audience: AnnouncementAudience): Promise<string[]> {
  const base: Prisma.UserWhereInput = { institutionId, status: "ACTIVE" };
  const filters: Prisma.UserWhereInput[] = [];
  if (audience.roles.length) filters.push({ role: { in: audience.roles } });
  if (audience.userIds.length) filters.push({ id: { in: audience.userIds } });
  if (audience.courseIds.length) {
    filters.push(
      { enrollments: { some: { courseId: { in: audience.courseIds }, status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId } } } },
      { taughtCourses: { some: { id: { in: audience.courseIds }, institutionId } } },
    );
  }
  if (audience.unitIds.length) filters.push({ organizationalMemberships: { some: { unitId: { in: audience.unitIds }, institutionId } } });
  if (!audience.institution && !filters.length) return [];
  const people = await db.user.findMany({ where: audience.institution ? base : { ...base, OR: filters }, select: { id: true, role: true } });
  const ids = new Set(people.map((person) => person.id));
  const studentIds = people.filter((person) => person.role === "STUDENT").map((person) => person.id);
  if (studentIds.length && !audience.institution) {
    const guardians = await db.guardianship.findMany({
      where: { institutionId, studentId: { in: studentIds }, status: "ACTIVE", canViewAnnouncements: true, parent: { institutionId, role: "PARENT", status: "ACTIVE" } },
      select: { parentId: true },
    });
    for (const row of guardians) ids.add(row.parentId);
  }
  return [...ids];
}

/** Aviso publicado: a sus destinatarios, salvo quien lo escribió. Por correo solo si son 200 personas o menos (y según preferencias). */
export function notifyAnnouncementPublished(actor: { id: string; institutionId: string }, input: { title: string; content: string; audience: AnnouncementAudience }) {
  return safely("aviso publicado", async () => {
    const userIds = (await announcementAudienceUserIds(actor.institutionId, input.audience)).filter((id) => id !== actor.id);
    if (!userIds.length) return;
    const preview = input.content.replace(/\s+/g, " ").trim();
    await notifySafely({
      institutionId: actor.institutionId,
      userIds,
      kind: "announcement",
      title: `Nuevo aviso: ${input.title}`,
      body: preview.length > 280 ? `${preview.slice(0, 277)}…` : preview,
      href: "/dashboard/comunidad",
      email: userIds.length <= ANNOUNCEMENT_EMAIL_LIMIT,
    });
  });
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

/** Tarea publicada: a los estudiantes activos del curso (por correo solo a quien lo activó). */
export function notifyAssignmentPublished(institutionId: string, assignmentId: string) {
  return safely("tarea publicada", async () => {
    const assignment = await db.assignment.findFirst({
      where: { id: assignmentId, institutionId, isPublished: true },
      select: { id: true, title: true, courseId: true, dueDate: true },
    });
    if (!assignment) return;
    const course = await activeStudentsOf(institutionId, assignment.courseId);
    if (!course?.studentIds.length) return;
    await notifySafely({
      institutionId,
      userIds: course.studentIds,
      kind: "assignment",
      title: `Nueva tarea en ${course.name}: ${assignment.title}`,
      body: assignment.dueDate ? `Entrégala antes del ${when(assignment.dueDate, course.timeZone)}.` : "No tiene fecha límite.",
      href: `/dashboard/aula/${assignment.courseId}/tareas/${assignment.id}`,
    });
  });
}

/** Entrega recibida: al docente del curso (por correo solo si lo activó). */
export function notifySubmissionReceived(institutionId: string, input: { assignmentId: string; studentId: string; resubmitted: boolean }) {
  return safely("entrega recibida", async () => {
    const [assignment, student] = await Promise.all([
      db.assignment.findFirst({
        where: { id: input.assignmentId, institutionId },
        select: { id: true, title: true, courseId: true, course: { select: { teacherId: true, name: true } } },
      }),
      db.user.findFirst({ where: { id: input.studentId, institutionId }, select: { name: true } }),
    ]);
    if (!assignment || !student) return;
    await notifySafely({
      institutionId,
      userIds: [assignment.course.teacherId],
      kind: "submission",
      title: `${student.name} ${input.resubmitted ? "volvió a entregar" : "entregó"} «${assignment.title}»`,
      body: `Curso: ${assignment.course.name}. Ya puedes revisarla y calificarla.`,
      href: `/dashboard/aula/${assignment.courseId}/tareas/${assignment.id}`,
    });
  });
}

/**
 * Nota puesta o corregida: al estudiante, en la aplicación y por correo (según su preferencia). No incluye la nota
 * (el correo no es un canal privado) y no se envía mientras la nota siga oculta para el
 * estudiante porque su período de calificaciones no se ha publicado.
 */
export function notifyGradePosted(institutionId: string, input: { submissionId: string; corrected: boolean }) {
  return safely("nota puesta", async () => {
    const submission = await db.submission.findFirst({
      where: { id: input.submissionId, institutionId },
      select: {
        studentId: true,
        enrollmentId: true,
        status: true,
        score: true,
        feedback: true,
        assignment: {
          select: {
            id: true,
            title: true,
            courseId: true,
            isPublished: true,
            course: { select: { name: true } },
            gradeItem: { select: { isPublished: true, id: true } },
          },
        },
      },
    });
    if (!submission?.assignment.isPublished) return;
    const gradeItem = submission.assignment.gradeItem
      ? {
          isPublished: submission.assignment.gradeItem.isPublished,
          entries: await db.gradeEntry.findMany({
            where: { institutionId, gradeItemId: submission.assignment.gradeItem.id, enrollmentId: submission.enrollmentId },
            select: { score: true, feedback: true, isExcused: true },
          }),
        }
      : null;
    if (!studentAssignmentGrade(submission, gradeItem).graded) return;
    const { assignment } = submission;
    await notifySafely({
      institutionId,
      userIds: [submission.studentId],
      kind: "grade",
      title: input.corrected ? `Se corrigió tu nota en «${assignment.title}»` : `Ya tienes nota en «${assignment.title}»`,
      body: `Curso: ${assignment.course.name}. Abre la tarea para ver tu nota y los comentarios.`,
      href: `/dashboard/aula/${assignment.courseId}/tareas/${assignment.id}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Exámenes y clases en vivo
// ---------------------------------------------------------------------------

/** Examen publicado: a los estudiantes activos del curso (por correo solo a quien lo activó). */
export function notifyExamPublished(institutionId: string, examId: string) {
  return safely("examen publicado", async () => {
    const exam = await db.exam.findFirst({
      where: { id: examId, institutionId, isPublished: true },
      select: { id: true, title: true, courseId: true, opensAt: true, closesAt: true },
    });
    if (!exam) return;
    const course = await activeStudentsOf(institutionId, exam.courseId);
    if (!course?.studentIds.length) return;
    const parts: string[] = [];
    if (exam.opensAt && exam.opensAt > new Date()) parts.push(`Se abre el ${when(exam.opensAt, course.timeZone)}.`);
    if (exam.closesAt) parts.push(`Puedes presentarlo hasta el ${when(exam.closesAt, course.timeZone)}.`);
    await notifySafely({
      institutionId,
      userIds: course.studentIds,
      kind: "exam",
      title: `Nuevo examen en ${course.name}: ${exam.title}`,
      body: parts.join(" ") || "Ya puedes presentarlo.",
      href: `/dashboard/aula/${exam.courseId}/presentar`,
    });
  });
}

/** Clase en vivo programada: a los estudiantes activos, con la hora de la institución (por correo solo a quien lo activó). */
export function notifyLiveClassScheduled(institutionId: string, input: { courseId: string; title: string; starts: Date[] }) {
  return safely("clase en vivo programada", async () => {
    if (!input.starts.length) return;
    const course = await activeStudentsOf(institutionId, input.courseId);
    if (!course?.studentIds.length) return;
    const first = input.starts[0];
    const repeats = input.starts.length > 1 ? ` Se repite cada semana a la misma hora (${input.starts.length} clases).` : "";
    await notifySafely({
      institutionId,
      userIds: course.studentIds,
      kind: "live_class",
      title: `Clase en vivo en ${course.name}: ${input.title}`,
      body: `Es el ${when(first, course.timeZone)}.${repeats} El enlace para entrar está en la página de clases del curso.`,
      href: `/dashboard/aula/${input.courseId}/clases`,
    });
  });
}

// ---------------------------------------------------------------------------
// Certificados, inscripciones y cobros
// ---------------------------------------------------------------------------

/** Certificado emitido: al estudiante (por correo solo si lo activó). */
export function notifyCertificatesIssued(institutionId: string, input: { courseId: string; enrollmentIds: string[] }) {
  return safely("certificado emitido", async () => {
    if (!input.enrollmentIds.length) return;
    const enrollments = await db.enrollment.findMany({
      where: { id: { in: input.enrollmentIds }, courseId: input.courseId, institutionId },
      select: { studentId: true, course: { select: { name: true } } },
    });
    if (!enrollments.length) return;
    await notifySafely({
      institutionId,
      userIds: enrollments.map((row) => row.studentId),
      kind: "certificate",
      title: `Tu certificado de «${enrollments[0].course.name}» está listo`,
      body: "Puedes abrirlo, imprimirlo o compartir su enlace desde Mis certificados.",
      href: "/dashboard/mis-certificados",
    });
  });
}

/** Inscripción a un curso: al estudiante, solo en la aplicación (no es un tipo de correo). Va dentro de la transacción que inscribe. */
export function notifyEnrolledWithinTransaction(tx: Prisma.TransactionClient, institutionId: string, input: { courseId: string; studentIds: string[] }) {
  if (!input.studentIds.length) return Promise.resolve();
  return safely("inscripción", () =>
    withSavepoint(tx, "enrollment", async () => {
      const course = await tx.course.findFirst({
        where: { id: input.courseId, institutionId, isPublished: true, archivedAt: null },
        select: { id: true, name: true },
      });
      // Un curso aún sin publicar no se muestra al estudiante: no hay a dónde enviarlo todavía.
      if (!course) return;
      await notify(tx, {
        institutionId,
        userIds: input.studentIds,
        kind: "enrollment",
        title: `Te inscribieron en ${course.name}`,
        body: "Ya puedes entrar al curso y ver su contenido.",
        href: `/dashboard/aula/${course.id}`,
        email: false,
      });
    }),
  );
}

function dueDay(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(date);
}

type ChargeNotice = { studentIds: string[]; concept: string; amountCents: number; currency: string; dueDate: string };

function chargeInput(institutionId: string, input: ChargeNotice) {
  const day = dueDay(input.dueDate);
  return {
    institutionId,
    userIds: input.studentIds,
    kind: "charge" as const,
    title: `Nuevo cargo: ${input.concept}`,
    body: `${formatMoney(input.amountCents, input.currency)}${day ? `, vence el ${day}` : ""}.`,
    href: "/dashboard/mi-cuenta",
  };
}

/** Cargo creado: al estudiante, en la aplicación y por correo (según su preferencia). */
export function notifyChargeCreated(institutionId: string, input: ChargeNotice) {
  return safely("cargo creado", () => notifySafely(chargeInput(institutionId, input)));
}

/**
 * Cargos creados en grupo: dentro de la transacción que los crea. Devuelve el correo pendiente,
 * que quien llama entrega con `deliverEmails` DESPUÉS de confirmar la transacción. Nunca lanza.
 */
export async function notifyChargesWithinTransaction(tx: Prisma.TransactionClient, institutionId: string, input: ChargeNotice): Promise<EmailRequest | null> {
  try {
    return (await notifyWithinTransaction(tx, chargeInput(institutionId, input))).email;
  } catch (error) {
    console.error("notificación «cargos creados» falló", { correlationId: crypto.randomUUID(), error });
    return null;
  }
}
