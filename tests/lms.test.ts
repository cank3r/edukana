import assert from "node:assert/strict";
import test from "node:test";
import { autoScoreAnswer, calculateWeightedGrade, createCertificateIdentity, findScheduleConflicts, progressPercentage, validateUpload, verifyCertificateIdentity } from "../src/lib/lms";

test("calcula categorías ponderadas y descarta la nota más baja", () => {
  const grade = calculateWeightedGrade([
    { weight: 40, dropLowest: 1, scores: [{ score: 50, maxScore: 100 }, { score: 80, maxScore: 100 }, { score: 100, maxScore: 100 }] },
    { weight: 60, scores: [{ score: 90, maxScore: 100 }] },
  ]);
  assert.equal(grade, 90);
});

test("renormaliza pesos cuando una categoría todavía no tiene notas", () => {
  assert.equal(calculateWeightedGrade([{ weight: 40, scores: [] }, { weight: 60, scores: [{ score: 45, maxScore: 50 }] }]), 90);
  assert.equal(calculateWeightedGrade([]), null);
});

test("detecta conflictos por docente y aula, pero no bloques adyacentes", () => {
  const base = { id: "a", teacherId: "t1", classroom: "A-1", weekday: 1, startMinutes: 480, endMinutes: 540 };
  assert.deepEqual(findScheduleConflicts({ teacherId: "t1", classroom: "A-1", weekday: 1, startMinutes: 500, endMinutes: 560 }, [base]).map((c) => c.type), ["TEACHER", "CLASSROOM"]);
  assert.equal(findScheduleConflicts({ teacherId: "t1", classroom: "A-1", weekday: 1, startMinutes: 540, endMinutes: 600 }, [base]).length, 0);
});

test("autocalifica respuestas objetivas y deja las cortas para revisión", () => {
  assert.deepEqual(autoScoreAnswer("TRUE_FALSE", " Verdadero ", "verdadero", 2), { score: 2, isCorrect: true });
  assert.deepEqual(autoScoreAnswer("MULTIPLE_CHOICE", "B", "A", 3), { score: 0, isCorrect: false });
  assert.deepEqual(autoScoreAnswer("SHORT_ANSWER", "texto", "texto", 5), { score: null, isCorrect: null });
});

test("calcula progreso acotado", () => {
  assert.equal(progressPercentage(3, 4), 75);
  assert.equal(progressPercentage(5, 4), 100);
  assert.equal(progressPercentage(1, 0), 0);
});

test("genera identidad de certificado verificable y resistente a cambios", () => {
  const identity = createCertificateIdentity("mat-1", "curso-1", "secreto-de-prueba");
  assert.match(identity.code, /^EDU-[A-F0-9]{12}$/);
  assert.equal(verifyCertificateIdentity(identity.code, "mat-1", "curso-1", "secreto-de-prueba", identity.verificationHash), true);
  assert.equal(verifyCertificateIdentity(identity.code, "mat-2", "curso-1", "secreto-de-prueba", identity.verificationHash), false);
});

test("limita formatos y tamaños de documentos y videos", () => {
  assert.equal(validateUpload({ name: "guia.pdf", type: "application/pdf", size: 1024 }, "DOCUMENT"), null);
  assert.equal(validateUpload({ name: "clase.mp4", type: "video/mp4", size: 1024 }, "VIDEO"), null);
  assert.match(validateUpload({ name: "script.exe", type: "application/x-msdownload", size: 1024 }, "DOCUMENT")!, /no permitido/);
  assert.match(validateUpload({ name: "enorme.mp4", type: "video/mp4", size: 101 * 1024 * 1024 }, "VIDEO")!, /100 MB/);
});
