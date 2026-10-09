import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { roleLabel } from "@/lib/ux";
import { getPersonDetail } from "@/server/people/detail";
import { PersonAccess } from "../../accesos/AccessTools";

export const dynamic = "force-dynamic";

const RELATIONSHIP: Record<string, string> = { MOTHER: "Madre", FATHER: "Padre", LEGAL_GUARDIAN: "Tutor legal", OTHER: "Otro vínculo" };
const ENROLLMENT: Record<string, string> = { ACTIVE: "Inscrito", COMPLETED: "Completó el curso", DROPPED: "Retirado", FAILED: "No aprobó" };
const ACCESS = {
  ready: { label: "Ya creó su contraseña", detail: "Puede entrar cuando quiera.", className: "bg-emerald-50 text-emerald-800" },
  invited: { label: "Invitación pendiente", detail: "Ya recibió el correo; falta que cree su contraseña.", className: "bg-amber-50 text-amber-900" },
  pending: { label: "Aún no recibe invitación", detail: "No puede entrar hasta que le envíes la invitación.", className: "bg-amber-50 text-amber-900" },
} as const;

/** Ficha de cualquier persona de la institución, con sus acciones de siempre: corregir, invitar y suspender. */
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.view")) redirect("/dashboard");
  const { userId } = await params;
  // Un docente solo ve a sus estudiantes, en la ficha de estudiante que ya filtra por sus cursos.
  if (user.role === "TEACHER") redirect(`/dashboard/gestion/estudiantes/${encodeURIComponent(userId)}`);

  const person = await getPersonDetail(user.institutionId, userId);
  if (!person) notFound();
  const canManage = capabilities.has("people.manage");
  const suspended = person.status !== "ACTIVE";
  const access = ACCESS[person.access];
  const isStudent = person.role === "STUDENT";

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <nav className="text-sm">
        <Link href="/dashboard/gestion" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Volver a Personas</Link>
      </nav>

      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{person.name}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-700">{roleLabel(person.role)}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
          <span className="flex min-w-0 items-center gap-1 break-all"><Mail size={14} aria-hidden="true" />{person.email}</span>
          {person.phone && <span className="flex items-center gap-1"><Phone size={14} aria-hidden="true" />{person.phone}</span>}
        </div>
        <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {suspended ? (
            <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Suspendido: no puede entrar</span>
          ) : (
            <span className={`rounded-full px-2 py-1 ${access.className}`}>{access.label}</span>
          )}
        </p>
        {!suspended && person.access !== "ready" && <p className="mt-2 text-sm text-slate-600">{access.detail}</p>}
        {canManage && (
          <ul aria-label="Acciones">
            <PersonAccess
              actionsOnly
              person={{
                id: person.id,
                name: person.name,
                email: person.email,
                phone: person.phone ?? "",
                role: person.role,
                roleLabel: roleLabel(person.role),
                suspended,
                hasPassword: person.access === "ready",
                isSelf: person.id === user.id,
              }}
            />
          </ul>
        )}
      </header>

      {(person.taughtCourses.length > 0 || person.role === "TEACHER") && (
        <section aria-labelledby="cursos-que-ensena" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="cursos-que-ensena" className="text-lg font-bold text-slate-950">Cursos que enseña</h2>
          {person.taughtCourses.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Todavía no tiene cursos a su cargo. Se le asigna un curso al crearlo o editarlo en Cursos.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {person.taughtCourses.map((course) => (
                <li key={course.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/dashboard/aula/${course.id}`} className="inline-flex min-h-11 min-w-0 items-center font-semibold text-blue-700 underline">{course.name}</Link>
                  <span className="text-sm text-slate-600">
                    {course.students === 1 ? "1 estudiante" : `${course.students} estudiantes`}{course.archivedAt ? " · Archivado" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(person.enrollments.length > 0 || isStudent) && (
        <section aria-labelledby="cursos-inscrito" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="cursos-inscrito" className="text-lg font-bold text-slate-950">Cursos en los que está inscrito</h2>
          {person.enrollments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No está inscrito en ningún curso. Se inscribe desde la pestaña Estudiantes de cada curso.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {person.enrollments.map((enrollment) => (
                <li key={enrollment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/dashboard/aula/${enrollment.course.id}`} className="inline-flex min-h-11 min-w-0 items-center font-semibold text-blue-700 underline">{enrollment.course.name}</Link>
                  <span className="text-sm text-slate-600">
                    {ENROLLMENT[enrollment.status] ?? "Inscrito"}{enrollment.status === "ACTIVE" ? ` · ${Math.round(enrollment.progressPercent)} % de avance` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isStudent && (
            <Link href={`/dashboard/gestion/estudiantes/${person.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">
              Ver notas, asistencia y cuenta
            </Link>
          )}
        </section>
      )}

      {person.role === "PARENT" && (
        <section aria-labelledby="hijos" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="hijos" className="text-lg font-bold text-slate-950">Estudiantes a su cargo</h2>
          {person.children.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Todavía no tiene estudiantes vinculados.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {person.children.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/dashboard/gestion/personas/${link.student.id}`} className="inline-flex min-h-11 min-w-0 items-center font-semibold text-blue-700 underline">{link.student.name}</Link>
                  <span className="text-sm text-slate-600">{RELATIONSHIP[link.relationship] ?? "Vínculo"}{link.status === "PENDING" ? " · Por confirmar" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {capabilities.has("guardianship.manage") && (
            <Link href="/dashboard/configuracion/tutores" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Gestionar vínculos de tutores</Link>
          )}
        </section>
      )}
    </div>
  );
}
