import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPrivateAssetUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/lms";
import { z } from "zod";

export const runtime = "nodejs";

const staffRoles = new Set(["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER"]);
const requestSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(160),
  size: z.number().int().positive(),
  kind: z.enum(["DOCUMENT", "VIDEO"]),
  courseId: z.string().min(1).nullable().optional(),
  lessonId: z.string().min(1).nullable().optional(),
  assignmentId: z.string().min(1).nullable().optional(),
  submissionId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!staffRoles.has(user.role) && user.role !== "STUDENT") return Response.json({ error: "Permisos insuficientes" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Solicitud de carga inválida" }, { status: 400 });
  const input = parsed.data;
  const validationError = validateUpload(input, input.kind);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  const isStudent = user.role === "STUDENT";
  if (isStudent && (!input.submissionId || input.kind !== "DOCUMENT")) return Response.json({ error: "Los estudiantes solo pueden adjuntar documentos a sus entregas." }, { status: 403 });

  let courseId = input.courseId ?? null;
  if (input.submissionId) {
    const submission = await db.submission.findFirst({
      where: {
        id: input.submissionId,
        ...(isStudent ? { studentId: user.id } : {}),
        assignment: { course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } },
      },
      select: { assignmentId: true, assignment: { select: { courseId: true } } },
    });
    if (!submission) return Response.json({ error: "Entrega no disponible" }, { status: 403 });
    if ((courseId && courseId !== submission.assignment.courseId) || (input.assignmentId && input.assignmentId !== submission.assignmentId)) return Response.json({ error: "Relaciones de archivo inconsistentes" }, { status: 400 });
    courseId = submission.assignment.courseId;
  } else if (isStudent) return Response.json({ error: "La entrega es obligatoria" }, { status: 403 });

  if (input.lessonId) {
    const lesson = await db.lesson.findFirst({ where: { id: input.lessonId, institutionId: user.institutionId }, select: { courseId: true } });
    if (!lesson || (courseId && courseId !== lesson.courseId)) return Response.json({ error: "Lección inválida o de otro curso" }, { status: 400 });
    courseId = lesson.courseId;
  }
  if (input.assignmentId) {
    const assignment = await db.assignment.findFirst({ where: { id: input.assignmentId, course: { institutionId: user.institutionId } }, select: { courseId: true } });
    if (!assignment || (courseId && courseId !== assignment.courseId)) return Response.json({ error: "Asignación inválida o de otro curso" }, { status: 400 });
    courseId = assignment.courseId;
  }
  if (!courseId) return Response.json({ error: "El archivo debe pertenecer a un curso" }, { status: 400 });

  const course = await db.course.findFirst({ where: { id: courseId, institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) }, select: { id: true } });
  if (!course) return Response.json({ error: "Curso no disponible" }, { status: 403 });

  try {
    const upload = await createPrivateAssetUpload({ institutionId: user.institutionId, courseId, fileName: input.name });
    const asset = await db.storageAsset.create({
      data: {
        institutionId: user.institutionId,
        courseId,
        lessonId: input.lessonId ?? null,
        assignmentId: input.assignmentId ?? null,
        submissionId: input.submissionId ?? null,
        uploaderId: user.id,
        bucket: upload.bucket,
        objectPath: upload.objectPath,
        originalName: input.name,
        mimeType: input.type,
        sizeBytes: input.size,
        kind: input.kind,
        visibility: isStudent ? "PRIVATE" : "COURSE",
      },
    });
    return Response.json({ assetId: asset.id, uploadUrl: upload.signedUrl, retrievalUrl: `/api/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo preparar la carga." }, { status: 503 });
  }
}
