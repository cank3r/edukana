import { withRequestHost } from "../helpers/request-host-context";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { resolveLocalStorageObject } from "@/lib/local-storage";
import { cleanFileName, contentMatchesType, publicImageUrl, validateUploadRequest, type UploadPurpose } from "@/lib/uploads";
import { PUT as localStoragePut } from "@/app/api/local-storage/route";
import { GET as publicImageGet } from "@/app/api/public-images/[assetId]/route";
import { removeAvatar, removeCourseImage, removeInstitutionLogo, setAvatar, setCourseImage, setInstitutionLogo } from "@/server/courses/images";
import { submissionFilesForManager, submissionFilesForStudent, submitAssignmentWithFiles } from "@/server/courses/submission-files";
import { assetReadAccess, confirmUpload, discardUpload, prepareUpload, publicImageAsset, type UploadActor } from "@/server/courses/uploads";
import type { EdukanaRole } from "@/types/next-auth";
import { A, B, ensureSeed } from "./setup";

const actor = (user: { id: string; institutionId: string; role: EdukanaRole }): UploadActor => ({ ...user, capabilities: resolveEffectiveCapabilities(user.role) });
const student = actor(A.student);
const student2 = actor(A.student2);
const teacher = actor(A.teacher);
const teacher2 = actor(A.teacher2);
const admin = actor(A.admin);
const teacherB = actor(B.teacher);
const adminB = actor(B.admin);

const ASSIGNMENT = "it_up_assignment";
const ENROLLMENT2 = "it_up_enrollment2";
const AUDIT_ACTIONS = ["COURSE_IMAGE_CHANGED", "INSTITUTION_LOGO_CHANGED"];

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);
const EXE = new TextEncoder().encode("MZ\x90\x00 este no es un PDF");

let root = "";

function readPublicImage(assetId: string) {
  const url = new URL(`/api/public-images/${assetId}`, process.env.APP_URL!);
  return withRequestHost(url.host, () => publicImageGet(new Request(url), { params: Promise.resolve({ assetId }) }));
}

/** Sube como lo haría el navegador: reserva, PUT a la URL firmada y confirmación. */
async function upload(who: UploadActor, purpose: UploadPurpose, file: { name: string; type: string; bytes: Uint8Array }, target: { assignmentId?: string; courseId?: string } = {}) {
  const prepared = await prepareUpload(who, { purpose, name: file.name, type: file.type, size: file.bytes.length, ...target });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  if (!prepared.ok) throw new Error("unreachable");
  const put = await localStoragePut(new Request(prepared.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: new Uint8Array(file.bytes) }));
  assert.equal(put.status, 201);
  return { assetId: prepared.assetId, confirmed: await confirmUpload(who, prepared.assetId) };
}

async function uploaded(who: UploadActor, purpose: UploadPurpose, file: { name: string; type: string; bytes: Uint8Array }, target: { assignmentId?: string; courseId?: string } = {}) {
  const result = await upload(who, purpose, file, target);
  assert.equal(result.confirmed.ok, true, JSON.stringify(result.confirmed));
  return result.assetId;
}

const pdf = (name = "tarea.pdf") => ({ name, type: "application/pdf", bytes: PDF });
const png = (name = "portada.png") => ({ name, type: "image/png", bytes: PNG });

before(async () => {
  await ensureSeed();
  root = await mkdtemp(join(tmpdir(), "edukana-uploads-"));
  process.env.LOCAL_STORAGE_ROOT = root;
  process.env.LOCAL_STORAGE_SECRET = "pruebas-de-archivos-con-al-menos-32-caracteres";
  process.env.APP_URL ??= "http://127.0.0.1:3000";
  await db.enrollment.create({ data: { id: ENROLLMENT2, institutionId: A.institutionId, studentId: A.student2.id, courseId: A.courseId, status: "ACTIVE" } });
  await db.assignment.create({ data: { id: ASSIGNMENT, institutionId: A.institutionId, courseId: A.courseId, title: "Tarea con archivos", instructions: "Adjunta tu trabajo.", isPublished: true } });
});

after(async () => {
  await db.storageAsset.deleteMany({
    where: { OR: ["submissions", "public", "avatars"].flatMap((folder) => [A, B].map((side) => ({ objectPath: { startsWith: `${side.institutionId}/${folder}/` } }))) },
  });
  await db.assignment.deleteMany({ where: { id: ASSIGNMENT } });
  await db.enrollment.deleteMany({ where: { id: ENROLLMENT2 } });
  await db.course.updateMany({ where: { id: { in: [A.courseId, B.courseId] } }, data: { imageUrl: null } });
  await db.institution.updateMany({ where: { id: { in: [A.institutionId, B.institutionId] } }, data: { logoUrl: null } });
  await db.user.updateMany({ where: { id: { in: [A.teacher.id, A.student.id] } }, data: { avatarUrl: null } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDIT_ACTIONS } } });
  await rm(root, { recursive: true, force: true });
  await db.$disconnect();
});

test("reglas: tipo declarado, tamaño, firma de bytes y nombre saneado", () => {
  assert.equal(validateUploadRequest("submission", { name: "a.pdf", type: "application/pdf", size: 10 }), null);
  assert.match(validateUploadRequest("submission", { name: "a.exe", type: "application/x-msdownload", size: 10 }) ?? "", /no se puede entregar/);
  assert.match(validateUploadRequest("submission", { name: "a.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }) ?? "", /25 MB/);
  assert.match(validateUploadRequest("course-image", { name: "a.pdf", type: "application/pdf", size: 10 }) ?? "", /JPG, PNG o WebP/);
  assert.match(validateUploadRequest("avatar", { name: "a.png", type: "image/png", size: 6 * 1024 * 1024 }) ?? "", /5 MB/);
  assert.match(validateUploadRequest("submission", { name: "a", type: "constructor", size: 10 }) ?? "", /no se puede entregar/);

  assert.equal(contentMatchesType("submission", "application/pdf", PDF), true);
  assert.equal(contentMatchesType("submission", "application/pdf", EXE), false);
  assert.equal(contentMatchesType("course-image", "image/png", PNG), true);
  assert.equal(contentMatchesType("course-image", "image/jpeg", PNG), false);
  assert.equal(contentMatchesType("course-image", "image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(contentMatchesType("course-image", "image/webp", new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ")), true);
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
  assert.equal(contentMatchesType("submission", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip), true);
  assert.equal(contentMatchesType("submission", "application/zip", zip), true);
  assert.equal(contentMatchesType("submission", "application/msword", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), true);
  assert.equal(contentMatchesType("avatar", "application/pdf", PDF), false);

  assert.equal(cleanFileName("C:\\Users\\ana\\Mi tarea\u0000 final.pdf"), "Mi tarea final.pdf");
  assert.equal(cleanFileName("../../etc/passwd"), "passwd");
  assert.equal(cleanFileName(`${"a".repeat(300)}.docx`).length, 180);
  assert.ok(cleanFileName(`${"a".repeat(300)}.docx`).endsWith(".docx"));
});

let firstFile = "";
let submissionId = "";

test("entrega con archivo: solo el dueño y quien gestiona el curso pueden descargarlo", async () => {
  firstFile = await uploaded(student, "submission", pdf("Mi tarea.pdf"), { assignmentId: ASSIGNMENT });
  const listed = await submissionFilesForStudent(student, ASSIGNMENT);
  assert.deepEqual(listed.pending.map((file) => file.id), [firstFile]);
  assert.equal(listed.current.length, 0);

  const result = await submitAssignmentWithFiles(student, { assignmentId: ASSIGNMENT, assetIds: [firstFile] });
  assert.equal(result.ok, true, JSON.stringify(result));
  const submission = await db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: ASSIGNMENT, studentId: A.student.id } }, select: { id: true } });
  submissionId = submission.id;
  const asset = await db.storageAsset.findUniqueOrThrow({ where: { id: firstFile }, select: { submissionId: true, visibility: true, originalName: true } });
  assert.equal(asset.submissionId, submissionId);
  assert.equal(asset.visibility, "PRIVATE");
  assert.equal(asset.originalName, "Mi tarea.pdf");

  assert.equal((await assetReadAccess(student, firstFile)).status, 200, "el estudiante dueño");
  assert.equal((await assetReadAccess(student2, firstFile)).status, 403, "otro estudiante del mismo curso");
  assert.equal((await assetReadAccess(teacher, firstFile)).status, 200, "el docente del curso");
  assert.equal((await assetReadAccess(admin, firstFile)).status, 200, "la administración que gestiona todos los cursos");
  assert.equal((await assetReadAccess(teacher2, firstFile)).status, 403, "un docente de otro curso");
  assert.equal((await assetReadAccess(teacherB, firstFile)).status, 404, "otra institución");
  assert.equal((await assetReadAccess(adminB, firstFile)).status, 404, "otra institución");

  assert.deepEqual((await submissionFilesForManager(teacher, submissionId)).map((file) => file.id), [firstFile]);
  assert.deepEqual(await submissionFilesForManager(teacher2, submissionId), []);
  assert.deepEqual(await submissionFilesForManager(adminB, submissionId), []);
});

test("entrega: otro estudiante, otro docente u otra institución no pueden adjuntar a esta tarea", async () => {
  const input = { purpose: "submission" as const, name: "x.pdf", type: "application/pdf", size: PDF.length, assignmentId: ASSIGNMENT };
  assert.equal((await prepareUpload(teacher, input)).ok, false);
  assert.equal((await prepareUpload(actor(B.student), input)).ok, false);
  assert.equal((await prepareUpload(actor({ id: "a_suspended", institutionId: A.institutionId, role: "STUDENT" }), input)).ok, false);
  // El archivo ya entregado no se puede descartar ni borrar como una subida suelta.
  assert.equal((await discardUpload(student, firstFile)).ok, false);
  assert.equal((await discardUpload(student2, firstFile)).ok, false);
  // Un archivo listo de otro estudiante no se puede usar en la entrega propia.
  const foreign = await uploaded(student2, "submission", pdf("de otro.pdf"), { assignmentId: ASSIGNMENT });
  const stolen = await submitAssignmentWithFiles(student, { assignmentId: ASSIGNMENT, content: "Mi texto", assetIds: [firstFile, foreign] });
  assert.equal(stolen.ok, false);
  assert.equal((await db.storageAsset.findUniqueOrThrow({ where: { id: foreign }, select: { submissionId: true } })).submissionId, null);
  assert.equal((await discardUpload(student2, foreign)).ok, true);
  assert.equal(await db.storageAsset.count({ where: { id: foreign } }), 0);
});

test("contenido que no corresponde a su tipo se rechaza y se borra", async () => {
  const { assetId, confirmed } = await upload(student, "submission", { name: "trampa.pdf", type: "application/pdf", bytes: EXE }, { assignmentId: ASSIGNMENT });
  assert.equal(confirmed.ok, false);
  if (!confirmed.ok) assert.equal(confirmed.status, 409);
  assert.equal(await db.storageAsset.count({ where: { id: assetId } }), 0);
});

test("al reenviar, la versión anterior conserva sus archivos", async () => {
  const second = await uploaded(student, "submission", png("foto de la tarea.png"), { assignmentId: ASSIGNMENT });
  const tooMany = await submitAssignmentWithFiles(student, { assignmentId: ASSIGNMENT, assetIds: [second, "a", "b", "c", "d", "e"] });
  assert.equal(tooMany.ok, false);

  const result = await submitAssignmentWithFiles(student, { assignmentId: ASSIGNMENT, content: "Versión corregida", assetIds: [second] });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.equal(result.resubmitted, true);
  const revision = await db.submissionRevision.findFirstOrThrow({ where: { submissionId }, orderBy: { createdAt: "desc" }, select: { assetIds: true } });
  assert.deepEqual(revision.assetIds, [firstFile]);

  const files = await submissionFilesForStudent(student, ASSIGNMENT);
  assert.deepEqual(files.current.map((file) => file.id), [second]);
  assert.equal(files.pending.length, 0);
  // El archivo de la versión anterior no se borró y sigue con los mismos permisos.
  const old = await db.storageAsset.findUniqueOrThrow({ where: { id: firstFile }, select: { submissionId: true, objectPath: true } });
  assert.equal(old.submissionId, null);
  await stat(resolveLocalStorageObject(root, old.objectPath));
  assert.equal((await assetReadAccess(student, firstFile)).status, 200);
  assert.equal((await assetReadAccess(teacher, firstFile)).status, 200);
  assert.equal((await assetReadAccess(student2, firstFile)).status, 403);
  assert.equal((await discardUpload(student, firstFile)).ok, false, "lo que ya fue entregado no se borra");
});

test("la ruta pública solo sirve la imagen del curso o el logo en uso", async () => {
  assert.equal(await publicImageAsset(firstFile), null, "un archivo de entrega no es público");
  assert.equal((await readPublicImage(firstFile)).status, 404);

  const avatar = await uploaded(student, "avatar", png("yo.png"));
  assert.equal((await setAvatar(student, avatar)).ok, true);
  assert.equal(await publicImageAsset(avatar), null, "una foto de perfil no es pública");
  assert.equal((await assetReadAccess(student2, avatar)).status, 403);

  // Subida de portada aún sin usar: tampoco se sirve.
  const cover = await uploaded(teacher, "course-image", png(), { courseId: A.courseId });
  assert.equal(await publicImageAsset(cover), null);
  assert.equal((await setCourseImage(teacher, A.courseId, cover)).ok, true);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: A.courseId }, select: { imageUrl: true } })).imageUrl, publicImageUrl(cover));
  const response = await readPublicImage(cover);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /public/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);

  const previousRoot = process.env.PLATFORM_ROOT_DOMAIN;
  process.env.PLATFORM_ROOT_DOMAIN = "upload-host.test";
  try {
    const b = await db.institution.findUniqueOrThrow({ where: { id: B.institutionId }, select: { slug: true } });
    const host = `${b.slug}.upload-host.test`;
    const foreign = await withRequestHost(host, () => publicImageGet(new Request(`https://${host}/`), {
      params: Promise.resolve({ assetId: cover }),
    }));
    assert.equal(foreign.status, 404, "el dominio de B no sirve la imagen pública de A");
  } finally {
    if (previousRoot === undefined) delete process.env.PLATFORM_ROOT_DOMAIN;
    else process.env.PLATFORM_ROOT_DOMAIN = previousRoot;
  }
});

test("permisos de imagen: solo quien edita el curso o la configuración de la institución", async () => {
  const image = { purpose: "course-image" as const, name: "p.png", type: "image/png", size: PNG.length, courseId: A.courseId };
  assert.equal((await prepareUpload(student, image)).ok, false);
  assert.equal((await prepareUpload(teacher2, image)).ok, false);
  assert.equal((await prepareUpload(adminB, image)).ok, false);
  assert.equal((await prepareUpload(teacher, { ...image, purpose: "logo", courseId: null })).ok, false);
  const someoneElses = await uploaded(student, "avatar", png("otra.png"));
  assert.equal((await setCourseImage(teacher, A.courseId, someoneElses)).ok, false, "no se usa un archivo ajeno como portada");
  assert.equal((await removeCourseImage(teacher2, A.courseId)).ok, false);
  assert.equal((await removeCourseImage(adminB, A.courseId)).ok, false);
});

test("quitar la imagen limpia el campo y borra el archivo", async () => {
  const current = await db.course.findUniqueOrThrow({ where: { id: A.courseId }, select: { imageUrl: true } });
  const coverId = current.imageUrl?.split("/").pop() ?? "";
  const replacement = await uploaded(admin, "course-image", png("nueva.png"), { courseId: A.courseId });
  assert.equal((await setCourseImage(admin, A.courseId, replacement)).ok, true);
  assert.equal(await db.storageAsset.count({ where: { id: coverId } }), 0, "la portada reemplazada se borra");

  const asset = await db.storageAsset.findUniqueOrThrow({ where: { id: replacement }, select: { objectPath: true } });
  assert.equal((await removeCourseImage(teacher, A.courseId)).ok, true);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: A.courseId }, select: { imageUrl: true } })).imageUrl, null);
  assert.equal(await db.storageAsset.count({ where: { id: replacement } }), 0);
  await assert.rejects(stat(resolveLocalStorageObject(root, asset.objectPath)));
  assert.equal(await publicImageAsset(replacement), null);

  const logo = await uploaded(admin, "logo", png("logo.png"));
  assert.equal((await setInstitutionLogo(admin, logo)).ok, true);
  assert.notEqual(await publicImageAsset(logo), null);
  assert.equal((await setInstitutionLogo(adminB, logo)).ok, false);
  assert.equal((await removeInstitutionLogo(admin)).ok, true);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select: { logoUrl: true } })).logoUrl, null);
  assert.equal(await publicImageAsset(logo), null);

  assert.equal((await removeAvatar(student)).ok, true);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: A.student.id }, select: { avatarUrl: true } })).avatarUrl, null);
});
