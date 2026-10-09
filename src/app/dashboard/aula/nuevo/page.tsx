import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { CourseForm } from "./CourseForm";

export const dynamic = "force-dynamic";

const primary = "mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";

export default async function NewCoursePage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const scope = resolveCourseWriteScope(user, capabilities);
  if (scope.kind !== "all" && scope.kind !== "teacher") notFound();

  const [periods, teachers] = await Promise.all([
    db.academicPeriod.findMany({ where: { institutionId: user.institutionId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    scope.kind === "all"
      ? db.user.findMany({ where: { institutionId: user.institutionId, role: "TEACHER", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 })
      : Promise.resolve([]),
  ]);
  const canSetUp = capabilities.has("people.manage") && capabilities.has("academic.structure.manage");

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Crear curso</h1>
      <p className="mt-1 text-sm text-slate-600">Solo lo esencial. Después podrás agregar lecciones, estudiantes y tareas.</p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        {periods.length === 0 ? (
          <div>
            <p className="font-semibold text-slate-950">Primero hace falta un período.</p>
            <p className="mt-1 text-sm text-slate-600">Un período es el tramo del año en que se da el curso (por ejemplo, «Año 2026–2027» o «Primer semestre»). Tu institución todavía no tiene ninguno.</p>
            {canSetUp
              ? <Link href="/dashboard/configuracion/periodos" className={primary}>Crear un período</Link>
              : <p className="mt-3 text-sm text-slate-600">Pide a la administración que lo cree y vuelve aquí.</p>}
          </div>
        ) : scope.kind === "all" && teachers.length === 0 ? (
          <div>
            <p className="font-semibold text-slate-950">Primero hace falta un docente.</p>
            <p className="mt-1 text-sm text-slate-600">Cada curso tiene un docente a cargo y tu institución todavía no tiene docentes activos.</p>
            {capabilities.has("people.manage")
              ? <Link href="/dashboard/gestion" className={primary}>Agregar personas</Link>
              : <p className="mt-3 text-sm text-slate-600">Pide a la administración que agregue al docente y vuelve aquí.</p>}
          </div>
        ) : (
          <CourseForm teachers={teachers} periods={periods} fixedTeacherId={scope.kind === "teacher" ? scope.teacherId : undefined} />
        )}
      </div>
    </div>
  );
}
