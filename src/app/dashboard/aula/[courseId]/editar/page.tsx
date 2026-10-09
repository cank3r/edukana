import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { CourseForm } from "../../nuevo/CourseForm";
import { CourseStateTools } from "./CourseStateTools";

export const dynamic = "force-dynamic";

export default async function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const scope = resolveCourseWriteScope(user, capabilities);
  const canOpen = capabilities.has("course.edit") || capabilities.has("course.publish") || capabilities.has("course.archive");
  const where = courseWhereForScope(user.institutionId, scope);
  if (!canOpen || !where || (scope.kind !== "all" && scope.kind !== "teacher")) notFound();

  const { courseId } = await params;
  const course = await db.course.findFirst({
    where: { id: courseId, ...where },
    select: {
      id: true,
      name: true,
      description: true,
      code: true,
      maxStudents: true,
      teacherId: true,
      periodId: true,
      isPublished: true,
      archivedAt: true,
      teacher: { select: { id: true, name: true } },
    },
  });
  if (!course) notFound();

  const [periods, activeTeachers, activeStudents] = await Promise.all([
    db.academicPeriod.findMany({
      where: { institutionId: user.institutionId },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
    scope.kind === "all"
      ? db.user.findMany({
          where: { institutionId: user.institutionId, role: "TEACHER", status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    db.enrollment.count({ where: { institutionId: user.institutionId, courseId: course.id, status: "ACTIVE" } }),
  ]);
  const teachers = activeTeachers.some((teacher) => teacher.id === course.teacherId)
    ? activeTeachers
    : [course.teacher, ...activeTeachers];
  const isArchived = Boolean(course.archivedAt);
  const canEdit = capabilities.has("course.edit") && !isArchived;
  const canPublish = capabilities.has("course.publish") && scope.kind === "all";
  const canArchive = capabilities.has("course.archive") && scope.kind === "all";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-sm font-semibold text-blue-700">Cursos</p>
        <h1 className="text-2xl font-bold text-slate-950">Editar curso</h1>
        <p className="mt-1 text-sm text-slate-600">{course.name}</p>
      </header>

      {isArchived && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">
          <strong>Vista de consulta.</strong> Este curso está archivado y no admite cambios. Si tienes permiso, restáuralo como borrador para editarlo.
        </div>
      )}

      {canEdit && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="course-data-heading">
          <h2 id="course-data-heading" className="mb-4 text-lg font-bold text-slate-950">Datos del curso</h2>
          <CourseForm
            course={{
              id: course.id,
              name: course.name,
              description: course.description ?? "",
              teacherId: course.teacherId,
              periodId: course.periodId,
              code: course.code ?? "",
              maxStudents: course.maxStudents?.toString() ?? "",
            }}
            teachers={teachers}
            periods={periods}
            fixedTeacherId={scope.kind === "teacher" ? scope.teacherId : undefined}
          />
        </section>
      )}

      {(canPublish || canArchive) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="course-state-heading">
          <h2 id="course-state-heading" className="mb-2 text-lg font-bold text-slate-950">Estado del curso</h2>
          <p className="mb-4 text-sm text-slate-600">Controla cuándo aparece para los estudiantes. Archivar conserva todo el historial.</p>
          <CourseStateTools
            courseId={course.id}
            courseName={course.name}
            isPublished={course.isPublished}
            isArchived={isArchived}
            canPublish={canPublish}
            canArchive={canArchive}
            activeStudents={activeStudents}
          />
        </section>
      )}
    </div>
  );
}
