"use server";

import { auth } from "@/lib/auth";
import { type Capability } from "@/lib/capabilities";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForParticipation, courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { autoScoreAnswer, createCertificateIdentity, findScheduleConflicts, progressPercentage, reviewedExamScore } from "@/lib/lms";
import type { EdukanaRole } from "@/types/next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { questionSnapshot } from "@/server/exams";
import type { ActionState } from "@/app/dashboard/actions";

type SessionUser = { id: string; institutionId: string; role: EdukanaRole; capabilities: ReadonlySet<Capability> };
const failed = (message = "No se pudo completar la operación."): ActionState => ({ ok: false, message });
const success = (message: string): ActionState => ({ ok: true, message });
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optionalDate = (value: string) => value ? new Date(value) : null;

async function requireUser(capability?: Capability): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) throw new Error("No autorizado");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (capability && !capabilities.has(capability)) throw new Error("Permisos insuficientes");
  return { id: user.id, institutionId: user.institutionId, role: user.role, capabilities };
}

function managementCourseWhere(user: SessionUser) {
  return courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, user.capabilities))
    ?? { institutionId: user.institutionId, id: "__restricted__" };
}

function participationCourseWhere(user: SessionUser) {
  return courseWhereForParticipation(user.institutionId, user, user.capabilities)
    ?? { institutionId: user.institutionId, id: "__restricted__" };
}

async function manageableCourse(user: SessionUser, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, ...managementCourseWhere(user) },
    select: { id: true, periodId: true, teacherId: true, completionThreshold: true },
  });
}

export async function createCourse(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    if (user.role !== "TEACHER") return failed("En este piloto, cada docente crea sus propios cursos.");
    const parsed = z.object({
      periodId: z.string().min(1),
      name: z.string().trim().min(3).max(160),
      code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9._-]+$/),
      description: z.string().trim().max(2000).optional(),
    }).safeParse({ periodId: text(fd, "periodId"), name: text(fd, "name"), code: text(fd, "code"), description: text(fd, "description") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Revisa los datos del curso.");
    const period = await db.academicPeriod.findFirst({ where: { id: parsed.data.periodId, institutionId: user.institutionId, isActive: true }, select: { id: true } });
    if (!period) return failed("El período no está activo o pertenece a otra institución.");
    const course = await db.$transaction(async (tx) => {
      const created = await tx.course.create({ data: { institutionId: user.institutionId, periodId: period.id, teacherId: user.id, name: parsed.data.name, code: parsed.data.code.toUpperCase(), description: parsed.data.description || null }, select: { id: true } });
      await tx.auditLog.create({ data: { institutionId: user.institutionId, userId: user.id, action: "COURSE_CREATED", entity: "Course", entityId: created.id, changes: { periodId: period.id, teacherId: user.id } } });
      return created;
    });
    revalidatePath("/dashboard/aula");
    return success(`Curso creado. Ábrelo para agregar contenido y actividades. ID: ${course.id}`);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("createCourse failed", { correlationId, error });
    return failed(`No se pudo crear el curso. Verifica que el código no esté en uso. Código: ${correlationId}`);
  }
}

export async function enrollStudent(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("enrollment.manage");
    const parsed = z.object({ courseId: z.string().min(1), studentId: z.string().min(1) }).safeParse({ courseId: text(fd, "courseId"), studentId: text(fd, "studentId") });
    if (!parsed.success) return failed("Selecciona un estudiante válido.");
    const [course, student] = await Promise.all([
      manageableCourse(user, parsed.data.courseId),
      db.user.findFirst({ where: { id: parsed.data.studentId, institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!course || !student) return failed("El curso o estudiante no pertenece a tu institución o está fuera de tu alcance.");
    const existing = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: course.id } }, select: { id: true } });
    if (existing) return success("El estudiante ya está matriculado en este curso.");
    await db.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.create({ data: { institutionId: user.institutionId, studentId: student.id, courseId: course.id, status: "ACTIVE" }, select: { id: true } });
      await tx.auditLog.create({ data: { institutionId: user.institutionId, userId: user.id, action: "STUDENT_ENROLLED", entity: "Enrollment", entityId: enrollment.id, changes: { studentId: student.id, courseId: course.id } } });
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    revalidatePath("/dashboard/portal");
    return success("Estudiante matriculado.");
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("enrollStudent failed", { correlationId, error });
    return failed(`No se pudo matricular al estudiante. Código: ${correlationId}`);
  }
}

export async function createSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), title: z.string().min(3).max(120), description: z.string().max(500).optional() }).safeParse({ courseId: text(fd, "courseId"), title: text(fd, "title"), description: text(fd, "description") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const order = await db.courseSection.count({ where: { institutionId: user.institutionId, courseId: course.id } });
    await db.courseSection.create({ data: { institutionId: user.institutionId, courseId: course.id, title: parsed.data.title, description: parsed.data.description || null, order, isPublished: fd.get("isPublished") === "on" } });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Sección creada.");
  } catch { return failed(); }
}

export async function createLesson(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ sectionId: z.string().min(1), title: z.string().min(3).max(140), summary: z.string().max(500).optional(), content: z.string().max(50000).optional(), type: z.enum(["TEXT", "VIDEO", "DOCUMENT", "ACTIVITY"]), estimatedMinutes: z.coerce.number().int().min(1).max(600) }).safeParse({ sectionId: text(fd, "sectionId"), title: text(fd, "title"), summary: text(fd, "summary"), content: text(fd, "content"), type: text(fd, "type"), estimatedMinutes: text(fd, "estimatedMinutes") || "10" });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const section = await db.courseSection.findFirst({ where: { id: parsed.data.sectionId, institutionId: user.institutionId, course: managementCourseWhere(user) }, select: { id: true, courseId: true, _count: { select: { lessons: true } } } });
    if (!section) return failed("Sección no encontrada o sin acceso.");
    await db.lesson.create({ data: { institutionId: user.institutionId, courseId: section.courseId, sectionId: section.id, title: parsed.data.title, summary: parsed.data.summary || null, content: parsed.data.content || null, type: parsed.data.type, estimatedMinutes: parsed.data.estimatedMinutes, order: section._count.lessons, isPublished: fd.get("isPublished") === "on" } });
    revalidatePath(`/dashboard/aula/${section.courseId}`);
    return success("Lección creada.");
  } catch { return failed(); }
}

export async function saveAttendance(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const courseId = text(fd, "courseId");
    const dateText = text(fd, "date");
    const course = await manageableCourse(user, courseId);
    if (!course || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return failed("Curso o fecha inválidos.");
    const date = new Date(`${dateText}T00:00:00.000Z`);
    const enrollments = await db.enrollment.findMany({ where: { courseId, status: "ACTIVE", course: { institutionId: user.institutionId } }, select: { id: true } });
    const allowed = new Set(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
    await db.$transaction(async (tx) => {
      const session = await tx.attendanceSession.upsert({ where: { courseId_date: { courseId, date } }, create: { institutionId: user.institutionId, courseId, date, title: text(fd, "title") || null, recordedById: user.id }, update: { title: text(fd, "title") || null, recordedById: user.id } });
      for (const enrollment of enrollments) {
        const status = text(fd, `status_${enrollment.id}`);
        if (!allowed.has(status)) continue;
        await tx.attendance.upsert({ where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } }, create: { institutionId: user.institutionId, courseId, sessionId: session.id, enrollmentId: enrollment.id, date, status: status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED", notes: text(fd, `notes_${enrollment.id}`) || null }, update: { status: status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED", notes: text(fd, `notes_${enrollment.id}`) || null, date } });
      }
    });
    revalidatePath(`/dashboard/aula/${courseId}`);
    return success(`Asistencia guardada para ${enrollments.length} estudiantes.`);
  } catch { return failed(); }
}

export async function createGradebook(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), name: z.string().min(2).max(80), startDate: z.string().date(), endDate: z.string().date(), taskWeight: z.coerce.number().min(0).max(100), examWeight: z.coerce.number().min(0).max(100) }).refine((v) => v.taskWeight + v.examWeight === 100, "Las categorías deben sumar 100%.").safeParse({ courseId: text(fd, "courseId"), name: text(fd, "name"), startDate: text(fd, "startDate"), endDate: text(fd, "endDate"), taskWeight: text(fd, "taskWeight"), examWeight: text(fd, "examWeight") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    await db.gradingPeriod.create({ data: { institutionId: user.institutionId, courseId: course.id, academicPeriodId: course.periodId, name: parsed.data.name, startDate: new Date(`${parsed.data.startDate}T00:00:00Z`), endDate: new Date(`${parsed.data.endDate}T23:59:59Z`), categories: { create: [{ institutionId: user.institutionId, courseId: course.id, name: "Asignaciones", weight: parsed.data.taskWeight }, { institutionId: user.institutionId, courseId: course.id, name: "Exámenes", weight: parsed.data.examWeight }] } } });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Libro de calificaciones creado.");
  } catch { return failed("Ya existe ese período o los datos no son válidos."); }
}

export async function createAssignment(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), categoryId: z.string().optional(), title: z.string().min(3).max(140), instructions: z.string().min(10).max(30000), dueDate: z.string().optional(), maxScore: z.coerce.number().positive().max(10000) }).safeParse({ courseId: text(fd, "courseId"), categoryId: text(fd, "categoryId"), title: text(fd, "title"), instructions: text(fd, "instructions"), dueDate: text(fd, "dueDate"), maxScore: text(fd, "maxScore") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const category = parsed.data.categoryId ? await db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, institutionId: user.institutionId, courseId: course.id }, select: { id: true, gradingPeriodId: true } }) : null;
    const published = fd.get("isPublished") === "on";
    await db.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({ data: { institutionId: user.institutionId, courseId: course.id, title: parsed.data.title, description: parsed.data.instructions.slice(0, 500), instructions: parsed.data.instructions, dueDate: optionalDate(parsed.data.dueDate ?? ""), maxScore: parsed.data.maxScore, isPublished: published, publishedAt: published ? new Date() : null } });
      if (category) await tx.gradeItem.create({ data: { institutionId: user.institutionId, courseId: course.id, gradingPeriodId: category.gradingPeriodId, categoryId: category.id, assignmentId: assignment.id, title: assignment.title, maxScore: assignment.maxScore, dueDate: assignment.dueDate, isPublished: published } });
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Asignación creada.");
  } catch { return failed(); }
}

export async function submitAssignment(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.participate");
    const assignmentId = text(fd, "assignmentId");
    const assignment = await db.assignment.findFirst({ where: { id: assignmentId, isPublished: true, course: participationCourseWhere(user) }, select: { id: true, courseId: true, dueDate: true, allowLate: true } });
    if (!assignment) return failed("Asignación no disponible.");
    if (!assignment.allowLate && assignment.dueDate && assignment.dueDate < new Date()) return failed("El plazo de entrega cerró.");
    const content = text(fd, "content");
    if (content.length < 3 || content.length > 30000) return failed("La entrega debe tener entre 3 y 30,000 caracteres.");
    const enrollment = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: assignment.courseId } }, select: { id: true } });
    if (!enrollment) return failed("Matrícula no encontrada.");
    await db.submission.upsert({ where: { assignmentId_studentId: { assignmentId, studentId: user.id } }, create: { institutionId: user.institutionId, assignmentId, studentId: user.id, enrollmentId: enrollment.id, content, status: "SUBMITTED" }, update: { content, status: "SUBMITTED", submittedAt: new Date(), score: null, feedback: null, gradedAt: null } });
    revalidatePath(`/dashboard/aula/${assignment.courseId}`);
    return success("Entrega enviada para revisión.");
  } catch { return failed(); }
}

export async function reviewSubmission(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const submissionId = text(fd, "submissionId");
    const score = Number(text(fd, "score"));
    const feedback = text(fd, "feedback");
    const submission = await db.submission.findFirst({ where: { id: submissionId, assignment: { course: managementCourseWhere(user) } }, include: { assignment: { select: { courseId: true, maxScore: true, gradeItem: { select: { id: true } } } } } });
    if (!submission || !Number.isFinite(score) || score < 0 || score > submission.assignment.maxScore) return failed("Entrega o puntuación inválida.");
    await db.$transaction(async (tx) => {
      await tx.submission.update({ where: { id: submission.id }, data: { score, feedback: feedback || null, status: "GRADED", gradedAt: new Date() } });
      if (submission.assignment.gradeItem) await tx.gradeEntry.upsert({ where: { gradeItemId_enrollmentId: { gradeItemId: submission.assignment.gradeItem.id, enrollmentId: submission.enrollmentId } }, create: { institutionId: user.institutionId, gradeItemId: submission.assignment.gradeItem.id, enrollmentId: submission.enrollmentId, score, feedback: feedback || null, gradedById: user.id }, update: { score, feedback: feedback || null, gradedById: user.id, gradedAt: new Date() } });
    });
    revalidatePath(`/dashboard/aula/${submission.assignment.courseId}`);
    return success("Entrega calificada.");
  } catch { return failed(); }
}

export async function createQuestion(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]), prompt: z.string().min(5).max(10000), answerKey: z.string().min(1).max(5000), options: z.string().max(5000).optional(), points: z.coerce.number().positive().max(1000) }).safeParse({ courseId: text(fd, "courseId"), type: text(fd, "type"), prompt: text(fd, "prompt"), answerKey: text(fd, "answerKey"), options: text(fd, "options"), points: text(fd, "points") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const options = parsed.data.type === "MULTIPLE_CHOICE" ? (parsed.data.options ?? "").split("\n").map((v) => v.trim()).filter(Boolean) : parsed.data.type === "TRUE_FALSE" ? ["Verdadero", "Falso"] : null;
    if (parsed.data.type === "MULTIPLE_CHOICE" && (!options || options.length < 2 || !options.includes(parsed.data.answerKey))) return failed("Incluye al menos dos opciones y una respuesta exacta.");
    await db.questionBankItem.create({ data: { institutionId: user.institutionId, courseId: course.id, type: parsed.data.type, prompt: parsed.data.prompt, answerKey: parsed.data.answerKey, options: options ?? undefined, defaultPoints: parsed.data.points } });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Pregunta agregada al banco.");
  } catch { return failed(); }
}

export async function createExam(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), categoryId: z.string().optional(), title: z.string().min(3).max(140), instructions: z.string().max(20000).optional(), maxAttempts: z.coerce.number().int().min(1).max(10), durationMinutes: z.coerce.number().int().min(1).max(600) }).safeParse({ courseId: text(fd, "courseId"), categoryId: text(fd, "categoryId"), title: text(fd, "title"), instructions: text(fd, "instructions"), maxAttempts: text(fd, "maxAttempts") || "1", durationMinutes: text(fd, "durationMinutes") || "60" });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const bank = await db.questionBankItem.findMany({ where: { institutionId: user.institutionId, courseId: course.id }, orderBy: { createdAt: "asc" }, take: 100 });
    if (!bank.length) return failed("Agrega preguntas al banco antes de crear el examen.");
    const category = parsed.data.categoryId ? await db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, institutionId: user.institutionId, courseId: course.id }, select: { id: true, gradingPeriodId: true } }) : null;
    const published = fd.get("isPublished") === "on";
    await db.$transaction(async (tx) => {
      const exam = await tx.exam.create({ data: { institutionId: user.institutionId, courseId: course.id, title: parsed.data.title, instructions: parsed.data.instructions || null, maxAttempts: parsed.data.maxAttempts, durationMinutes: parsed.data.durationMinutes, isPublished: published, questions: { create: bank.map((question, order) => ({ institutionId: user.institutionId, bankItemId: question.id, order, points: question.defaultPoints, snapshot: questionSnapshot(question, question.defaultPoints) })) } } });
      if (category) await tx.gradeItem.create({ data: { institutionId: user.institutionId, courseId: course.id, gradingPeriodId: category.gradingPeriodId, categoryId: category.id, examId: exam.id, title: exam.title, maxScore: bank.reduce((sum, q) => sum + q.defaultPoints, 0), isPublished: published } });
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Examen creado con el banco actual.");
  } catch { return failed(); }
}

/**
 * @deprecated Crea el intento al enviar, por lo que no puede aplicar el tiempo del examen.
 * La pantalla debe pasar a `startExamAttemptAction` y `submitExamAttemptAction`
 * (`src/server/actions/exams.ts`); cuando lo haga, esta acción se elimina.
 */
export async function submitExam(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.participate");
    const examId = text(fd, "examId");
    const exam = await db.exam.findFirst({ where: { id: examId, institutionId: user.institutionId, isPublished: true, course: participationCourseWhere(user) }, include: { questions: { include: { bankItem: true }, orderBy: { order: "asc" } }, attempts: { where: { studentId: user.id }, select: { attemptNumber: true } }, gradeItem: { select: { id: true } }, course: { select: { teacherId: true } } } });
    if (!exam || !exam.questions.length || exam.attempts.length >= exam.maxAttempts) return failed("Examen no disponible o intentos agotados.");
    const now = new Date();
    if ((exam.opensAt && now < exam.opensAt) || (exam.closesAt && now > exam.closesAt)) return failed("El examen está fuera de su ventana de disponibilidad.");
    const enrollment = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: exam.courseId } }, select: { id: true } });
    if (!enrollment) return failed("Matrícula no encontrada.");
    let total = 0; let score = 0; let needsReview = false;
    const answers = exam.questions.map(({ bankItem, points }) => {
      const response = text(fd, `question_${bankItem.id}`);
      total += points;
      const result = autoScoreAnswer(bankItem.type, response, bankItem.answerKey, points);
      if (result.score === null) needsReview = true; else score += result.score;
      return { institutionId: user.institutionId, bankItemId: bankItem.id, response, score: result.score, isCorrect: result.isCorrect };
    });
    const attempt = await db.examAttempt.create({ data: { institutionId: user.institutionId, examId: exam.id, enrollmentId: enrollment.id, studentId: user.id, attemptNumber: Math.max(0, ...exam.attempts.map((a) => a.attemptNumber)) + 1, status: needsReview ? "SUBMITTED" : "GRADED", score, maxScore: total, submittedAt: now, answers: { create: answers } } });
    if (!needsReview && exam.gradeItem) await db.gradeEntry.upsert({ where: { gradeItemId_enrollmentId: { gradeItemId: exam.gradeItem.id, enrollmentId: enrollment.id } }, create: { institutionId: user.institutionId, gradeItemId: exam.gradeItem.id, enrollmentId: enrollment.id, score, gradedById: exam.course.teacherId }, update: { score, gradedById: exam.course.teacherId, gradedAt: now } });
    revalidatePath(`/dashboard/aula/${exam.courseId}`);
    return success(needsReview ? `Intento ${attempt.attemptNumber} enviado para revisión.` : `Intento calificado: ${score}/${total}.`);
  } catch { return failed(); }
}

export async function reviewExamAttempt(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const attemptId = text(fd, "attemptId");
    const attempt = await db.examAttempt.findFirst({
      where: { id: attemptId, institutionId: user.institutionId, status: "SUBMITTED", exam: { course: managementCourseWhere(user) } },
      include: {
        answers: { include: { bankItem: { select: { type: true } } } },
        exam: { select: { courseId: true, gradeItem: { select: { id: true } }, questions: { select: { bankItemId: true, points: true } } } },
      },
    });
    if (!attempt) return failed("Intento no encontrado o ya revisado.");
    const points = new Map(attempt.exam.questions.map((question) => [question.bankItemId, question.points]));
    const reviewed = attempt.answers.map((answer) => ({
      answer,
      points: points.get(answer.bankItemId) ?? 0,
      automaticScore: answer.score,
      manualScore: answer.bankItem.type === "SHORT_ANSWER" ? (text(fd, `score_${answer.id}`) ? Number(text(fd, `score_${answer.id}`)) : undefined) : undefined,
      feedback: answer.bankItem.type === "SHORT_ANSWER" ? text(fd, `feedback_${answer.id}`) : answer.feedback ?? "",
    }));
    const score = reviewedExamScore(reviewed.map((answer) => ({ automaticScore: answer.automaticScore, manualScore: answer.manualScore, points: answer.points })));
    if (score == null) return failed("Completa todas las puntuaciones dentro de su rango permitido.");
    await db.$transaction(async (tx) => {
      for (const answer of reviewed.filter((item) => item.answer.bankItem.type === "SHORT_ANSWER")) {
        await tx.examAnswer.update({ where: { id: answer.answer.id }, data: { score: answer.manualScore, feedback: answer.feedback || null } });
      }
      await tx.examAttempt.update({ where: { id: attempt.id }, data: { status: "GRADED", score } });
      if (attempt.exam.gradeItem) await tx.gradeEntry.upsert({
        where: { gradeItemId_enrollmentId: { gradeItemId: attempt.exam.gradeItem.id, enrollmentId: attempt.enrollmentId } },
        create: { institutionId: user.institutionId, gradeItemId: attempt.exam.gradeItem.id, enrollmentId: attempt.enrollmentId, score, gradedById: user.id },
        update: { score, gradedById: user.id, gradedAt: new Date() },
      });
    });
    revalidatePath(`/dashboard/aula/${attempt.exam.courseId}`);
    return success(`Examen revisado: ${score}/${attempt.maxScore ?? score}.`);
  } catch { return failed(); }
}


export async function saveScheduleSlot(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), weekday: z.coerce.number().int().min(1).max(7), startMinutes: z.coerce.number().int().min(0).max(1439), endMinutes: z.coerce.number().int().min(1).max(1440), classroom: z.string().min(1).max(100) }).safeParse({ courseId: text(fd, "courseId"), weekday: text(fd, "weekday"), startMinutes: text(fd, "startMinutes"), endMinutes: text(fd, "endMinutes"), classroom: text(fd, "classroom") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const existing = await db.scheduleSlot.findMany({ where: { institutionId: user.institutionId, weekday: parsed.data.weekday }, select: { id: true, teacherId: true, classroom: true, weekday: true, startMinutes: true, endMinutes: true } });
    const candidate = { ...parsed.data, teacherId: course.teacherId };
    const conflicts = findScheduleConflicts(candidate, existing);
    if (conflicts.length) return failed(`Conflicto de ${conflicts.map((c) => c.type === "TEACHER" ? "docente" : c.type === "CLASSROOM" ? "aula" : "horario").join(" y ")}.`);
    await db.scheduleSlot.create({ data: { institutionId: user.institutionId, courseId: course.id, teacherId: course.teacherId, weekday: parsed.data.weekday, startMinutes: parsed.data.startMinutes, endMinutes: parsed.data.endMinutes, classroom: parsed.data.classroom } });
    revalidatePath("/dashboard/calendario");
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Horario guardado sin conflictos.");
  } catch { return failed(); }
}

export async function togglePublication(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const entity = text(fd, "entity"); const id = text(fd, "id"); const publish = text(fd, "publish") === "true";
    if (entity === "period") {
      const item = await db.gradingPeriod.findFirst({ where: { id, institutionId: user.institutionId, course: managementCourseWhere(user) }, select: { id: true, courseId: true } });
      if (!item) return failed("Período no encontrado.");
      await db.gradingPeriod.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null } });
      revalidatePath(`/dashboard/aula/${item.courseId}`);
    } else if (entity === "assignment") {
      const item = await db.assignment.findFirst({ where: { id, course: managementCourseWhere(user) }, select: { id: true, courseId: true } });
      if (!item) return failed("Asignación no encontrada.");
      await db.assignment.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null, gradeItem: { update: { isPublished: publish } } } }).catch(async () => db.assignment.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null } }));
      revalidatePath(`/dashboard/aula/${item.courseId}`);
    } else return failed("Tipo de publicación inválido.");
    return success(publish ? "Contenido publicado." : "Contenido retirado.");
  } catch { return failed(); }
}

export async function markLessonComplete(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.participate");
    const lessonId = text(fd, "lessonId");
    const lesson = await db.lesson.findFirst({ where: { id: lessonId, institutionId: user.institutionId, isPublished: true, section: { isPublished: true }, course: participationCourseWhere(user) }, select: { id: true, courseId: true } });
    if (!lesson) return failed("Lección no disponible.");
    const enrollment = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: lesson.courseId } }, select: { id: true, status: true } });
    if (!enrollment || enrollment.status !== "ACTIVE") return failed("Matrícula activa no encontrada.");
    await db.lessonProgress.upsert({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } }, create: { institutionId: user.institutionId, enrollmentId: enrollment.id, lessonId, completed: true, completedAt: new Date() }, update: { completed: true, completedAt: new Date(), watchedSeconds: Math.max(0, Number(text(fd, "watchedSeconds")) || 0) } });
    const [completed, total] = await Promise.all([db.lessonProgress.count({ where: { enrollmentId: enrollment.id, completed: true, institutionId: user.institutionId } }), db.lesson.count({ where: { courseId: lesson.courseId, institutionId: user.institutionId, isPublished: true, section: { isPublished: true } } })]);
    const percent = progressPercentage(completed, total);
    await db.enrollment.update({ where: { id: enrollment.id }, data: { progressPercent: percent } });
    revalidatePath(`/dashboard/aula/${lesson.courseId}`);
    revalidatePath("/dashboard/portal");
    return success(`Progreso actualizado: ${percent}%. El curso sigue activo hasta que el docente lo finalice.`);
  } catch { return failed(); }
}

export async function setEnrollmentCompletion(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ enrollmentId: z.string().min(1), action: z.enum(["COMPLETE", "REOPEN"]) }).safeParse({ enrollmentId: text(fd, "enrollmentId"), action: text(fd, "action") });
    if (!parsed.success) return failed("Matrícula o acción inválida.");
    const enrollment = await db.enrollment.findFirst({
      where: { id: parsed.data.enrollmentId, course: managementCourseWhere(user) },
      select: { id: true, courseId: true, status: true, progressPercent: true, completedAt: true, course: { select: { completionThreshold: true } } },
    });
    if (!enrollment) return failed("Matrícula no encontrada o sin acceso.");
    if (parsed.data.action === "COMPLETE" && (enrollment.status !== "ACTIVE" || enrollment.progressPercent < enrollment.course.completionThreshold)) return failed("La matrícula activa todavía no cumple el progreso requerido.");
    if (parsed.data.action === "REOPEN" && enrollment.status !== "COMPLETED") return failed("Solo se puede reabrir una matrícula completada.");
    const nextStatus = parsed.data.action === "COMPLETE" ? "COMPLETED" : "ACTIVE";
    await db.$transaction(async (tx) => {
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: nextStatus, completedAt: nextStatus === "COMPLETED" ? new Date() : null } });
      await tx.auditLog.create({ data: { institutionId: user.institutionId, userId: user.id, action: nextStatus === "COMPLETED" ? "ENROLLMENT_COMPLETED" : "ENROLLMENT_REOPENED", entity: "Enrollment", entityId: enrollment.id, changes: { before: { status: enrollment.status, completedAt: enrollment.completedAt }, after: { status: nextStatus } } } });
    });
    revalidatePath(`/dashboard/aula/${enrollment.courseId}`);
    revalidatePath("/dashboard/portal");
    revalidatePath("/dashboard/hijos");
    return success(nextStatus === "COMPLETED" ? "Curso finalizado. La participación quedó en consulta." : "Curso reabierto. El estudiante puede volver a participar.");
  } catch { return failed(); }
}

export async function issueCertificate(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const enrollmentId = text(fd, "enrollmentId");
    const enrollment = await db.enrollment.findFirst({ where: { id: enrollmentId, course: managementCourseWhere(user) }, include: { course: { select: { id: true, completionThreshold: true } }, student: { select: { name: true } } } });
    if (!enrollment || (enrollment.status !== "COMPLETED" && enrollment.progressPercent < enrollment.course.completionThreshold)) return failed("El curso todavía no cumple los criterios de finalización.");
    const secret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET;
    if (!secret) return failed("Falta CERTIFICATE_SECRET o AUTH_SECRET.");
    const identity = createCertificateIdentity(enrollment.id, enrollment.courseId, secret);
    const certificate = await db.certificate.upsert({ where: { enrollmentId_courseId: { enrollmentId: enrollment.id, courseId: enrollment.courseId } }, create: { institutionId: user.institutionId, courseId: enrollment.courseId, enrollmentId: enrollment.id, issuedById: user.id, verificationCode: identity.code, verificationHash: identity.verificationHash, metadata: { studentName: enrollment.student.name } }, update: { issuedById: user.id, verificationCode: identity.code, verificationHash: identity.verificationHash, issuedAt: new Date(), revokedAt: null, metadata: { studentName: enrollment.student.name } } });
    revalidatePath(`/dashboard/aula/${enrollment.courseId}`);
    return success(`Certificado emitido: ${certificate.verificationCode}`);
  } catch { return failed(); }
}
