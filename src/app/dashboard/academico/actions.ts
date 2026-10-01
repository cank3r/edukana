"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoScoreAnswer, createCertificateIdentity, findScheduleConflicts, progressPercentage, reviewedExamScore } from "@/lib/lms";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/dashboard/actions";

type SessionUser = { id: string; institutionId: string; role: string };
const staffRoles = ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER"];
const failed = (message = "No se pudo completar la operación."): ActionState => ({ ok: false, message });
const success = (message: string): ActionState => ({ ok: true, message });
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optionalDate = (value: string) => value ? new Date(value) : null;

async function requireUser(roles?: string[]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || !user.institutionId) throw new Error("No autorizado");
  if (roles && !roles.includes(user.role)) throw new Error("Permisos insuficientes");
  return user;
}

async function manageableCourse(user: SessionUser, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) },
    select: { id: true, periodId: true, teacherId: true, completionThreshold: true },
  });
}

export async function createSection(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(staffRoles);
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
    const user = await requireUser(staffRoles);
    const parsed = z.object({ sectionId: z.string().min(1), title: z.string().min(3).max(140), summary: z.string().max(500).optional(), content: z.string().max(50000).optional(), type: z.enum(["TEXT", "VIDEO", "DOCUMENT", "ACTIVITY"]), estimatedMinutes: z.coerce.number().int().min(1).max(600) }).safeParse({ sectionId: text(fd, "sectionId"), title: text(fd, "title"), summary: text(fd, "summary"), content: text(fd, "content"), type: text(fd, "type"), estimatedMinutes: text(fd, "estimatedMinutes") || "10" });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const section = await db.courseSection.findFirst({ where: { id: parsed.data.sectionId, institutionId: user.institutionId, ...(user.role === "TEACHER" ? { course: { teacherId: user.id } } : {}) }, select: { id: true, courseId: true, _count: { select: { lessons: true } } } });
    if (!section) return failed("Sección no encontrada o sin acceso.");
    await db.lesson.create({ data: { institutionId: user.institutionId, courseId: section.courseId, sectionId: section.id, title: parsed.data.title, summary: parsed.data.summary || null, content: parsed.data.content || null, type: parsed.data.type, estimatedMinutes: parsed.data.estimatedMinutes, order: section._count.lessons, isPublished: fd.get("isPublished") === "on" } });
    revalidatePath(`/dashboard/aula/${section.courseId}`);
    return success("Lección creada.");
  } catch { return failed(); }
}

export async function saveAttendance(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(staffRoles);
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
    const user = await requireUser(staffRoles);
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
    const user = await requireUser(staffRoles);
    const parsed = z.object({ courseId: z.string().min(1), categoryId: z.string().optional(), title: z.string().min(3).max(140), instructions: z.string().min(10).max(30000), dueDate: z.string().optional(), maxScore: z.coerce.number().positive().max(10000) }).safeParse({ courseId: text(fd, "courseId"), categoryId: text(fd, "categoryId"), title: text(fd, "title"), instructions: text(fd, "instructions"), dueDate: text(fd, "dueDate"), maxScore: text(fd, "maxScore") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const category = parsed.data.categoryId ? await db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, institutionId: user.institutionId, courseId: course.id }, select: { id: true, gradingPeriodId: true } }) : null;
    const published = fd.get("isPublished") === "on";
    await db.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({ data: { courseId: course.id, title: parsed.data.title, description: parsed.data.instructions.slice(0, 500), instructions: parsed.data.instructions, dueDate: optionalDate(parsed.data.dueDate ?? ""), maxScore: parsed.data.maxScore, isPublished: published, publishedAt: published ? new Date() : null } });
      if (category) await tx.gradeItem.create({ data: { institutionId: user.institutionId, courseId: course.id, gradingPeriodId: category.gradingPeriodId, categoryId: category.id, assignmentId: assignment.id, title: assignment.title, maxScore: assignment.maxScore, dueDate: assignment.dueDate, isPublished: published } });
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Asignación creada.");
  } catch { return failed(); }
}

export async function submitAssignment(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(["STUDENT"]);
    const assignmentId = text(fd, "assignmentId");
    const assignment = await db.assignment.findFirst({ where: { id: assignmentId, isPublished: true, course: { institutionId: user.institutionId, enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } }, select: { id: true, courseId: true, dueDate: true, allowLate: true } });
    if (!assignment) return failed("Asignación no disponible.");
    if (!assignment.allowLate && assignment.dueDate && assignment.dueDate < new Date()) return failed("El plazo de entrega cerró.");
    const content = text(fd, "content");
    if (content.length < 3 || content.length > 30000) return failed("La entrega debe tener entre 3 y 30,000 caracteres.");
    const enrollment = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: assignment.courseId } }, select: { id: true } });
    if (!enrollment) return failed("Matrícula no encontrada.");
    await db.submission.upsert({ where: { assignmentId_studentId: { assignmentId, studentId: user.id } }, create: { assignmentId, studentId: user.id, enrollmentId: enrollment.id, content, status: "SUBMITTED" }, update: { content, status: "SUBMITTED", submittedAt: new Date(), score: null, feedback: null, gradedAt: null } });
    revalidatePath(`/dashboard/aula/${assignment.courseId}`);
    return success("Entrega enviada para revisión.");
  } catch { return failed(); }
}

export async function reviewSubmission(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(staffRoles);
    const submissionId = text(fd, "submissionId");
    const score = Number(text(fd, "score"));
    const feedback = text(fd, "feedback");
    const submission = await db.submission.findFirst({ where: { id: submissionId, assignment: { course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } } }, include: { assignment: { select: { courseId: true, maxScore: true, gradeItem: { select: { id: true } } } } } });
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
    const user = await requireUser(staffRoles);
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
    const user = await requireUser(staffRoles);
    const parsed = z.object({ courseId: z.string().min(1), categoryId: z.string().optional(), title: z.string().min(3).max(140), instructions: z.string().max(20000).optional(), maxAttempts: z.coerce.number().int().min(1).max(10), durationMinutes: z.coerce.number().int().min(1).max(600) }).safeParse({ courseId: text(fd, "courseId"), categoryId: text(fd, "categoryId"), title: text(fd, "title"), instructions: text(fd, "instructions"), maxAttempts: text(fd, "maxAttempts") || "1", durationMinutes: text(fd, "durationMinutes") || "60" });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const bank = await db.questionBankItem.findMany({ where: { institutionId: user.institutionId, courseId: course.id }, orderBy: { createdAt: "asc" }, take: 100 });
    if (!bank.length) return failed("Agrega preguntas al banco antes de crear el examen.");
    const category = parsed.data.categoryId ? await db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, institutionId: user.institutionId, courseId: course.id }, select: { id: true, gradingPeriodId: true } }) : null;
    const published = fd.get("isPublished") === "on";
    await db.$transaction(async (tx) => {
      const exam = await tx.exam.create({ data: { institutionId: user.institutionId, courseId: course.id, title: parsed.data.title, instructions: parsed.data.instructions || null, maxAttempts: parsed.data.maxAttempts, durationMinutes: parsed.data.durationMinutes, isPublished: published, questions: { create: bank.map((question, order) => ({ bankItemId: question.id, order, points: question.defaultPoints })) } } });
      if (category) await tx.gradeItem.create({ data: { institutionId: user.institutionId, courseId: course.id, gradingPeriodId: category.gradingPeriodId, categoryId: category.id, examId: exam.id, title: exam.title, maxScore: bank.reduce((sum, q) => sum + q.defaultPoints, 0), isPublished: published } });
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Examen creado con el banco actual.");
  } catch { return failed(); }
}

export async function submitExam(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(["STUDENT"]);
    const examId = text(fd, "examId");
    const exam = await db.exam.findFirst({ where: { id: examId, institutionId: user.institutionId, isPublished: true, course: { enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } }, include: { questions: { include: { bankItem: true }, orderBy: { order: "asc" } }, attempts: { where: { studentId: user.id }, select: { attemptNumber: true } }, gradeItem: { select: { id: true } }, course: { select: { teacherId: true } } } });
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
      return { bankItemId: bankItem.id, response, score: result.score, isCorrect: result.isCorrect };
    });
    const attempt = await db.examAttempt.create({ data: { institutionId: user.institutionId, examId: exam.id, enrollmentId: enrollment.id, studentId: user.id, attemptNumber: Math.max(0, ...exam.attempts.map((a) => a.attemptNumber)) + 1, status: needsReview ? "SUBMITTED" : "GRADED", score, maxScore: total, submittedAt: now, answers: { create: answers } } });
    if (!needsReview && exam.gradeItem) await db.gradeEntry.upsert({ where: { gradeItemId_enrollmentId: { gradeItemId: exam.gradeItem.id, enrollmentId: enrollment.id } }, create: { institutionId: user.institutionId, gradeItemId: exam.gradeItem.id, enrollmentId: enrollment.id, score, gradedById: exam.course.teacherId }, update: { score, gradedById: exam.course.teacherId, gradedAt: now } });
    revalidatePath(`/dashboard/aula/${exam.courseId}`);
    return success(needsReview ? `Intento ${attempt.attemptNumber} enviado para revisión.` : `Intento calificado: ${score}/${total}.`);
  } catch { return failed(); }
}

export async function reviewExamAttempt(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(staffRoles);
    const attemptId = text(fd, "attemptId");
    const attempt = await db.examAttempt.findFirst({
      where: { id: attemptId, institutionId: user.institutionId, status: "SUBMITTED", exam: { course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } } },
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
    const user = await requireUser(staffRoles);
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
    const user = await requireUser(staffRoles);
    const entity = text(fd, "entity"); const id = text(fd, "id"); const publish = text(fd, "publish") === "true";
    if (entity === "period") {
      const item = await db.gradingPeriod.findFirst({ where: { id, institutionId: user.institutionId, ...(user.role === "TEACHER" ? { course: { teacherId: user.id } } : {}) }, select: { id: true, courseId: true } });
      if (!item) return failed("Período no encontrado.");
      await db.gradingPeriod.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null } });
      revalidatePath(`/dashboard/aula/${item.courseId}`);
    } else if (entity === "assignment") {
      const item = await db.assignment.findFirst({ where: { id, course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } }, select: { id: true, courseId: true } });
      if (!item) return failed("Asignación no encontrada.");
      await db.assignment.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null, gradeItem: { update: { isPublished: publish } } } }).catch(async () => db.assignment.update({ where: { id: item.id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null } }));
      revalidatePath(`/dashboard/aula/${item.courseId}`);
    } else return failed("Tipo de publicación inválido.");
    return success(publish ? "Contenido publicado." : "Contenido retirado.");
  } catch { return failed(); }
}

export async function markLessonComplete(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(["STUDENT"]);
    const lessonId = text(fd, "lessonId");
    const lesson = await db.lesson.findFirst({ where: { id: lessonId, institutionId: user.institutionId, isPublished: true, section: { isPublished: true }, course: { enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } }, select: { id: true, courseId: true } });
    if (!lesson) return failed("Lección no disponible.");
    const enrollment = await db.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: lesson.courseId } }, select: { id: true } });
    if (!enrollment) return failed("Matrícula no encontrada.");
    await db.lessonProgress.upsert({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } }, create: { institutionId: user.institutionId, enrollmentId: enrollment.id, lessonId, completed: true, completedAt: new Date() }, update: { completed: true, completedAt: new Date(), watchedSeconds: Math.max(0, Number(text(fd, "watchedSeconds")) || 0) } });
    const [completed, total] = await Promise.all([db.lessonProgress.count({ where: { enrollmentId: enrollment.id, completed: true, institutionId: user.institutionId } }), db.lesson.count({ where: { courseId: lesson.courseId, institutionId: user.institutionId, isPublished: true, section: { isPublished: true } } })]);
    const percent = progressPercentage(completed, total);
    await db.enrollment.update({ where: { id: enrollment.id }, data: { progressPercent: percent, ...(percent >= 100 ? { status: "COMPLETED", completedAt: new Date() } : {}) } });
    revalidatePath(`/dashboard/aula/${lesson.courseId}`);
    revalidatePath("/dashboard/portal");
    return success(`Progreso actualizado: ${percent}%.`);
  } catch { return failed(); }
}

export async function issueCertificate(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(staffRoles);
    const enrollmentId = text(fd, "enrollmentId");
    const enrollment = await db.enrollment.findFirst({ where: { id: enrollmentId, course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } }, include: { course: { select: { id: true, completionThreshold: true } }, student: { select: { name: true } } } });
    if (!enrollment || (enrollment.status !== "COMPLETED" && enrollment.progressPercent < enrollment.course.completionThreshold)) return failed("El curso todavía no cumple los criterios de finalización.");
    const secret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET;
    if (!secret) return failed("Falta CERTIFICATE_SECRET o AUTH_SECRET.");
    const identity = createCertificateIdentity(enrollment.id, enrollment.courseId, secret);
    const certificate = await db.certificate.upsert({ where: { enrollmentId_courseId: { enrollmentId: enrollment.id, courseId: enrollment.courseId } }, create: { institutionId: user.institutionId, courseId: enrollment.courseId, enrollmentId: enrollment.id, issuedById: user.id, verificationCode: identity.code, verificationHash: identity.verificationHash, metadata: { studentName: enrollment.student.name } }, update: { issuedById: user.id, verificationCode: identity.code, verificationHash: identity.verificationHash, issuedAt: new Date(), revokedAt: null, metadata: { studentName: enrollment.student.name } } });
    revalidatePath(`/dashboard/aula/${enrollment.courseId}`);
    return success(`Certificado emitido: ${certificate.verificationCode}`);
  } catch { return failed(); }
}
