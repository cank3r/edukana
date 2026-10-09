import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { plural, roleLabel, spanishLabel } from "@/lib/ux";
import { getPersonDetail, type PersonAccessState } from "@/server/people/detail";
import { PersonAccess } from "../../accesos/AccessTools";

export const dynamic = "force-dynamic";

const RELATIONSHIP: Record<string, string> = { MOTHER: "Madre", FATHER: "Padre", LEGAL_GUARDIAN: "Tutor legal", OTHER: "Otro vínculo" };
const ACCESS: Record<PersonAccessState, { label: string; detail: string; tone: string }> = {
  HAS_PASSWORD: { label: "Puede entrar", detail: "Ya creó su contraseña.", tone: "bg-emerald-50 text-emerald-700" },
  INVITED: { label: "Invitación pendiente", detail: "Le enviamos la invitación y aún no crea su contraseña.", tone: "bg-amber-50 text-amber-800" },
  EXPIRED: { label: "La invitación venció", detail: "Se le invitó, pero el enlace venció sin usarse. Envíale otra invitación.", tone: "bg-amber-50 text-amber-800" },
  NOT_INVITED: { label: "Sin invitar", detail: "Todavía no recibió la invitación para crear su contraseña.", tone: "bg-slate-100 text-slate-700" },
  SUSPENDED: { label: "Suspendido", detail: "No puede entrar. Sus cursos y notas se conservan; vuelven al reactivarlo.", tone: "bg-red-50 text-red-700" },
};
const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const link = "inline-flex min-h-11 items-center font-semibold text-blue-700 underline";

export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.view")) redirect("/dashboard");

  const { userId } = await params;
  const detail = await getPersonDetail({ id: user.id, institutionId: user.institutionId, role: user.role }, userId);
  if (!detail) notFound();
  const { person, access } = detail;
  const canManage = capabilities.has("people.manage");
  const institution = await db.institution.findUnique({ where: { id: user.institutionId }, select: { timezone: true } });
  const date = new Intl.DateTimeFormat("es", { timeZone: institution?.timezone ?? "America/Santo_Domingo", dateStyle: "medium" });
  const state = ACCESS[access];
  const isStudent = person.role === "STUDENT";
  const isParent = person.role === "PARENT";
  const showTeaching = detail.teaches.length > 0 || person.role === "TEACHER";
  const showLearning = detail.enrollments.length > 0 || isStudent;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{person.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-800">{roleLabel(person.role)}</span>
          <span className={`rounded-full px-2 py-1 font-semibold ${state.tone}`}>{state.label}</span>
        </p>
      </header>

      <section aria-labelledby="ficha-datos" className={card}>
        <h2 id="ficha-datos" className="font-semibold text-slate-950">Datos</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Correo" value={person.email} />
          <Item label="Teléfono" value={person.phone ?? "No indicado"} />
          <Item label="Rol" value={roleLabel(person.role)} />
          <Item label="En la institución desde" value={date.format(person.createdAt)} />
        </dl>
      </section>

      <section aria-labelledby="ficha-acceso" className={card}>
        <h2 id="ficha-acceso" className="font-semibold text-slate-950">Acceso</h2>
        <p className="mt-1 text-sm text-slate-700">
          {state.detail}
          {access === "INVITED" && detail.invitedAt ? ` Invitación enviada el ${date.format(detail.invitedAt)}.` : ""}
        </p>
        {canManage && (
          <ul className="mt-1">
            <PersonAccess
              showSummary={false}
              person={{
                id: person.id,
                name: person.name,
                email: person.email,
                phone: person.phone ?? "",
                role: person.role,
                roleLabel: roleLabel(person.role),
                suspended: person.status !== "ACTIVE",
                hasPassword: detail.hasPassword,
                isSelf: person.id === user.id,
              }}
            />
          </ul>
        )}
      </section>

      {showTeaching && (
        <section aria-labelledby="ficha-ensena" className={card}>
          <h2 id="ficha-ensena" className="font-semibold text-slate-950">Cursos que enseña</h2>
          {detail.teaches.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">Todavía no tiene cursos a su cargo. Se le asigna un curso al crearlo o editarlo en «Cursos».</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {detail.teaches.map((course) => (
                <li key={course.id} className="py-2">
                  <Link className={link} href={`/dashboard/aula/${course.id}`}>{course.name}</Link>
                  <p className="text-sm text-slate-600">
                    {plural(course.activeStudents, "estudiante cursándolo ahora", "estudiantes cursándolo ahora")}
                    {course.archived ? " · Archivado" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showLearning && (
        <section aria-labelledby="ficha-cursos" className={card}>
          <h2 id="ficha-cursos" className="font-semibold text-slate-950">Cursos en los que está inscrito</h2>
          {detail.enrollments.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">No está inscrito en ningún curso. Se inscribe desde la pantalla de estudiantes de cada curso.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {detail.enrollments.map((row) => (
                <li key={row.id} className="py-2">
                  <Link className={link} href={`/dashboard/aula/${row.course.id}`}>{row.course.name}</Link>
                  <p className="text-sm text-slate-600">{spanishLabel(row.status)} · {Math.round(row.progressPercent)} % de avance</p>
                </li>
              ))}
            </ul>
          )}
          {isStudent && (
            <Link className={link} href={`/dashboard/gestion/estudiantes/${person.id}`}>Ver notas, asistencia y cuenta</Link>
          )}
        </section>
      )}

      {isParent && user.role !== "TEACHER" && (
        <Family
          title="Hijos vinculados"
          empty="No tiene hijos vinculados. Sin un vínculo activo no ve nada de ningún estudiante."
          rows={detail.children}
          canLink={capabilities.has("guardianship.manage")}
        />
      )}
      {isStudent && user.role !== "TEACHER" && (
        <Family
          title="Tutores"
          empty="No tiene tutores vinculados."
          rows={detail.guardians}
          canLink={capabilities.has("guardianship.manage")}
        />
      )}
    </div>
  );
}

function Family({ title, empty, rows, canLink }: { title: string; empty: string; rows: Array<{ id: string; relationship: string; status: string; person: { id: string; name: string } }>; canLink: boolean }) {
  return (
    <section aria-label={title} className={card}>
      <h2 className="font-semibold text-slate-950">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              <Link className={link} href={`/dashboard/gestion/personas/${row.person.id}`}>{row.person.name}</Link>
              <p className="text-sm text-slate-600">{RELATIONSHIP[row.relationship] ?? "Otro vínculo"} · {row.status === "ACTIVE" ? "Vínculo activo" : "Vínculo pendiente: aún no ve nada"}</p>
            </li>
          ))}
        </ul>
      )}
      {canLink && <Link className={link} href="/dashboard/configuracion/tutores">Gestionar vínculos de tutores</Link>}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-words text-slate-900">{value}</dd>
    </div>
  );
}
