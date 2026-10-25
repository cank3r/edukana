import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  getMyCourseCertificate,
  issueCertificate,
  issueCertificatesToEligible,
  listCourseCertificates,
  listMyCertificates,
  markCourseCompleted,
  reopenCourseCompletion,
  revokeCertificate,
  verifyCertificateCode,
} from "@/server/courses/certificates";
import { A, B, ensureSeed } from "./setup";

const S = ["ct_s1", "ct_s2", "ct_s3"];
const E = ["ct_e1", "ct_e2", "ct_e3"];
const [e1, e2, e3] = E;
const student = (id: string) => ({ id, institutionId: A.institutionId, role: "STUDENT" as const });
const AUDITED = ["CERTIFICATE_ISSUED", "CERTIFICATES_ISSUED_TO_ELIGIBLE", "CERTIFICATE_REVOKED", "COURSE_MARKED_COMPLETED", "COURSE_COMPLETION_REOPENED"];
const certificatesIn = (courseId: string) => db.certificate.count({ where: { courseId } });
const rowOf = async (enrollmentId: string) => (await listCourseCertificates(A.teacher, A.courseId))?.rows.find((row) => row.enrollmentId === enrollmentId);
const fails = (result: { ok: boolean }) => assert.equal(result.ok, false);

async function cleanup() {
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.certificate.deleteMany({ where: { courseId: { in: [A.courseId, A.course2Id, B.courseId] } } });
  await db.enrollment.deleteMany({ where: { id: { in: E } } });
  await db.user.deleteMany({ where: { id: { in: S } } });
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE", completedAt: null, progressPercent: 0 } });
}

before(async () => {
  process.env.CERTIFICATE_SECRET ||= "secreto-de-prueba-para-certificados-de-integracion";
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: S.map((id, index) => ({ id, institutionId: A.institutionId, name: `Prueba Certificado ${index + 1}`, email: `${id}@a.test`, role: "STUDENT" as const, status: "ACTIVE" as const })),
  });
  // e1 cumple por avance, e2 va a medias y e3 cumple porque su docente dio el curso por completado.
  await db.enrollment.createMany({
    data: [
      { id: e1, institutionId: A.institutionId, studentId: S[0], courseId: A.courseId, status: "ACTIVE", progressPercent: 100 },
      { id: e2, institutionId: A.institutionId, studentId: S[1], courseId: A.courseId, status: "ACTIVE", progressPercent: 40 },
      { id: e3, institutionId: A.institutionId, studentId: S[2], courseId: A.courseId, status: "COMPLETED", progressPercent: 10, completedAt: new Date() },
    ],
  });
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("emitir exige matrícula de ese curso que cumpla los requisitos, y repetirlo no duplica", async () => {
  const list = await listCourseCertificates(A.teacher, A.courseId);
  assert.ok(list);
  assert.deepEqual(
    Object.fromEntries(list.rows.map((row) => [row.enrollmentId, row.state])),
    { a_enrollment: "pending", [e1]: "eligible", [e2]: "pending", [e3]: "eligible" },
  );
  assert.match(list.rows.find((row) => row.enrollmentId === e2)?.missing ?? "", /40%.*100%/);

  fails(await issueCertificate(A.teacher, A.courseId, "no_existe"));
  fails(await issueCertificate(A.teacher, A.courseId, "b_enrollment"));
  fails(await issueCertificate(A.admin, A.course2Id, e1));
  const notYet = await issueCertificate(A.teacher, A.courseId, e2);
  assert.match(notYet.ok ? "" : notYet.message, /todavía no cumple/);
  assert.equal(await certificatesIn(A.courseId), 0);

  const first = await issueCertificate(A.teacher, A.courseId, e1);
  assert.ok(first.ok && first.code);
  assert.deepEqual([first.issued, first.already], [1, 0]);
  const again = await issueCertificate(A.admin, A.courseId, e1);
  assert.deepEqual(again, { ok: true, issued: 0, already: 1, code: first.code });
  assert.equal(await certificatesIn(A.courseId), 1);
  const stored = await db.certificate.findUniqueOrThrow({ where: { verificationCode: first.code } });
  assert.deepEqual([stored.institutionId, stored.enrollmentId, stored.issuedById], [A.institutionId, e1, A.teacher.id]);
  assert.equal(await db.auditLog.count({ where: { action: "CERTIFICATE_ISSUED", entityId: A.courseId } }), 1);

  const verified = await verifyCertificateCode(first.code.toLowerCase());
  assert.equal(verified.status, "valid");
  assert.deepEqual(verified.status === "valid" && [verified.studentName, verified.courseName], ["Prueba Certificado 1", "course A"]);
  assert.ok(!JSON.stringify(verified).includes("@"), "la verificación pública no expone correos");
  assert.deepEqual(await verifyCertificateCode("EDU-000000000000"), { status: "not_found" });
});

test("emitir a todos: solo a quienes cumplen y aún no lo tienen", async () => {
  assert.deepEqual(await issueCertificatesToEligible(A.teacher, A.courseId), { ok: true, issued: 1, already: 1 });
  assert.deepEqual((await db.certificate.findMany({ where: { courseId: A.courseId }, select: { enrollmentId: true }, orderBy: { enrollmentId: "asc" } })).map((row) => row.enrollmentId), [e1, e3]);
  assert.deepEqual(await issueCertificatesToEligible(A.coordinator, A.courseId), { ok: true, issued: 0, already: 2 });
  assert.equal(await certificatesIn(A.courseId), 2);
  assert.equal(await db.auditLog.count({ where: { action: "CERTIFICATES_ISSUED_TO_ELIGIBLE" } }), 1);
});

test("marcar curso como completado hace que cumpla; se puede deshacer mientras no tenga certificado", async () => {
  assert.deepEqual(await markCourseCompleted(A.teacher, A.courseId, e2), { ok: true });
  assert.equal((await rowOf(e2))?.state, "eligible");
  assert.deepEqual(await reopenCourseCompletion(A.teacher, A.courseId, e2), { ok: true });
  const reopened = await db.enrollment.findUniqueOrThrow({ where: { id: e2 } });
  assert.deepEqual([reopened.status, reopened.completedAt], ["ACTIVE", null]);
  assert.equal((await rowOf(e2))?.state, "pending");
  fails(await reopenCourseCompletion(A.teacher, A.courseId, e3));
  assert.equal((await db.enrollment.findUniqueOrThrow({ where: { id: e3 } })).status, "COMPLETED");
  fails(await markCourseCompleted(A.teacher, A.courseId, "b_enrollment"));
});

test("un docente ajeno, un estudiante, un tutor y la otra institución no pueden gestionar certificados", async () => {
  for (const actor of [A.teacher2, A.student, A.parent, B.admin, B.teacher]) {
    assert.equal(await listCourseCertificates(actor, A.courseId), null);
    fails(await issueCertificate(actor, A.courseId, e2));
    fails(await issueCertificatesToEligible(actor, A.courseId));
    fails(await markCourseCompleted(actor, A.courseId, e2));
    fails(await reopenCourseCompletion(actor, A.courseId, e3));
    fails(await revokeCertificate(actor, A.courseId, e1, "No me corresponde"));
  }
  // Ni con su propio curso se alcanza una matrícula de otra institución.
  fails(await issueCertificate(B.admin, B.courseId, e1));
  fails(await revokeCertificate(B.admin, B.courseId, e1, "x"));
  assert.equal(await certificatesIn(A.courseId), 2);
  assert.equal(await certificatesIn(B.courseId), 0);
  assert.equal(await db.certificate.count({ where: { courseId: A.courseId, revokedAt: { not: null } } }), 0);
  assert.equal((await db.enrollment.findUniqueOrThrow({ where: { id: e2 } })).status, "ACTIVE");
});

test("el estudiante solo ve sus certificados", async () => {
  const mine = await listMyCertificates(student(S[0]));
  assert.deepEqual(mine.certificates.map((certificate) => certificate.courseId), [A.courseId]);
  const others = await listMyCertificates(student(S[2]));
  assert.equal(others.certificates.length, 1);
  assert.notEqual(others.certificates[0].code, mine.certificates[0].code);
  assert.deepEqual((await listMyCertificates(A.student)).certificates, []);
  assert.deepEqual((await listMyCertificates(B.student)).certificates, []);
  // Una sesión de la otra institución con el mismo identificador de persona tampoco los ve.
  assert.deepEqual((await listMyCertificates({ ...B.student, id: S[0] })).certificates, []);

  const inCourse = await getMyCourseCertificate(student(S[0]), A.courseId);
  assert.equal(inCourse?.certificate?.code, mine.certificates[0].code);
  const pending = await getMyCourseCertificate(student(S[1]), A.courseId);
  assert.deepEqual([pending?.certificate, pending?.eligible], [null, false]);
  assert.match(pending?.missing ?? "", /Llevas 40%.*100%/);
  assert.equal(await getMyCourseCertificate(B.student, A.courseId), null);
  assert.equal(await getMyCourseCertificate(student(S[0]), A.course2Id), null);
  assert.equal(await getMyCourseCertificate(A.teacher, A.courseId), null);
});

test("anular: pide motivo, deja constancia y el código deja de verificar", async () => {
  const code = (await db.certificate.findFirstOrThrow({ where: { enrollmentId: e1 } })).verificationCode;
  assert.equal((await verifyCertificateCode(code)).status, "valid");
  fails(await revokeCertificate(A.teacher, A.courseId, e1, "   "));
  fails(await revokeCertificate(A.teacher, A.courseId, e2, "No tiene certificado"));
  assert.equal((await verifyCertificateCode(code)).status, "valid");

  assert.deepEqual(await revokeCertificate(A.teacher, A.courseId, e1, " Se emitió por error "), { ok: true });
  const revoked = await verifyCertificateCode(code);
  assert.equal(revoked.status, "revoked");
  assert.ok(!("studentName" in revoked), "un certificado anulado no muestra a la persona");
  assert.deepEqual((await listMyCertificates(student(S[0]))).certificates, []);
  assert.equal((await getMyCourseCertificate(student(S[0]), A.courseId))?.certificate, null);
  const row = await rowOf(e1);
  assert.deepEqual([row?.state, row?.revoked?.reason], ["eligible", "Se emitió por error"]);
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: "CERTIFICATE_REVOKED" } });
  assert.deepEqual([audit.userId, (audit.changes as { reason?: string }).reason], [A.teacher.id, "Se emitió por error"]);
  assert.deepEqual(await revokeCertificate(A.admin, A.courseId, e1, "Otra vez"), { ok: true }, "anular dos veces no cambia nada");
  assert.equal(await db.auditLog.count({ where: { action: "CERTIFICATE_REVOKED" } }), 1);

  // Volver a emitir da un código nuevo; el anulado nunca vuelve a verificar.
  const reissued = await issueCertificate(A.teacher, A.courseId, e1);
  assert.ok(reissued.ok && reissued.code && reissued.code !== code);
  assert.equal((await verifyCertificateCode(reissued.code)).status, "valid");
  assert.deepEqual(await verifyCertificateCode(code), { status: "not_found" });
  assert.equal(await certificatesIn(A.courseId), 2);

  // Un registro alterado tampoco verifica.
  await db.certificate.update({ where: { verificationCode: reissued.code }, data: { verificationHash: "0".repeat(64) } });
  assert.equal((await verifyCertificateCode(reissued.code)).status, "invalid");
});
