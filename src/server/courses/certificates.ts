import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { createCertificateIdentity, verifyCertificateIdentity } from "@/lib/lms";
import { loadGradebook, loadMyGrades } from "@/server/assessment/gradebook";
import { progressPercentOf } from "@/server/courses/enrollment";
import { notifyCertificatesIssued } from "@/server/notifications/events";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Tx = Prisma.TransactionClient;
type EnrollmentStatus = "ACTIVE" | "DROPPED" | "COMPLETED" | "FAILED";

export type CertificateState = "issued" | "eligible" | "pending";
export type CertificateRow = {
  enrollmentId: string;
  studentId: string;
  name: string;
  status: EnrollmentStatus;
  progressPercent: number;
  /** Nota actual del curso, de 0 a 100; null si aún no tiene notas. */
  grade: number | null;
  state: CertificateState;
  /** Con `pending`: qué le falta, en palabras. */
  missing: string;
  certificate: { code: string; issuedAt: Date } | null;
  /** Certificado anulado que ya no verifica (se puede volver a emitir). */
  revoked: { at: Date; reason: string } | null;
};
export type CourseCertificates = {
  course: { id: string; name: string; completionThreshold: number };
  timezone: string;
  hasGrades: boolean;
  rows: CertificateRow[];
};
export type CertificateResult = { ok: true } | { ok: false; message: string };
export type IssueResult = { ok: true; issued: number; already: number; code: string | null } | { ok: false; message: string };
export type IssueAllResult = { ok: true; issued: number; already: number } | { ok: false; message: string };

export type MyCourseCertificate = {
  course: { id: string; name: string; completionThreshold: number };
  timezone: string;
  progressPercent: number;
  grade: number | null;
  hasGrades: boolean;
  certificate: { code: string; issuedAt: Date } | null;
  /** Cumple los requisitos pero su docente aún no lo ha emitido. */
  eligible: boolean;
  missing: string;
  /** La matrícula figura como curso completado. */
  completed: boolean;
};
export type MyCertificate = { code: string; issuedAt: Date; courseId: string; courseName: string };

export type CertificateVerification =
  | { status: "valid"; code: string; studentName: string; courseName: string; institutionName: string; issuedAt: Date; timezone: string }
  | { status: "revoked" | "invalid"; code: string; institutionName: string }
  | { status: "not_found" };

const NO_ACCESS = "No encontramos ese curso o no tienes permiso para gestionarlo.";
const NO_STUDENT = "No encontramos a ese estudiante en este curso.";
const NO_SECRET = "Los certificados no están disponibles en este momento. Avisa a quien administra la plataforma.";
const MAX_REASON = 500;
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

const secret = () => process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET ?? "";

/** Curso de la institución de quien actúa, solo si lo gestiona (su docente o quien ve todos los cursos). */
async function manageableCourse(actor: Actor, courseId: string) {
  if (!courseId || !actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({
    where: { AND: [where, { id: courseId }] },
    select: { id: true, name: true, completionThreshold: true, institution: { select: { timezone: true } } },
  });
}

/** Serializa las emisiones del mismo curso para que dos clics a la vez no dupliquen ni se pisen. */
async function lockCourse(tx: Tx, institutionId: string, courseId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "courses" WHERE "id" = ${courseId} AND "institutionId" = ${institutionId} FOR UPDATE`;
  return rows.length > 0;
}

/** Qué le falta a una matrícula para recibir el certificado; cadena vacía si ya cumple. */
export function missingForCertificate(status: EnrollmentStatus, progressPercent: number, threshold: number, who: "student" | "staff" = "staff") {
  const own = who === "student";
  if (status === "COMPLETED") return "";
  if (status === "DROPPED") return own ? "Te retiraste de este curso." : "Se retiró del curso.";
  if (status === "FAILED") return own ? "Figuras como no aprobado en este curso." : "Figura como no aprobado en el curso.";
  if (progressPercent >= threshold) return "";
  return own
    ? `Llevas ${progressPercent}% del curso y necesitas llegar a ${threshold}%. Completa las lecciones que te faltan.`
    : `Lleva ${progressPercent}% del curso y necesita ${threshold}%.`;
}

const asObject = (metadata: Prisma.JsonValue): Prisma.JsonObject => (metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {});
const revokeReasonOf = (metadata: Prisma.JsonValue) => {
  const reason = asObject(metadata).revokeReason;
  return typeof reason === "string" ? reason : "";
};

/** Avance real por matrícula: lecciones publicadas completadas sobre lecciones publicadas. */
async function progressByEnrollment(courseId: string, enrollmentIds?: string[]) {
  const publishedLesson = { courseId, isPublished: true, section: { isPublished: true } };
  const [published, completed] = await Promise.all([
    db.lesson.count({ where: publishedLesson }),
    db.lessonProgress.groupBy({
      by: ["enrollmentId"],
      where: { completed: true, lesson: publishedLesson, ...(enrollmentIds ? { enrollmentId: { in: enrollmentIds } } : {}) },
      _count: { _all: true },
    }),
  ]);
  const done = new Map(completed.map((row) => [row.enrollmentId, row._count._all]));
  return (enrollmentId: string, stored: number) => progressPercentOf(done.get(enrollmentId) ?? 0, published, stored);
}

/**
 * Inscritos del curso con avance, nota actual y estado de su certificado.
 * Devuelve null si quien actúa no gestiona el curso.
 */
export async function listCourseCertificates(actor: Actor, courseId: string): Promise<CourseCertificates | null> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;

  const [enrollments, gradebook, progressOf] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: course.id, OR: [{ status: { not: "DROPPED" } }, { certificates: { some: { revokedAt: null } } }] },
      select: {
        id: true,
        studentId: true,
        status: true,
        progressPercent: true,
        student: { select: { name: true } },
        certificates: { where: { courseId: course.id }, select: { verificationCode: true, issuedAt: true, revokedAt: true, metadata: true } },
      },
      orderBy: { student: { name: "asc" } },
    }),
    loadGradebook(actor, course.id),
    progressByEnrollment(course.id),
  ]);
  const gradeBy = new Map((gradebook?.students ?? []).map((student) => [student.enrollmentId, student.average]));

  const rows = enrollments.map((enrollment): CertificateRow => {
    const status = enrollment.status as EnrollmentStatus;
    const progressPercent = progressOf(enrollment.id, enrollment.progressPercent);
    const certificate = enrollment.certificates[0] ?? null;
    const active = certificate && !certificate.revokedAt ? { code: certificate.verificationCode, issuedAt: certificate.issuedAt } : null;
    const missing = active ? "" : missingForCertificate(status, progressPercent, course.completionThreshold);
    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      name: enrollment.student.name,
      status,
      progressPercent,
      grade: gradeBy.get(enrollment.id) ?? null,
      state: active ? "issued" : missing ? "pending" : "eligible",
      missing,
      certificate: active,
      revoked: certificate?.revokedAt ? { at: certificate.revokedAt, reason: revokeReasonOf(certificate.metadata) } : null,
    };
  });

  return {
    course: { id: course.id, name: course.name, completionThreshold: course.completionThreshold },
    timezone: course.institution.timezone,
    hasGrades: (gradebook?.items.length ?? 0) > 0,
    rows,
  };
}

/**
 * El docente da el curso por completado para un estudiante, aunque no haya marcado todas las
 * lecciones (por ejemplo, si las vio en clase). Desde ese momento cumple los requisitos.
 */
export async function markCourseCompleted(actor: Actor, courseId: string, enrollmentId: string, now = new Date()): Promise<CertificateResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  return db.$transaction(async (tx) => {
    if (!(await lockCourse(tx, actor.institutionId, course.id))) return { ok: false, message: NO_ACCESS } as const;
    const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, courseId: course.id }, select: { id: true, studentId: true, status: true } });
    if (!enrollment) return { ok: false, message: NO_STUDENT } as const;
    if (enrollment.status === "COMPLETED") return { ok: true } as const;
    if (enrollment.status !== "ACTIVE") return { ok: false, message: "Solo se puede marcar como completado a un estudiante activo en el curso." } as const;
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", completedAt: now } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "COURSE_MARKED_COMPLETED", entity: "Enrollment", entityId: enrollment.id, changes: { courseId: course.id, studentId: enrollment.studentId } },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Deshace «Marcar curso como completado». No se permite mientras tenga un certificado vigente. */
export async function reopenCourseCompletion(actor: Actor, courseId: string, enrollmentId: string): Promise<CertificateResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  return db.$transaction(async (tx) => {
    if (!(await lockCourse(tx, actor.institutionId, course.id))) return { ok: false, message: NO_ACCESS } as const;
    const enrollment = await tx.enrollment.findFirst({
      where: { id: enrollmentId, courseId: course.id },
      select: { id: true, studentId: true, status: true, certificates: { where: { revokedAt: null }, select: { id: true } } },
    });
    if (!enrollment) return { ok: false, message: NO_STUDENT } as const;
    if (enrollment.status === "ACTIVE") return { ok: true } as const;
    if (enrollment.status !== "COMPLETED") return { ok: false, message: "Este estudiante no figura con el curso completado." } as const;
    if (enrollment.certificates.length) return { ok: false, message: "Este estudiante ya tiene su certificado. Anúlalo primero si quieres reabrir el curso." } as const;
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", completedAt: null } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "COURSE_COMPLETION_REOPENED", entity: "Enrollment", entityId: enrollment.id, changes: { courseId: course.id, studentId: enrollment.studentId } },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/**
 * Emite los certificados de las matrículas indicadas, que ya deben cumplir los requisitos.
 * Quien ya tiene uno vigente se queda con el mismo código. Si tenía uno anulado, recibe un
 * código nuevo: el enlace anulado no vuelve a verificar.
 */
async function issueFor(actor: Actor, courseId: string, rows: CertificateRow[], action: string, now: Date) {
  const key = secret();
  return db.$transaction(async (tx) => {
    if (!(await lockCourse(tx, actor.institutionId, courseId))) return null;
    const existing = await tx.certificate.findMany({
      where: { courseId, enrollmentId: { in: rows.map((row) => row.enrollmentId) } },
      select: { id: true, enrollmentId: true, verificationCode: true, revokedAt: true },
    });
    const byEnrollment = new Map(existing.map((certificate) => [certificate.enrollmentId, certificate]));
    const codes = new Map<string, string>();
    const issuedTo: string[] = [];
    for (const row of rows) {
      const current = byEnrollment.get(row.enrollmentId);
      if (current && !current.revokedAt) {
        codes.set(row.enrollmentId, current.verificationCode);
        continue;
      }
      const identity = createCertificateIdentity(row.enrollmentId, courseId, key);
      const data = {
        issuedById: actor.id,
        verificationCode: identity.code,
        verificationHash: identity.verificationHash,
        issuedAt: now,
        revokedAt: null,
        metadata: { studentName: row.name, progressPercent: row.progressPercent, grade: row.grade },
      };
      if (current) await tx.certificate.update({ where: { id: current.id }, data });
      else await tx.certificate.create({ data: { ...data, institutionId: actor.institutionId, courseId, enrollmentId: row.enrollmentId } });
      codes.set(row.enrollmentId, identity.code);
      issuedTo.push(row.enrollmentId);
    }
    if (issuedTo.length) {
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action, entity: "Course", entityId: courseId, changes: { issued: issuedTo.length, enrollmentIds: issuedTo } },
      });
    }
    return { issued: issuedTo.length, already: rows.length - issuedTo.length, codes, issuedTo };
  }, rowLocked);
}

/** Emite el certificado de un estudiante inscrito que cumple los requisitos. Repetirlo no cambia nada. */
export async function issueCertificate(actor: Actor, courseId: string, enrollmentId: string, now = new Date()): Promise<IssueResult> {
  const data = await listCourseCertificates(actor, courseId);
  if (!data) return { ok: false, message: NO_ACCESS };
  const row = data.rows.find((entry) => entry.enrollmentId === enrollmentId);
  if (!row) return { ok: false, message: NO_STUDENT };
  if (row.state === "issued") return { ok: true, issued: 0, already: 1, code: row.certificate?.code ?? null };
  if (row.state === "pending") return { ok: false, message: `${row.name} todavía no cumple los requisitos. ${row.missing}` };
  if (!secret()) return { ok: false, message: NO_SECRET };
  const result = await issueFor(actor, data.course.id, [row], "CERTIFICATE_ISSUED", now);
  if (!result) return { ok: false, message: NO_ACCESS };
  await notifyCertificatesIssued(actor.institutionId, { courseId: data.course.id, enrollmentIds: result.issuedTo });
  return { ok: true, issued: result.issued, already: result.already, code: result.codes.get(row.enrollmentId) ?? null };
}

/** Emite el certificado a todos los que cumplen los requisitos y aún no lo tienen. */
export async function issueCertificatesToEligible(actor: Actor, courseId: string, now = new Date()): Promise<IssueAllResult> {
  const data = await listCourseCertificates(actor, courseId);
  if (!data) return { ok: false, message: NO_ACCESS };
  const eligible = data.rows.filter((row) => row.state === "eligible");
  const already = data.rows.filter((row) => row.state === "issued").length;
  if (!eligible.length) return { ok: true, issued: 0, already };
  if (!secret()) return { ok: false, message: NO_SECRET };
  const result = await issueFor(actor, data.course.id, eligible, "CERTIFICATES_ISSUED_TO_ELIGIBLE", now);
  if (!result) return { ok: false, message: NO_ACCESS };
  await notifyCertificatesIssued(actor.institutionId, { courseId: data.course.id, enrollmentIds: result.issuedTo });
  return { ok: true, issued: result.issued, already: already + result.already };
}

/**
 * Anula un certificado: queda marcado como anulado con su motivo y el enlace público deja de
 * verificar. No se borra, para que quede constancia de que existió.
 */
export async function revokeCertificate(actor: Actor, courseId: string, enrollmentId: string, reason: string, now = new Date()): Promise<CertificateResult> {
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, message: "Escribe el motivo de la anulación." };
  if (cleanReason.length > MAX_REASON) return { ok: false, message: "El motivo es demasiado largo." };
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  return db.$transaction(async (tx) => {
    if (!(await lockCourse(tx, actor.institutionId, course.id))) return { ok: false, message: NO_ACCESS } as const;
    const certificate = await tx.certificate.findFirst({
      where: { enrollmentId, courseId: course.id, institutionId: actor.institutionId },
      select: { id: true, verificationCode: true, revokedAt: true, metadata: true },
    });
    if (!certificate) return { ok: false, message: "Este estudiante no tiene un certificado emitido en este curso." } as const;
    if (certificate.revokedAt) return { ok: true } as const;
    const metadata = { ...asObject(certificate.metadata), revokeReason: cleanReason } as Prisma.InputJsonObject;
    await tx.certificate.update({ where: { id: certificate.id }, data: { revokedAt: now, metadata } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "CERTIFICATE_REVOKED",
        entity: "Certificate",
        entityId: certificate.id,
        changes: { courseId: course.id, enrollmentId, code: certificate.verificationCode, reason: cleanReason },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/**
 * Lo que ve un estudiante en su curso: su certificado si existe, o qué le falta.
 * Exige matrícula propia en ese curso de su institución; si no, null.
 */
export async function getMyCourseCertificate(actor: Actor, courseId: string): Promise<MyCourseCertificate | null> {
  if (actor.role !== "STUDENT" || !actor.institutionId || !courseId) return null;
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: actor.id, courseId, institutionId: actor.institutionId, course: { institutionId: actor.institutionId } },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      course: { select: { id: true, name: true, completionThreshold: true, isPublished: true, institution: { select: { timezone: true } } } },
      certificates: { where: { courseId, revokedAt: null }, select: { verificationCode: true, issuedAt: true } },
    },
  });
  if (!enrollment) return null;
  const certificate = enrollment.certificates[0] ?? null;
  const status = enrollment.status as EnrollmentStatus;
  // Sin certificado, el curso solo se muestra a quien sigue en él y está publicado.
  if (!certificate && (!enrollment.course.isPublished || (status !== "ACTIVE" && status !== "COMPLETED"))) return null;

  const [progressOf, grades] = await Promise.all([progressByEnrollment(courseId, [enrollment.id]), loadMyGrades(actor, courseId)]);
  const progressPercent = progressOf(enrollment.id, enrollment.progressPercent);
  const missing = certificate ? "" : missingForCertificate(status, progressPercent, enrollment.course.completionThreshold, "student");
  return {
    course: { id: enrollment.course.id, name: enrollment.course.name, completionThreshold: enrollment.course.completionThreshold },
    timezone: enrollment.course.institution.timezone,
    progressPercent,
    grade: grades?.average ?? null,
    hasGrades: (grades?.groups.length ?? 0) > 0,
    certificate: certificate ? { code: certificate.verificationCode, issuedAt: certificate.issuedAt } : null,
    eligible: !certificate && !missing,
    missing,
    completed: status === "COMPLETED",
  };
}

/** Todos los certificados vigentes de quien consulta, y solo los suyos. */
export async function listMyCertificates(actor: Actor): Promise<{ timezone: string; certificates: MyCertificate[] }> {
  if (!actor.institutionId) return { timezone: "UTC", certificates: [] };
  const [institution, certificates] = await Promise.all([
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { timezone: true } }),
    db.certificate.findMany({
      where: { institutionId: actor.institutionId, revokedAt: null, enrollment: { studentId: actor.id } },
      select: { verificationCode: true, issuedAt: true, course: { select: { id: true, name: true } } },
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  return {
    timezone: institution?.timezone ?? "UTC",
    certificates: certificates.map((certificate) => ({ code: certificate.verificationCode, issuedAt: certificate.issuedAt, courseId: certificate.course.id, courseName: certificate.course.name })),
  };
}

/**
 * Verificación pública de un código. Solo un certificado vigente y con firma correcta devuelve
 * el nombre de la persona; uno anulado o alterado no expone a nadie.
 */
export async function verifyCertificateCode(rawCode: string): Promise<CertificateVerification> {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code || code.length > 40) return { status: "not_found" };
  const certificate = await db.certificate.findUnique({
    where: { verificationCode: code },
    select: {
      verificationCode: true,
      verificationHash: true,
      enrollmentId: true,
      courseId: true,
      issuedAt: true,
      revokedAt: true,
      institution: { select: { name: true, timezone: true } },
      course: { select: { name: true } },
      enrollment: { select: { student: { select: { name: true } } } },
    },
  });
  if (!certificate) return { status: "not_found" };
  const institutionName = certificate.institution.name;
  if (certificate.revokedAt) return { status: "revoked", code, institutionName };
  const key = secret();
  if (!key || !verifyCertificateIdentity(certificate.verificationCode, certificate.enrollmentId, certificate.courseId, key, certificate.verificationHash)) {
    return { status: "invalid", code, institutionName };
  }
  return {
    status: "valid",
    code,
    studentName: certificate.enrollment.student.name,
    courseName: certificate.course.name,
    institutionName,
    issuedAt: certificate.issuedAt,
    timezone: certificate.institution.timezone,
  };
}
