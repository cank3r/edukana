import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { findStudentsToAdd, getGroup, previewGroupEnrollment } from "@/server/academic/groups";
import { addGroupCoursesAction, addGroupMembersAction, deleteGroupAction, removeGroupCourseAction, removeGroupMemberAction } from "@/server/actions/groups";
import { DeleteWithImpact, PickAndAdd, RowButton } from "../../programas/ProgramTools";
import { groupDates, groupOccupancy } from "../format";
import { EnrollGroup, GroupForm } from "../GroupTools";

export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 50;
const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export default async function GroupDetailPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ q?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("academic.structure.manage")) redirect("/dashboard");

  const { groupId } = await params;
  const rawQuery = (await searchParams).q;
  const q = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 100) : "";
  const group = await getGroup(user.institutionId, groupId);
  if (!group) notFound();

  const inGroup = group.courses.map((row) => row.courseId);
  const [candidates, availableCourses, programs, plan] = await Promise.all([
    findStudentsToAdd(user.institutionId, group.id, q, SEARCH_LIMIT),
    db.course.findMany({
      where: { institutionId: user.institutionId, archivedAt: null, id: { notIn: inGroup } },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, code: true },
    }),
    db.program.findMany({
      where: { institutionId: user.institutionId, OR: [{ isPublished: true }, { id: group.programId ?? "" }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    previewGroupEnrollment(user.institutionId, group.id),
  ]);

  const members = group.members.length;
  const seatsLeft = group.capacity === null ? null : Math.max(0, group.capacity - members);
  const full = seatsLeft === 0;
  const here = `/dashboard/gestion/grupos/${group.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{group.name}</h1>
        <p className="text-sm text-slate-600">
          {group.program ? <>Programa: <Link className="font-semibold text-blue-700 underline" href={`/dashboard/gestion/programas/${group.program.id}`}>{group.program.name}</Link></> : "Sin programa"} · {groupDates(group.startsOn, group.endsOn)} · {groupOccupancy(members, group.capacity)}
        </p>
        {group.description && <p className="whitespace-pre-line text-sm text-slate-600">{group.description}</p>}
        <GroupForm
          programs={programs}
          group={{ id: group.id, name: group.name, description: group.description ?? "", programId: group.programId ?? "", startsOn: day(group.startsOn), endsOn: day(group.endsOn), capacity: group.capacity === null ? "" : String(group.capacity) }}
        />
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="estudiantes-grupo">
        <h2 id="estudiantes-grupo" className="text-lg font-bold text-slate-950">1. Estudiantes</h2>
        <p className="mt-1 text-sm text-slate-600">
          {groupOccupancy(members, group.capacity)}.
          {seatsLeft !== null && (full ? " El grupo está lleno." : ` ${seatsLeft === 1 ? "Queda 1 cupo" : `Quedan ${seatsLeft} cupos`}.`)}
        </p>
        {members === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Este grupo todavía no tiene estudiantes. Búscalos abajo y márcalos para agregarlos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {group.members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">
                    <Link className="text-blue-700 underline" href={`/dashboard/gestion/estudiantes/${member.userId}`}>{member.user.name}</Link>
                    {member.user.status !== "ACTIVE" && <span className="ml-2 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Suspendido</span>}
                  </p>
                  <p className="truncate text-sm text-slate-600">{member.user.email}</p>
                </div>
                <RowButton action={removeGroupMemberAction} fields={{ groupId: group.id, userId: member.userId }} label="Quitar" pendingLabel="Quitando…" confirm={`${member.user.name} saldrá de este grupo. Sigue inscrito en los cursos donde ya estaba.`} />
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-5 font-semibold text-slate-950">Agregar estudiantes</h3>
        {full ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">No quedan cupos. Para agregar a alguien más, sube el cupo en «Editar datos del grupo» o quita a un estudiante.</p>
        ) : (
          <>
            <form className="mt-2 flex gap-2" role="search" action={here}>
              <label className="sr-only" htmlFor="buscar-estudiante">Buscar estudiante por nombre o correo</label>
              <input id="buscar-estudiante" name="q" defaultValue={q} placeholder="Buscar por nombre o correo…" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-500" />
              <button className="min-h-11 rounded-lg border border-blue-600 px-4 font-semibold text-blue-700" type="submit">Buscar</button>
            </form>
            <p className="mt-2 text-sm text-slate-600">
              {q ? `Resultados para «${q}».` : "Estudiantes activos que aún no están en este grupo."}
              {candidates.length === SEARCH_LIMIT && ` Se muestran los primeros ${SEARCH_LIMIT}; busca por nombre para encontrar a otros.`}
              {q && <Link className="ml-2 font-semibold text-blue-700 underline" href={here}>Quitar búsqueda</Link>}
            </p>
            <PickAndAdd
              key={q}
              action={addGroupMembersAction}
              fields={{ groupId: group.id }}
              name="userIds"
              limit={seatsLeft}
              options={candidates.map((student) => ({ id: student.id, label: student.name, detail: student.email }))}
              submitOne="Agregar estudiante al grupo"
              submitMany="Agregar {n} estudiantes al grupo"
              emptyText={q ? "Ningún estudiante activo coincide con esa búsqueda, o ya está en el grupo." : "No hay más estudiantes activos para agregar. Si falta alguien, agrégalo primero en Personas."}
            />
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="cursos-grupo">
        <h2 id="cursos-grupo" className="text-lg font-bold text-slate-950">2. Cursos del grupo</h2>
        <p className="mt-1 text-sm text-slate-600">Los cursos que este grupo toma. Agregar un curso aquí todavía no inscribe a nadie: eso se hace en el paso 3.</p>
        {group.courses.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Este grupo todavía no tiene cursos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {group.courses.map((row) => (
              <li key={row.courseId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="min-w-0 font-medium text-slate-950">
                  {row.course.name}
                  {row.course.code && <span className="ml-2 text-sm font-normal text-slate-600">{row.course.code}</span>}
                  {row.course.archivedAt && <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Archivado</span>}
                </p>
                <RowButton action={removeGroupCourseAction} fields={{ groupId: group.id, courseId: row.courseId }} label="Quitar" pendingLabel="Quitando…" confirm={`«${row.course.name}» saldrá de este grupo. Quienes ya estaban inscritos en el curso siguen inscritos.`} />
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-5 font-semibold text-slate-950">Agregar cursos</h3>
        {group.program && group.program._count.courses > 0 && (
          <div className="mt-2">
            <RowButton action={addGroupCoursesAction} fields={{ groupId: group.id, fromProgram: "1" }} label={`Agregar todos los cursos del programa (${group.program._count.courses})`} pendingLabel="Agregando…" />
          </div>
        )}
        <PickAndAdd
          action={addGroupCoursesAction}
          fields={{ groupId: group.id }}
          name="courseIds"
          filterable
          options={availableCourses.map((course) => ({ id: course.id, label: course.name, detail: course.code ?? undefined }))}
          submitOne="Agregar curso al grupo"
          submitMany="Agregar {n} cursos al grupo"
          emptyText={inGroup.length ? "Todos los cursos de tu institución ya están en este grupo." : "Tu institución todavía no tiene cursos. Créalos primero en Cursos y vuelve aquí."}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="inscribir-grupo">
        <h2 id="inscribir-grupo" className="text-lg font-bold text-slate-950">3. Inscribir al grupo en sus cursos</h2>
        <p className="mt-1 text-sm text-slate-600">Inscribe a cada estudiante del grupo en cada curso del grupo. Puedes repetirlo cuando agregues personas o cursos: solo se hace lo que falte.</p>
        <EnrollGroup groupId={group.id} students={plan?.students ?? 0} courses={plan?.courses ?? []} canEnroll={capabilities.has("enrollment.manage")} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="borrar-grupo">
        <h2 id="borrar-grupo" className="text-lg font-bold text-slate-950">Borrar este grupo</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">Úsalo solo si el grupo se creó por error o ya terminó y no lo necesitas.</p>
        <DeleteWithImpact
          action={deleteGroupAction}
          fields={{ groupId: group.id }}
          label="Borrar grupo"
          backTo="/dashboard/gestion/grupos"
          impact={[
            members === 0 ? "El grupo no tiene estudiantes." : `Se borra la lista del grupo (${members === 1 ? "1 estudiante" : `${members} estudiantes`}). Las personas no se borran.`,
            "Las inscripciones a cursos que ya se hicieron NO se deshacen: todos siguen en sus cursos.",
            "No se puede deshacer.",
          ]}
        />
      </section>
    </div>
  );
}
