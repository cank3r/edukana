import assert from "node:assert/strict";
import test from "node:test";
import { lessonVideoUrlSchema, normalizeLessonVideo } from "../src/lib/lesson-video";
import { autoScoreAnswer, calculateWeightedGrade, createCertificateIdentity, findScheduleConflicts, progressPercentage, reviewedExamScore, validateUpload, verifyCertificateIdentity } from "../src/lib/lms";

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



test("consolida la corrección automática y manual del examen", () => {
  assert.equal(reviewedExamScore([{ automaticScore: 5, points: 5 }, { automaticScore: null, manualScore: 8, points: 10 }]), 13);
  assert.equal(reviewedExamScore([{ automaticScore: null, points: 10 }]), null);
  assert.equal(reviewedExamScore([{ automaticScore: null, manualScore: 11, points: 10 }]), null);
});
test("video de lección: YouTube, Vimeo y Drive se vuelven direcciones de inserción seguras", () => {
  const youtube = { kind: "iframe", provider: "YouTube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" };
  assert.deepEqual(normalizeLessonVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"), youtube);
  assert.deepEqual(normalizeLessonVideo(" https://youtu.be/dQw4w9WgXcQ?si=abc "), youtube);
  assert.deepEqual(normalizeLessonVideo("https://m.youtube.com/shorts/dQw4w9WgXcQ"), youtube);
  assert.deepEqual(normalizeLessonVideo(youtube.src), youtube, "normalizar dos veces da lo mismo");

  assert.deepEqual(normalizeLessonVideo("https://vimeo.com/123456789"), { kind: "iframe", provider: "Vimeo", src: "https://player.vimeo.com/video/123456789" });
  assert.deepEqual(normalizeLessonVideo("https://vimeo.com/123456789/abcdef1234"), { kind: "iframe", provider: "Vimeo", src: "https://player.vimeo.com/video/123456789?h=abcdef1234" });
  assert.deepEqual(normalizeLessonVideo("https://player.vimeo.com/video/123456789?h=abcdef1234&autoplay=1"), { kind: "iframe", provider: "Vimeo", src: "https://player.vimeo.com/video/123456789?h=abcdef1234" });

  const driveId = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const drive = { kind: "iframe", provider: "Google Drive", src: `https://drive.google.com/file/d/${driveId}/preview` };
  assert.deepEqual(normalizeLessonVideo(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`), drive);
  assert.deepEqual(normalizeLessonVideo(`https://drive.google.com/open?id=${driveId}`), drive);
  assert.deepEqual(normalizeLessonVideo(drive.src), drive);
});

test("video de lección: archivos .mp4 y videos subidos van al reproductor propio", () => {
  assert.deepEqual(normalizeLessonVideo("https://videos.escuela.test/clase%201.mp4"), { kind: "file", src: "https://videos.escuela.test/clase%201.mp4" });
  assert.deepEqual(normalizeLessonVideo("https://cdn.escuela.test/clase.WEBM?v=2"), { kind: "file", src: "https://cdn.escuela.test/clase.WEBM?v=2" });
  assert.deepEqual(normalizeLessonVideo("/api/assets/cm1abcdefghijklmnop"), { kind: "file", src: "/api/assets/cm1abcdefghijklmnop" });
});

test("video de lección: rechaza protocolos peligrosos, dominios ajenos y formas raras", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(document.cookie)//https://youtu.be/dQw4w9WgXcQ",
    "data:text/html,<script>alert(1)</script>",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://videos.escuela.test/clase.mp4",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil.test/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=\"><script>",
    "https://www.youtube.com/watch?v=corto",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/abc",
    "https://player.vimeo.com/video/123456789?h=<b>",
    "https://drive.google.com/file/d/corto/view",
    "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
    "https://videos.escuela.test/clase1",
    "/api/assets/../../etc/passwd",
    "//evil.test/clase.mp4",
    "mira el video en youtube",
    "",
    null,
  ]) {
    assert.equal(normalizeLessonVideo(bad), null, String(bad));
  }
});

test("video de lección: el campo del formulario es opcional y guarda la dirección normalizada", () => {
  assert.equal(lessonVideoUrlSchema.parse(undefined), null);
  assert.equal(lessonVideoUrlSchema.parse("   "), null);
  assert.equal(lessonVideoUrlSchema.parse("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  const bad = lessonVideoUrlSchema.safeParse("javascript:alert(1)");
  assert.equal(bad.success, false);
  assert.match(bad.error?.issues[0]?.message ?? "", /YouTube, Vimeo, Google Drive/);
});
