import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { CourseForm } from "./CourseForm";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const scope = resolveCourseWriteScope(user, capabilities);
  if (!capabilities.has("course.create") || scope.kind !== "all") notFound();

  const [periods, teachers] = await Promise.all([
    db.academicPeriod.findMany({
      where: { institutionId: user.institutionId },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
    db.user.findMany({
      where: { institutionId: user.institutionId, role: "TEACHER", status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <header>
        <p className="text-sm font-semibold text-blue-700">Cursos</p>
        <h1 className="text-2xl font-bold text-slate-950">Crear curso</h1>
        <p className="mt-1 text-sm text-slate-600">Completa lo esencial. Después podrás agregar contenido y estudiantes.</p>
      </header>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        {periods.length === 0 ? (
          <div>
            <h2 className="font-semibold text-slate-950">Primero crea un período</h2>
            <p className="mt-1 text-sm text-slate-600">El período indica cuándo se imparte el curso. Tu institución todavía no tiene uno.</p>
            <Link href="/dashboard/configuracion/puesta-en-marcha" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
              Crear período
            </Link>
          </div>
        ) : teachers.length === 0 ? (
          <div>
            <h2 className="font-semibold text-slate-950">Primero agrega un docente</h2>
            <p className="mt-1 text-sm text-slate-600">Cada curso necesita una persona docente activa.</p>
            <Link href="/dashboard/gestion/accesos" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
              Agregar docente
            </Link>
          </div>
        ) : (
          <CourseForm teachers={teachers} periods={periods} />
        )}
      </div>
    </div>
  );
}
