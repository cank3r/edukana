import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { enrollGroupInCourses } from "@/server/academic/groups";
import { gradeSubmission, saveAssignment, setAssignmentPublished, submitAssignment } from "@/server/assessment/assignments";
import { createExam, setExamPublished } from "@/server/assessment/exam-admin";
import { createQuestion } from "@/server/assessment/question-bank";
import { issueCertificate } from "@/server/courses/certificates";
import { enrollStudents } from "@/server/courses/enrollment";
import { createLiveClasses } from "@/server/courses/live-classes";
import { createCharge, createGroupCharges } from "@/server/finance/charges";
import { MemoryEmailProvider, setEmailProviderForTests, type EmailProvider } from "@/server/integrations/email";
import {
  countUnread,
  deliverEmails,
  EMAIL_BATCH,
  groupByDay,
  listNotifications,
  markRead,
  notify,
  notifyWithinTransaction,
  openNotification,
  PAGE_SIZE,
} from "@/server/notifications";
import { announcementAudienceUserIds, notifyAnnouncementPublished } from "@/server/notifications/events";
import { A, B, ensureSeed } from "./setup";

/**
 * Curso propio de esta prueba (no toca los del resto de la suite):
 * - s1 y s2: estudiantes activos e inscritos.
 * - susp: estudiante SUSPENDIDO con matrícula activa (no debe recibir nada).
 * - B nunca recibe nada.
 */
const COURSE = "nt_course";
const COURSE2 = "nt_course2";
const GROUP = "nt_group";
const S1 = "nt_s1";
const S2 = "nt_s2";
const SUSP = "nt_susp";
const LATE = "nt_late";
const USERS = [S1, S2, SUSP, LATE];
const TAG = "NT13";
const START = new Date();
const NOW = new Date("2026-10-09T15:00:00Z");

const teacher = { ...A.teacher, capabilities: resolveEffectiveCapabilities(A.teacher.role) };
const of = (userId: string, kind?: string) => db.notification.findMany({ where: { userId, ...(kind ? { kind } : {}) }, orderBy: { createdAt: "asc" } });
const countKind = (kind: string, institutionId?: string) => db.notification.count({ where: { kind, ...(institutionId ? { institutionId } : {}) } });

let mail = new MemoryEmailProvider();

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

async function cleanup() {
  await db.notificationPreference.deleteMany({ where: { userId: { in: USERS } } });
  await db.notification.deleteMany({ where: { institutionId: { in: [A.institutionId, B.institutionId] } } });
  await db.paymentConcept.deleteMany({ where: { studentId: { in: USERS } } });
  await db.certificate.deleteMany({ where: { courseId: { in: [COURSE, COURSE2] } } });
  await db.submission.deleteMany({ where: { studentId: { in: USERS } } });
  await db.assignment.deleteMany({ where: { courseId: { in: [COURSE, COURSE2] } } });
  await db.exam.deleteMany({ where: { courseId: { in: [COURSE, COURSE2] } } });
  await db.questionBankItem.deleteMany({ where: { courseId: { in: [COURSE, COURSE2] } } });
  await db.liveClass.deleteMany({ where: { courseId: { in: [COURSE, COURSE2] } } });
  await db.enrollment.deleteMany({ where: { OR: [{ courseId: { in: [COURSE, COURSE2] } }, { studentId: { in: USERS } }] } });
  await db.studentGroup.deleteMany({ where: { id: GROUP } });
  await db.course.deleteMany({ where: { id: { in: [COURSE, COURSE2] } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  await db.auditLog.deleteMany({ where: { institutionId: { in: [A.institutionId, B.institutionId] }, createdAt: { gte: START } } });
}

before(async () => {
  process.env.CERTIFICATE_SECRET ||= "secreto-de-prueba-para-certificados-de-integracion";
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: [
      { id: S1, institutionId: A.institutionId, name: "Ana Notificada", email: "nt_s1@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: S2, institutionId: A.institutionId, name: "Beto Notificado", email: "nt_s2@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: SUSP, institutionId: A.institutionId, name: "Suspendido Notificado", email: "nt_susp@a.test", role: "STUDENT", status: "SUSPENDED" },
      { id: LATE, institutionId: A.institutionId, name: "Carla Tardía", email: "nt_late@a.test", role: "STUDENT", status: "ACTIVE" },
    ],
  });
  await db.course.createMany({
    data: [
      { id: COURSE, institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id, name: `${TAG} Biología` },
      { id: COURSE2, institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id, name: `${TAG} Química` },
    ],
  });
  await db.enrollment.createMany({
    data: [
      { id: "nt_e1", institutionId: A.institutionId, studentId: S1, courseId: COURSE, status: "ACTIVE", progressPercent: 100 },
      { id: "nt_e2", institutionId: A.institutionId, studentId: S2, courseId: COURSE, status: "ACTIVE" },
      { id: "nt_e3", institutionId: A.institutionId, studentId: SUSP, courseId: COURSE, status: "ACTIVE" },
    ],
  });
});

beforeEach(async () => {
  mail = new MemoryEmailProvider();
  setEmailProviderForTests(mail);
  await db.notification.deleteMany({ where: { institutionId: { in: [A.institutionId, B.institutionId] } } });
});

after(async () => {
  setEmailProviderForTests(null);
  await cleanup();
  await db.$disconnect();
});

test("notify: solo personas activas de la institución, nunca de otra ni suspendidas", async () => {
  const outcome = await notify(db, {
    institutionId: A.institutionId,
    userIds: [S1, S1, SUSP, B.student.id, "no_existe"],
    kind: "announcement",
    title: "  Hola  ",
    href: "https://otro-sitio.test/robar",
    email: true,
  });
  assert.deepEqual(outcome.userIds, [S1]);
  assert.equal(outcome.created, 1);
  const [row] = await of(S1);
  assert.equal(row.title, "Hola");
  assert.equal(row.href, null, "un enlace externo se descarta");
  assert.equal(await db.notification.count({ where: { userId: { in: [SUSP, B.student.id] } } }), 0);

  // El correo solo sale después y solo a quien recibió la notificación.
  assert.deepEqual(await deliverEmails(outcome.email), { sent: 1, failed: 0, skipped: 0 });
  assert.deepEqual(mail.sent.map((message) => message.to), ["nt_s1@a.test"]);
  assert.match(mail.sent[0].subject, /^Instituto A: Hola$/);
  assert.match(mail.sent[0].text, /Hola, Ana Notificada:/);
});

test("deliverEmails: máximo un lote por llamada y nunca a suspendidos aunque se pidan", async () => {
  const ids = Array.from({ length: EMAIL_BATCH + 5 }, (_, index) => `${S1}-fantasma-${index}`);
  const outcome = await deliverEmails({ institutionId: A.institutionId, userIds: [SUSP, B.student.id, S2, ...ids], kind: "announcement", title: "Prueba", body: null, href: "/dashboard" });
  assert.equal(outcome.sent, 1);
  assert.deepEqual(mail.sent.map((message) => message.to), ["nt_s2@a.test"]);
  assert.ok(outcome.skipped > 0);
});

test("leer: lista propia por páginas, conteo de no leídas y markRead solo sobre las propias", async () => {
  const many = Array.from({ length: PAGE_SIZE + 3 }, (_, index) => ({
    institutionId: A.institutionId, userId: S1, kind: "announcement", title: `Aviso ${index}`, createdAt: new Date(NOW.getTime() + index * 1000),
  }));
  await db.notification.createMany({ data: many });
  await db.notification.create({ data: { id: "nt_other", institutionId: A.institutionId, userId: S2, kind: "announcement", title: "De otra persona" } });
  await db.notification.create({ data: { id: "nt_b", institutionId: B.institutionId, userId: B.student.id, kind: "announcement", title: "De B" } });

  const me = { id: S1, institutionId: A.institutionId };
  const first = await listNotifications(me);
  assert.equal(first.items.length, PAGE_SIZE);
  assert.equal(first.items[0].title, `Aviso ${PAGE_SIZE + 2}`, "las más recientes primero");
  assert.ok(first.nextCursor);
  const second = await listNotifications(me, { cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.title), ["Aviso 2", "Aviso 1", "Aviso 0"]);
  assert.equal(second.nextCursor, null);
  assert.equal((await listNotifications(me, { cursor: "nt_other" })).items.length, PAGE_SIZE, "un cursor ajeno vuelve al inicio");
  assert.equal(await countUnread(me), PAGE_SIZE + 3);

  // Intentar marcar las de otra persona o de B no cambia nada.
  assert.equal(await markRead(me, ["nt_other", "nt_b"]), 0);
  assert.equal(await openNotification(me, "nt_other"), null);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: "nt_other" } })).readAt, null);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: "nt_b" } })).readAt, null);
  assert.equal(await markRead({ id: S1, institutionId: B.institutionId }, "all"), 0, "con otra institución no toca nada");

  assert.equal(await markRead(me, [first.items[0].id]), 1);
  assert.equal(await countUnread(me), PAGE_SIZE + 2);
  assert.equal(await markRead(me, "all"), PAGE_SIZE + 2);
  assert.equal(await countUnread(me), 0);
  assert.equal(await countUnread({ id: S2, institutionId: A.institutionId }), 1);
  assert.equal(await countUnread({ id: B.student.id, institutionId: B.institutionId }), 1);
});

test("abrir una notificación propia la marca leída y devuelve solo rutas internas", async () => {
  const row = await db.notification.create({ data: { institutionId: A.institutionId, userId: S1, kind: "grade", title: "Nota", href: "/dashboard/aula/x/tareas/y" } });
  assert.equal(await openNotification({ id: S1, institutionId: A.institutionId }, row.id), "/dashboard/aula/x/tareas/y");
  assert.ok((await db.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt);
});

test("agrupar por día en la zona de la institución", () => {
  const now = new Date("2026-10-09T15:00:00Z");
  const groups = groupByDay(
    [
      { createdAt: new Date("2026-10-09T14:00:00Z") },
      { createdAt: new Date("2026-10-09T03:00:00Z") }, // 8 de octubre a las 11 p. m. en Santo Domingo
      { createdAt: new Date("2026-10-01T15:00:00Z") },
    ],
    "America/Santo_Domingo",
    now,
  );
  assert.deepEqual(groups.map((group) => [group.label, group.items.length]), [["Hoy", 1], ["Ayer", 1], ["Jueves, 1 de octubre", 1]]);
});

test("aviso publicado: a su audiencia (y tutores), sin el autor, sin suspendidos ni B; correo si son pocos", async () => {
  const audience = { institution: false, roles: [], courseIds: [COURSE], userIds: [], unitIds: [] };
  const ids = await announcementAudienceUserIds(A.institutionId, audience);
  assert.deepEqual(new Set(ids), new Set([S1, S2, A.teacher.id]));

  const withGuardian = await announcementAudienceUserIds(A.institutionId, { ...audience, courseIds: [], userIds: [A.student.id] });
  assert.deepEqual(new Set(withGuardian), new Set([A.student.id, A.parent.id]), "el tutor con permiso de ver avisos también");

  await notifyAnnouncementPublished(A.teacher, { title: "Salida al museo", content: "Traigan   su merienda.\n\nSalimos a las 8.", audience });
  const rows = await db.notification.findMany({ where: { kind: "announcement" } });
  assert.deepEqual(new Set(rows.map((row) => row.userId)), new Set([S1, S2]), "el autor no se notifica a sí mismo");
  assert.equal(rows[0].title, "Nuevo aviso: Salida al museo");
  assert.equal(rows[0].body, "Traigan su merienda. Salimos a las 8.");
  assert.equal(rows[0].href, "/dashboard/comunidad");
  assert.deepEqual(new Set(mail.sent.map((message) => message.to)), new Set(["nt_s1@a.test", "nt_s2@a.test"]));
  assert.equal(await countKind("announcement", B.institutionId), 0);
});

test("tarea: publicada a estudiantes activos; entrega al docente; nota al estudiante con correo", async () => {
  const draft = { courseId: COURSE, title: `${TAG} Informe`, instructions: "Escribe un informe de laboratorio.", dueLocal: "2026-12-01T17:00", maxScore: "20", allowLate: true };
  const hidden = ok(await saveAssignment(teacher, draft, NOW));
  assert.equal(await countKind("assignment"), 0, "una tarea oculta no avisa");

  ok(await setAssignmentPublished(teacher, hidden.assignmentId, true, NOW));
  const published = await db.notification.findMany({ where: { kind: "assignment" } });
  assert.deepEqual(new Set(published.map((row) => row.userId)), new Set([S1, S2]));
  assert.equal(published[0].href, `/dashboard/aula/${COURSE}/tareas/${hidden.assignmentId}`);
  assert.match(published[0].body ?? "", /diciembre/);
  ok(await setAssignmentPublished(teacher, hidden.assignmentId, true, NOW));
  assert.equal(await countKind("assignment"), 2, "volver a publicar una ya publicada no repite");

  const direct = ok(await saveAssignment(teacher, { ...draft, title: `${TAG} Directa`, publish: true }, NOW));
  assert.equal(await db.notification.count({ where: { kind: "assignment", href: { endsWith: direct.assignmentId } } }), 2);
  assert.equal(mail.sent.length, 0, "las tareas nuevas avisan solo en la aplicación");

  ok(await submitAssignment({ id: S1, institutionId: A.institutionId }, { assignmentId: hidden.assignmentId, content: "Mi informe completo." }, NOW));
  const received = await of(A.teacher.id, "submission");
  assert.equal(received.length, 1);
  assert.match(received[0].title, /Ana Notificada entregó «NT13 Informe»/);
  assert.equal(mail.sent.length, 0, "la entrega avisa solo en la aplicación");

  const submission = await db.submission.findFirstOrThrow({ where: { assignmentId: hidden.assignmentId, studentId: S1 } });
  ok(await gradeSubmission(teacher, { submissionId: submission.id, score: "18", feedback: "Muy bien" }, NOW));
  const grade = await of(S1, "grade");
  assert.equal(grade.length, 1);
  assert.match(grade[0].title, /Ya tienes nota en «NT13 Informe»/);
  assert.doesNotMatch(`${grade[0].title} ${grade[0].body}`, /\b18\b/, "la nota no viaja en la notificación");
  assert.deepEqual(mail.sent.map((message) => message.to), ["nt_s1@a.test"]);
  assert.doesNotMatch(mail.sent[0].text, /\b18\b/);

  ok(await gradeSubmission(teacher, { submissionId: submission.id, score: "19", reason: "Revisé otra vez" }, NOW));
  assert.match((await of(S1, "grade"))[1].title, /Se corrigió tu nota/);
  assert.equal(await db.notification.count({ where: { userId: { in: [S2, SUSP] }, kind: "grade" } }), 0);
  assert.equal(await db.notification.count({ where: { institutionId: B.institutionId } }), 0);
});

test("examen publicado: a los estudiantes activos del curso", async () => {
  const question = await createQuestion(A.teacher, COURSE, { type: "TRUE_FALSE", prompt: `${TAG} El agua moja.`, answer: "Verdadero", points: 1 });
  assert.ok(question.ok);
  const exam = await createExam(A.teacher, COURSE, { title: `${TAG} Parcial`, instructions: "Lee con calma.", questions: [{ bankItemId: question.ok ? question.id : "", points: 1 }], durationMinutes: 30, maxAttempts: 1, showReview: true });
  assert.ok(exam.ok, JSON.stringify(exam));
  assert.equal(await countKind("exam"), 0);
  ok(await setExamPublished(A.teacher, exam.ok ? exam.id : "", true));
  const rows = await db.notification.findMany({ where: { kind: "exam" } });
  assert.deepEqual(new Set(rows.map((row) => row.userId)), new Set([S1, S2]));
  assert.equal(rows[0].href, `/dashboard/aula/${COURSE}/presentar`);
  ok(await setExamPublished(A.teacher, exam.ok ? exam.id : "", true));
  assert.equal(await countKind("exam"), 2, "republicar no repite");
});

test("clase en vivo: a los estudiantes, con la hora de la institución (correo solo si lo activan)", async () => {
  ok(await createLiveClasses(A.teacher, { courseId: COURSE, title: "Repaso", date: "2026-10-20", time: "18:00", durationMinutes: 60, joinUrl: "https://meet.example.com/abc", weeks: 2 }, NOW));
  const rows = await db.notification.findMany({ where: { kind: "live_class" } });
  assert.deepEqual(new Set(rows.map((row) => row.userId)), new Set([S1, S2]));
  assert.match(rows[0].body ?? "", /martes, 20 de octubre a las 6:00/);
  assert.match(rows[0].body ?? "", /2 clases/);
  assert.equal(mail.sent.length, 0, "por omisión las clases en vivo avisan solo en la aplicación");
});

test("un fallo del correo no rompe la acción y la notificación queda en la aplicación", async () => {
  // Quieren las clases en vivo por correo: así el envío sí se intenta.
  await db.notificationPreference.createMany({ data: [S1, S2].map((userId) => ({ institutionId: A.institutionId, userId, kind: "live_class", email: true })) });
  const broken: EmailProvider = { send: async () => { throw new Error("proveedor caído"); } };
  setEmailProviderForTests(broken);
  ok(await createLiveClasses(A.teacher, { courseId: COURSE, title: "Sin correo", date: "2026-10-22", time: "18:00", durationMinutes: 30, joinUrl: "https://meet.example.com/x" }, NOW));
  assert.equal(await countKind("live_class"), 2);

  // Sin proveedor configurado (sin variables de entorno) tampoco se rompe.
  setEmailProviderForTests(null);
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    ok(await createLiveClasses(A.teacher, { courseId: COURSE, title: "Sin configurar", date: "2026-10-23", time: "18:00", durationMinutes: 30, joinUrl: "https://meet.example.com/y" }, NOW));
    assert.equal(await countKind("live_class"), 4);
  } finally {
    if (previous.key !== undefined) process.env.RESEND_API_KEY = previous.key;
    if (previous.from !== undefined) process.env.EMAIL_FROM = previous.from;
    await db.notificationPreference.deleteMany({ where: { userId: { in: [S1, S2] } } });
  }
});

test("un fallo al guardar dentro de la transacción no la tumba", async () => {
  const marker = await db.$transaction(async (tx) => {
    const failing = {
      user: tx.user,
      $executeRawUnsafe: tx.$executeRawUnsafe.bind(tx),
      notification: { createMany: async () => { await tx.$executeRawUnsafe("SELECT 1/0"); return { count: 0 }; } },
    } as unknown as Parameters<typeof notifyWithinTransaction>[0];
    const outcome = await notifyWithinTransaction(failing, { institutionId: A.institutionId, userIds: [S1], kind: "enrollment", title: "Falla" });
    assert.equal(outcome.created, 0);
    // La transacción sigue viva: esta escritura se confirma.
    return tx.notification.create({ data: { institutionId: A.institutionId, userId: S2, kind: "enrollment", title: "Sigue viva" } });
  });
  assert.ok(await db.notification.findUnique({ where: { id: marker.id } }));
  assert.equal(await db.notification.count({ where: { title: "Falla" } }), 0);
});

test("certificado emitido: al estudiante (correo solo si lo activa)", async () => {
  ok(await issueCertificate(A.teacher, COURSE, "nt_e1"));
  const rows = await of(S1, "certificate");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].href, "/dashboard/mis-certificados");
  assert.equal(mail.sent.length, 0, "por omisión el certificado avisa solo en la aplicación");
  ok(await issueCertificate(A.teacher, COURSE, "nt_e1"));
  assert.equal(await countKind("certificate"), 1, "repetir no vuelve a avisar");
});

test("inscripción (curso y grupo): al estudiante, solo en la aplicación", async () => {
  ok(await enrollStudents(A.teacher, COURSE2, [S1]));
  const rows = await of(S1, "enrollment");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].href, `/dashboard/aula/${COURSE2}`);
  ok(await enrollStudents(A.teacher, COURSE2, [S1]));
  assert.equal(await countKind("enrollment"), 1, "quien ya estaba inscrito no recibe otra");

  await db.studentGroup.create({
    data: {
      id: GROUP, institutionId: A.institutionId, name: `${TAG} Grupo`, startsOn: new Date("2026-01-01"),
      members: { create: [S1, LATE, SUSP].map((userId) => ({ institutionId: A.institutionId, userId })) },
      courses: { create: [{ institutionId: A.institutionId, courseId: COURSE2 }] },
    },
  });
  ok(await enrollGroupInCourses(A.admin, GROUP));
  assert.equal((await of(LATE, "enrollment")).length, 1);
  assert.equal(await countKind("enrollment"), 2, "S1 ya estaba y el suspendido no entra");
  assert.equal(mail.sent.length, 0);
});

test("cargo creado: al estudiante, en la aplicación y por correo (también en lote, tras confirmar)", async () => {
  ok(await createCharge(A.admin, { studentId: S1, concept: "Mensualidad de octubre", amountCents: 350000, dueDate: "2026-10-31" }));
  const rows = await of(S1, "charge");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Nuevo cargo: Mensualidad de octubre");
  assert.match(rows[0].body ?? "", /31 de octubre de 2026/);
  assert.equal(rows[0].href, "/dashboard/mi-cuenta");
  assert.deepEqual(mail.sent.map((message) => message.to), ["nt_s1@a.test"], "los cargos van por correo por omisión");

  const batch = await createGroupCharges(A.admin, { target: { kind: "course", id: COURSE }, operationKey: "nt-operation-key-0001", concept: "Laboratorio", amountCents: 50000, dueDate: "2026-11-15" });
  ok(batch);
  assert.deepEqual(new Set((await db.notification.findMany({ where: { kind: "charge", title: "Nuevo cargo: Laboratorio" } })).map((row) => row.userId)), new Set([S1, S2]));
  ok(await createGroupCharges(A.admin, { target: { kind: "course", id: COURSE }, operationKey: "nt-operation-key-0001", concept: "Laboratorio", amountCents: 50000, dueDate: "2026-11-15" }));
  assert.equal(await countKind("charge"), 3, "repetir la misma operación no vuelve a avisar");
  assert.equal(mail.sent.length, 3, "el lote envía un correo por estudiante y repetirlo no envía otro");
  assert.deepEqual(new Set(mail.sent.slice(1).map((message) => message.to)), new Set(["nt_s1@a.test", "nt_s2@a.test"]));
  assert.equal(await db.notification.count({ where: { userId: SUSP } }), 0);
});
