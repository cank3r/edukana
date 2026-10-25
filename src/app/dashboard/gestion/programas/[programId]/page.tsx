import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { getProgram } from "@/server/academic/programs";
import { addProgramCoursesAction, deleteProgramAction, moveProgramCourseAction, removeProgramCourseAction } from "@/server/actions/programs";
import { DeleteWithImpact, PickAndAdd, ProgramForm, RowButton } from "../ProgramTools";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({ params }: { params: Promise<{ programId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("academic.structure.manage")) redirect("/dashboard");

  const { programId } = await params;
  const program = await getProgram(user.institutionId, programId);
  if (!program) notFound();

  const inProgram = program.courses.map((row) => row.courseId);
  const available = await db.course.findMany({
    where: { institutionId: user.institutionId, archivedAt: null, id: { notIn: inProgram } },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true, code: true },
  });
  const groups = program._count.groups;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{program.name}</h1>
        {program.description && <p className="whitespace-pre-line text-sm text-slate-600">{program.description}</p>}
        <p className="text-sm text-slate-600">
          {groups === 0 ? "Ningún grupo sigue este programa todavía." : groups === 1 ? "1 grupo sigue este programa." : `${groups} grupos siguen este programa.`}
          {!program.isPublished && " No se ofrece a grupos nuevos."}
        </p>
        <ProgramForm program={{ id: program.id, name: program.name, description: program.description ?? "", isPublished: program.isPublished }} />
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="cursos-programa">
        <h2 id="cursos-programa" className="text-lg font-bold text-slate-950">Cursos del programa</h2>
        <p className="mt-1 text-sm text-slate-600">En el orden en que se cursan. Usa Subir y Bajar para cambiarlo.</p>
        {program.courses.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Este programa todavía no tiene cursos. Elígelos en la lista de abajo.</p>
        ) : (
          <ol className="mt-3 divide-y divide-slate-100">
            {program.courses.map((row, index) => {
              const fields = { programId: program.id, courseId: row.courseId };
              return (
                <li key={row.courseId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="min-w-0 font-medium text-slate-950">
                    <span className="mr-2 text-slate-500">{index + 1}.</span>
                    {row.course.name}
                    {row.course.code && <span className="ml-2 text-sm font-normal text-slate-600">{row.course.code}</span>}
                    {row.course.archivedAt && <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Archivado</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <RowButton action={moveProgramCourseAction} fields={{ ...fields, direction: "up" }} label="Subir" pendingLabel="Subiendo…" disabled={index === 0} />
                    <RowButton action={moveProgramCourseAction} fields={{ ...fields, direction: "down" }} label="Bajar" pendingLabel="Bajando…" disabled={index === program.courses.length - 1} />
                    <RowButton action={removeProgramCourseAction} fields={fields} label="Quitar" pendingLabel="Quitando…" confirm={`«${row.course.name}» saldrá de este programa. El curso no se borra y sus estudiantes siguen inscritos.`} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <h3 className="mt-5 font-semibold text-slate-950">Agregar cursos</h3>
        <PickAndAdd
          action={addProgramCoursesAction}
          fields={{ programId: program.id }}
          name="courseIds"
          filterable
          options={available.map((course) => ({ id: course.id, label: course.name, detail: course.code ?? undefined }))}
          submitOne="Agregar curso al programa"
          submitMany="Agregar {n} cursos al programa"
          emptyText={inProgram.length ? "Todos los cursos de tu institución ya están en este programa." : "Tu institución todavía no tiene cursos. Créalos primero en Cursos y vuelve aquí."}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="borrar-programa">
        <h2 id="borrar-programa" className="text-lg font-bold text-slate-950">Borrar este programa</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">Úsalo solo si el programa se creó por error o ya no se ofrece.</p>
        <DeleteWithImpact
          action={deleteProgramAction}
          fields={{ programId: program.id }}
          label="Borrar programa"
          backTo="/dashboard/gestion/programas"
          impact={[
            groups === 0 ? "Ningún grupo usa este programa." : groups === 1 ? "1 grupo quedará sin programa. El grupo y sus estudiantes se conservan." : `${groups} grupos quedarán sin programa. Los grupos y sus estudiantes se conservan.`,
            "Los cursos no se borran y nadie pierde su inscripción.",
            "No se puede deshacer.",
          ]}
        />
      </section>
    </div>
  );
}
