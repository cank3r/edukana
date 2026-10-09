import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { ImageUploader } from "@/components/dashboard/ImageUploader";
import { courseUsage } from "@/server/courses/course";
import { CourseForm } from "../../nuevo/CourseForm";
import { CourseStateTools } from "./CourseStateTools";

export const dynamic = "force-dynamic";

export default async function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const scope = resolveCourseWriteScope(user, capabilities);
  const where = courseWhereForScope(user.institutionId, scope);
  if (!where || (scope.kind !== "all" && scope.kind !== "teacher")) notFound();

  const course = await db.course.findFirst({
    where: { id: courseId, ...where },
    select: { id: true, name: true, description: true, code: true, maxStudents: true, teacherId: true, periodId: true, isPublished: true, archivedAt: true, imageUrl: true, teacher: { select: { id: true, name: true } } },
  });
  if (!course) notFound();

  const [periods, activeTeachers, usage, activeStudents] = await Promise.all([
    db.academicPeriod.findMany({ where: { institutionId: user.institutionId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    scope.kind === "all"
      ? db.user.findMany({ where: { institutionId: user.institutionId, role: "TEACHER", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 })
      : Promise.resolve([]),
    courseUsage(user.institutionId, course.id),
    db.enrollment.count({ where: { courseId: course.id, status: "ACTIVE" } }),
  ]);
  // El docente actual sigue en la lista aunque ya no esté activo, para no cambiarlo sin querer.
  const teachers = activeTeachers.some((teacher) => teacher.id === course.teacherId) ? activeTeachers : [course.teacher, ...activeTeachers];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Editar curso</h1>
        <p className="mt-1 text-sm text-slate-600">{course.name}</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="datos-curso">
        <h2 id="datos-curso" className="mb-4 text-lg font-bold text-slate-950">Datos del curso</h2>
        <CourseForm
          course={{ id: course.id, name: course.name, description: course.description ?? "", teacherId: course.teacherId, periodId: course.periodId, code: course.code ?? "", maxStudents: course.maxStudents?.toString() ?? "" }}
          teachers={teachers}
          periods={periods}
          fixedTeacherId={scope.kind === "teacher" ? scope.teacherId : undefined}
        />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="imagen-curso">
        <h2 id="imagen-curso" className="mb-4 text-lg font-bold text-slate-950">Imagen del curso</h2>
        <ImageUploader purpose="course-image" courseId={course.id} imageUrl={course.imageUrl} alt={`Imagen del curso ${course.name}`} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="estado-curso">
        <h2 id="estado-curso" className="mb-4 text-lg font-bold text-slate-950">Quién ve el curso</h2>
        <CourseStateTools courseId={course.id} courseName={course.name} isPublished={course.isPublished} isArchived={Boolean(course.archivedAt)} canDelete={usage.empty} activeStudents={activeStudents} />
      </section>
    </div>
  );
}
