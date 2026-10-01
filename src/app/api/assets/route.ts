import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadPrivateAsset } from "@/lib/storage";
import { validateUpload } from "@/lib/lms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const fd = await request.formData();
  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "DOCUMENT") as "DOCUMENT" | "VIDEO";
  const courseId = String(fd.get("courseId") ?? "") || null;
  const lessonId = String(fd.get("lessonId") ?? "") || null;
  const assignmentId = String(fd.get("assignmentId") ?? "") || null;
  const submissionId = String(fd.get("submissionId") ?? "") || null;
  if (!(file instanceof File) || !["DOCUMENT", "VIDEO"].includes(kind)) return Response.json({ error: "Archivo inválido" }, { status: 400 });
  const validationError = validateUpload(file, kind);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const isStudent = user.role === "STUDENT";
  if (isStudent && !submissionId) return Response.json({ error: "Los estudiantes solo pueden adjuntar archivos a sus entregas." }, { status: 403 });
  if (submissionId) {
    const submission = await db.submission.findFirst({ where: { id: submissionId, ...(isStudent ? { studentId: user.id } : {}), assignment: { course: { institutionId: user.institutionId, ...(!isStudent && user.role === "TEACHER" ? { teacherId: user.id } : {}) } } }, select: { id: true, assignment: { select: { courseId: true } } } });
    if (!submission) return Response.json({ error: "Entrega no disponible" }, { status: 403 });
    if (courseId && courseId !== submission.assignment.courseId) return Response.json({ error: "Curso inconsistente" }, { status: 400 });
  } else if (courseId) {
    const course = await db.course.findFirst({ where: { id: courseId, institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}), ...(isStudent ? { enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } : {}) }, select: { id: true } });
    if (!course) return Response.json({ error: "Curso no disponible" }, { status: 403 });
  } else return Response.json({ error: "El archivo debe pertenecer a un curso." }, { status: 400 });

  if (lessonId && !(await db.lesson.findFirst({ where: { id: lessonId, institutionId: user.institutionId, courseId: courseId ?? undefined }, select: { id: true } }))) return Response.json({ error: "Lección inválida" }, { status: 400 });
  if (assignmentId && !(await db.assignment.findFirst({ where: { id: assignmentId, course: { institutionId: user.institutionId, ...(courseId ? { id: courseId } : {}) } }, select: { id: true } }))) return Response.json({ error: "Asignación inválida" }, { status: 400 });

  try {
    const stored = await uploadPrivateAsset({ institutionId: user.institutionId, courseId, file });
    const checksum = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const asset = await db.storageAsset.create({ data: { institutionId: user.institutionId, courseId, lessonId, assignmentId, submissionId, uploaderId: user.id, bucket: stored.bucket, objectPath: stored.objectPath, originalName: file.name, mimeType: file.type, sizeBytes: file.size, kind, visibility: isStudent ? "PRIVATE" : "COURSE", checksum } });
    return Response.json({ ok: true, id: asset.id, retrievalUrl: `/api/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar el archivo." }, { status: 503 });
  }
}
