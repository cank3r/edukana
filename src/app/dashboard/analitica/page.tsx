import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { roleLabel } from "@/lib/ux";
import type { EdukanaRole } from "@/types/next-auth";
import { cleanReportFilters, listReportFilterOptions, resolveReportAccess } from "@/server/reports/access";
import {
  COURSE_SORTS,
  GROUP_SORTS,
  INACTIVITY_DAYS,
  LOW_ATTENDANCE_PERCENT,
  LOW_PROGRESS_PERCENT,
  PAGE_ROWS,
  RISK_SORTS,
  TEACHER_SORTS,
  getAccessReport,
  getCourseReport,
  getGroupReport,
  getOverview,
  getProgramReport,
  getRiskReport,
  getTeacherReport,
  parseSort,
  riskReasons,
  type Compared,
} from "@/server/reports/queries";
import { Bars, Empty, Figure, Section, SortableTable, reportHref, type Query } from "./parts";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60_000;
const whole = (value: number) => new Intl.NumberFormat("es").format(Math.round(value));
const pct = (value: number | null) => (value === null ? "Sin datos" : `${Math.round(value)} %`);
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function countChange({ value, before }: Compared): string {
  const diff = value - before;
  if (diff === 0) return "Igual que hace un mes.";
  return `${whole(Math.abs(diff))} ${diff > 0 ? "más" : "menos"} que hace un mes.`;
}

function pointsChange(now: number | null, before: number | null): string {
  if (now === null || before === null) return "Todavía no hay datos del mes anterior para comparar.";
  const diff = Math.round(now) - Math.round(before);
  if (diff === 0) return "Igual que en los 30 días anteriores.";
  return `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "punto" : "puntos"} ${diff > 0 ? "más" : "menos"} que en los 30 días anteriores.`;
}

function waiting(since: Date | null, now: Date): string {
  if (!since) return "Nada pendiente";
  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  return days <= 0 ? "Desde hoy" : days === 1 ? "Hace 1 día" : `Hace ${days} días`;
}

/**
 * Reportes para la dirección.
 * Consultas por carga: 2 de permisos + 2 de filtros, y luego en paralelo:
 * cifras de arriba 3 (+1 de cobros solo con permiso) · cursos 1 · estudiantes en riesgo 1 · docentes 1 · acceso 1 · grupos 1 · programas 1.
 * Máximo 14, todas con agregados en la base; ninguna trae más de 50 filas.
 */
export default async function AnaliticaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");

  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("analytics.view")) redirect("/dashboard");
  const access = await resolveReportAccess({ id: user.id, institutionId: user.institutionId, role: user.role });
  if (!access) redirect("/dashboard");

  const raw = await searchParams;
  const options = await listReportFilterOptions(access);
  const filters = cleanReportFilters(options, { periodId: first(raw.periodo), programId: first(raw.programa) });
  const courseSort = parseSort(first(raw.ordenCursos), COURSE_SORTS, { key: "avance", desc: false });
  const riskSort = parseSort(first(raw.ordenRiesgo), RISK_SORTS, { key: "motivos", desc: true });
  const teacherSort = parseSort(first(raw.ordenDocentes), TEACHER_SORTS, { key: "espera", desc: false });
  const groupSort = parseSort(first(raw.ordenGrupos), GROUP_SORTS, { key: "avance", desc: false });
  const programSort = parseSort(first(raw.ordenProgramas), GROUP_SORTS, { key: "avance", desc: false });

  // Lo que se conserva al pulsar un enlace de orden o de descarga.
  const filterQuery: Query = { periodo: filters.periodId ?? undefined, programa: filters.programId ?? undefined };
  const query: Query = {
    ...filterQuery,
    ordenCursos: first(raw.ordenCursos),
    ordenRiesgo: first(raw.ordenRiesgo),
    ordenDocentes: first(raw.ordenDocentes),
    ordenGrupos: first(raw.ordenGrupos),
    ordenProgramas: first(raw.ordenProgramas),
  };
  const download = (section: string) => reportHref(filterQuery, { seccion: section }, undefined, "/dashboard/analitica/descargar");

  const now = new Date();
  const [overview, courses, risk, teachers, accessRows, groups, programs] = await Promise.all([
    getOverview(access, filters, now),
    getCourseReport(access, filters, { sort: courseSort }),
    getRiskReport(access, filters, { sort: riskSort, now }),
    getTeacherReport(access, filters, { sort: teacherSort }),
    getAccessReport(access),
    getGroupReport(access, filters, { sort: groupSort }),
    getProgramReport(access, filters, { sort: programSort }),
  ]);

  const finance = overview.finance;
  const money = (cents: number) =>
    new Intl.NumberFormat("es-DO", { style: "currency", currency: finance?.currency ?? "DOP", maximumFractionDigits: 0 }).format(cents / 100);
  const withoutAccess = accessRows?.reduce((sum, row) => sum + row.withoutAccess, 0) ?? 0;
  const filtered = Boolean(filters.periodId || filters.programId);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Reportes</h1>
        <p className="mt-1 text-sm text-slate-600">Cómo va la institución hoy: quiénes estudian, cuánto avanzan y dónde hace falta actuar.</p>
        {access.scope.kind === "teacher" && <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-slate-800">Estás viendo solo los cursos que dictas.</p>}
        {access.scope.kind === "none" && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-slate-800">Todavía no tienes cursos a tu cargo, por eso los reportes salen vacíos. Pide a la administración que te dé acceso a los cursos.</p>}
      </header>

      <form method="get" action="/dashboard/analitica" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-0 flex-1 basis-48 text-sm font-semibold text-slate-700">
          Período
          <select name="periodo" defaultValue={filters.periodId ?? ""} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-900">
            <option value="">Todos los períodos</option>
            {options.periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name}{period.isActive ? " (actual)" : ""}</option>
            ))}
          </select>
        </label>
        {options.programs.length > 0 && (
          <label className="min-w-0 flex-1 basis-48 text-sm font-semibold text-slate-700">
            Programa
            <select name="programa" defaultValue={filters.programId ?? ""} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-900">
              <option value="">Todos los programas</option>
              {options.programs.map((program) => (
                <option key={program.id} value={program.id}>{program.name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="min-h-11 rounded-lg px-5 py-2.5 font-semibold text-white" style={{ background: "var(--blue)" }}>Ver reportes</button>
        {filtered && <Link href="/dashboard/analitica" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Quitar filtros</Link>}
      </form>

      <section aria-label="Resumen" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure
          label="Estudiantes activos"
          value={whole(overview.activeStudents.value)}
          meaning="Personas inscritas hoy en al menos un curso."
          comparison={countChange(overview.activeStudents)}
        />
        <Figure
          label="Cursos en marcha"
          value={whole(overview.runningCourses.value)}
          meaning="Cursos visibles para los estudiantes y sin archivar."
          comparison={countChange(overview.runningCourses)}
        />
        <Figure
          label="Avance promedio"
          value={pct(overview.averageProgress)}
          meaning="De cada 100 lecciones, cuántas han completado en promedio los estudiantes activos."
          comparison="No se compara con el mes anterior: el avance pasado no se guarda."
        />
        <Figure
          label="Tareas entregadas a tiempo"
          value={pct(overview.onTime.percent)}
          meaning={overview.onTime.expected > 0 ? `De las ${whole(overview.onTime.expected)} entregas que se esperaban en los últimos 30 días.` : "Ninguna tarea venció en los últimos 30 días."}
          comparison={pointsChange(overview.onTime.percent, overview.onTime.beforePercent)}
        />
        <Figure
          label="Asistencia promedio"
          value={pct(overview.attendance.percent)}
          meaning={overview.attendance.records > 0 ? "Clases a las que sí asistieron en los últimos 30 días (las ausencias justificadas no cuentan)." : "No se tomó asistencia en los últimos 30 días."}
          comparison={pointsChange(overview.attendance.percent, overview.attendance.beforePercent)}
        />
        {finance && (
          <Figure
            label="Cobrado y por cobrar"
            value={money(finance.collectedCents)}
            meaning={`Ya cobrado. Falta por cobrar ${money(finance.pendingCents)}${finance.overdueCents > 0 ? `, de los cuales ${money(finance.overdueCents)} ya vencieron` : ""}.`}
            comparison={`En los últimos 30 días se cobró ${money(finance.collectedLast30Cents)}; en los 30 anteriores, ${money(finance.collectedBefore30Cents)}.`}
          />
        )}
      </section>
      {finance && (
        <p className="text-sm text-slate-600">
          {finance.mixedCurrencies ? "Hay cobros en más de una moneda: la suma los mezcla. Descarga los cobros para verlos por moneda. " : ""}
          {filters.programId ? "Los cobros no se separan por programa: se muestran los de toda la institución." : ""}
          {" "}
          <a href={download("cobros")} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Descargar cobros en CSV</a>
        </p>
      )}

      <Section id="cursos" title="Cursos" description={`Cuánta gente tiene cada curso y cómo avanza. Se resaltan los cursos con avance promedio menor de ${LOW_PROGRESS_PERCENT} %.`} downloadHref={download("cursos")}>
        {courses.rows.length === 0 ? (
          <Empty>No hay cursos para mostrar{filtered ? " con estos filtros" : ""}. Cuando se creen cursos y se inscriban estudiantes, aquí verás su avance.</Empty>
        ) : (
          <>
            <Bars
              title="Avance promedio por curso"
              max={100}
              bars={courses.rows.slice(0, 10).map((course) => ({
                label: course.name,
                value: course.averageProgress ?? 0,
                text: course.enrolled === 0 ? "Sin inscritos" : `${pct(course.averageProgress)}${course.lowProgress ? " · bajo" : ""}`,
                warn: course.lowProgress,
              }))}
            />
            <SortableTable
              caption="Cursos: inscritos, retirados, avance, entregas por calificar y nota promedio"
              query={query}
              sortParam="ordenCursos"
              activeSort={courseSort}
              anchor="cursos"
              columns={[
                { label: "Curso", sort: "nombre" },
                { label: "Inscritos", sort: "inscritos", numeric: true },
                { label: "Retirados", sort: "retirados", numeric: true },
                { label: "Avance promedio", sort: "avance", numeric: true },
                { label: "Por calificar", sort: "porCalificar", numeric: true },
                { label: "Nota promedio", sort: "nota", numeric: true },
              ]}
              rows={courses.rows.map((course) => ({
                key: course.id,
                highlight: course.lowProgress,
                cells: [
                  <span key="c">
                    <Link href={`/dashboard/aula/${course.id}`} className="font-semibold text-blue-700 underline">{course.name}</Link>
                    <span className="block text-slate-600">{course.teacherName}</span>
                  </span>,
                  whole(course.enrolled),
                  whole(course.withdrawn),
                  course.enrolled === 0 ? "Sin inscritos" : <span key="a">{pct(course.averageProgress)}{course.lowProgress && <strong className="ml-1 text-amber-800">Avance bajo</strong>}</span>,
                  course.pendingGrading === 0 ? "Al día" : whole(course.pendingGrading),
                  course.averageGrade === null ? "Sin notas" : `${Math.round(course.averageGrade)} de 100`,
                ],
              }))}
            />
            {courses.total > courses.rows.length && <p className="text-sm text-slate-600">Se muestran {courses.rows.length} de {whole(courses.total)} cursos. Descarga el archivo para verlos todos.</p>}
          </>
        )}
      </Section>

      <Section
        id="riesgo"
        title="Estudiantes en riesgo"
        description={`Estudiantes que conviene contactar: llevan ${INACTIVITY_DAYS} días sin actividad, avanzan mucho menos que su grupo, asisten a menos del ${LOW_ATTENDANCE_PERCENT} % de las clases o tienen tareas vencidas.`}
        downloadHref={download("riesgo")}
      >
        {risk.rows.length === 0 ? (
          <Empty>Ningún estudiante necesita atención ahora. Buen trabajo.</Empty>
        ) : (
          <>
            <Bars
              title={`Motivos (${whole(risk.total)} ${risk.total === 1 ? "estudiante" : "estudiantes"} en total; uno puede tener varios)`}
              max={risk.total}
              bars={[
                { label: `Sin actividad en ${INACTIVITY_DAYS} días`, value: risk.counts.inactive, text: whole(risk.counts.inactive) },
                { label: "Tareas vencidas sin entregar", value: risk.counts.overdue, text: whole(risk.counts.overdue) },
                { label: `Asistencia menor de ${LOW_ATTENDANCE_PERCENT} %`, value: risk.counts.lowAttendance, text: whole(risk.counts.lowAttendance) },
                { label: "Avance bajo", value: risk.counts.lowProgress, text: whole(risk.counts.lowProgress) },
              ]}
            />
            <SortableTable
              caption="Estudiantes en riesgo y el motivo"
              query={query}
              sortParam="ordenRiesgo"
              activeSort={riskSort}
              anchor="riesgo"
              columns={[
                { label: "Estudiante", sort: "nombre" },
                { label: "Motivo", sort: "motivos", numeric: true },
                { label: "Avance", sort: "avance" },
                { label: "Asistencia", sort: "asistencia" },
                { label: "Tareas vencidas", sort: "vencidas", numeric: true },
              ]}
              rows={risk.rows.map((student) => ({
                key: student.studentId,
                cells: [
                  <Link key="s" href={`/dashboard/gestion/estudiantes/${student.studentId}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{student.name}</Link>,
                  riskReasons(student, now).join(". "),
                  pct(student.averageProgress),
                  student.classes > 0 ? pct((student.attended / student.classes) * 100) : "Sin registro",
                  whole(student.overdueTasks),
                ],
              }))}
            />
            {risk.total > risk.rows.length && (
              <p className="text-sm text-slate-600">Se muestran los primeros {PAGE_ROWS} de {whole(risk.total)}. <a href={download("riesgo")} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Descargar la lista completa</a></p>
            )}
          </>
        )}
      </Section>

      <Section id="docentes" title="Docentes" description="Carga de cada docente y cuánto llevan esperando los estudiantes por una calificación." downloadHref={download("docentes")}>
        {teachers.rows.length === 0 ? (
          <Empty>No hay docentes con cursos{filtered ? " en estos filtros" : ""}.</Empty>
        ) : (
          <>
            <Bars
              title="Entregas por calificar"
              bars={teachers.rows.slice(0, 10).map((teacher) => ({ label: teacher.name, value: teacher.pendingGrading, text: teacher.pendingGrading === 0 ? "Al día" : whole(teacher.pendingGrading) }))}
            />
            <SortableTable
              caption="Docentes: cursos, estudiantes y entregas por calificar"
              query={query}
              sortParam="ordenDocentes"
              activeSort={teacherSort}
              anchor="docentes"
              columns={[
                { label: "Docente", sort: "nombre" },
                { label: "Cursos", sort: "cursos", numeric: true },
                { label: "Estudiantes", sort: "estudiantes", numeric: true },
                { label: "Por calificar", sort: "porCalificar", numeric: true },
                { label: "La más antigua espera", sort: "espera" },
              ]}
              rows={teachers.rows.map((teacher) => ({
                key: teacher.id,
                cells: [<strong key="t">{teacher.name}</strong>, whole(teacher.courses), whole(teacher.students), teacher.pendingGrading === 0 ? "Al día" : whole(teacher.pendingGrading), waiting(teacher.oldestPendingAt, now)],
              }))}
            />
            {teachers.total > teachers.rows.length && <p className="text-sm text-slate-600">Se muestran {teachers.rows.length} de {whole(teachers.total)} docentes. Descarga el archivo para verlos todos.</p>}
          </>
        )}
      </Section>

      {accessRows && (
        <Section id="acceso" title="Acceso" description="Personas que todavía no pueden entrar porque no han creado su contraseña. El archivo trae sus nombres y correos para invitarlas." downloadHref={withoutAccess > 0 ? download("acceso") : undefined}>
          {withoutAccess === 0 ? (
            <Empty>Todas las personas activas ya pueden entrar.</Empty>
          ) : (
            <>
              <Bars
                title={`${whole(withoutAccess)} ${withoutAccess === 1 ? "persona aún no puede" : "personas aún no pueden"} entrar`}
                max={Math.max(1, ...accessRows.map((row) => row.total))}
                bars={accessRows.map((row) => ({ label: roleLabel(row.role as EdukanaRole), value: row.withoutAccess, text: `${whole(row.withoutAccess)} de ${whole(row.total)}` }))}
              />
              <p className="text-sm text-slate-600">
                Para enviarles la invitación ve a <Link href="/dashboard/gestion/accesos" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Accesos</Link>.
              </p>
            </>
          )}
        </Section>
      )}

      {(groups.rows.length > 0 || programs.rows.length > 0) && (
        <Section id="grupos" title="Grupos y programas" description="Tamaño y avance promedio de cada grupo y de cada programa." downloadHref={groups.rows.length > 0 ? download("grupos") : download("programas")}>
          {groups.rows.length > 0 && (
            <>
              <Bars
                title="Avance promedio por grupo"
                max={100}
                bars={groups.rows.slice(0, 10).map((group) => ({ label: group.name, value: group.averageProgress ?? 0, text: pct(group.averageProgress) }))}
              />
              <SortableTable
                caption="Grupos: estudiantes y avance promedio"
                query={query}
                sortParam="ordenGrupos"
                activeSort={groupSort}
                anchor="grupos"
                columns={[{ label: "Grupo", sort: "nombre" }, { label: "Programa" }, { label: "Estudiantes", sort: "estudiantes", numeric: true }, { label: "Avance promedio", sort: "avance", numeric: true }]}
                rows={groups.rows.map((group) => ({
                  key: group.id,
                  cells: [
                    <strong key="g">{group.name}</strong>,
                    group.programName ?? "Sin programa",
                    group.capacity ? `${whole(group.members)} de ${whole(group.capacity)}` : whole(group.members),
                    pct(group.averageProgress),
                  ],
                }))}
              />
            </>
          )}
          {programs.rows.length > 0 && (
            <>
              <Bars
                title="Avance promedio por programa"
                max={100}
                bars={programs.rows.slice(0, 10).map((program) => ({ label: program.name, value: program.averageProgress ?? 0, text: pct(program.averageProgress) }))}
              />
              <SortableTable
                caption="Programas: cursos, estudiantes y avance promedio"
                query={query}
                sortParam="ordenProgramas"
                activeSort={programSort}
                anchor="grupos"
                columns={[{ label: "Programa", sort: "nombre" }, { label: "Cursos" }, { label: "Estudiantes", sort: "estudiantes", numeric: true }, { label: "Avance promedio", sort: "avance", numeric: true }]}
                rows={programs.rows.map((program) => ({
                  key: program.id,
                  cells: [<strong key="p">{program.name}</strong>, whole(program.courses), whole(program.students), pct(program.averageProgress)],
                }))}
              />
              {groups.rows.length > 0 && (
                <p className="text-sm text-slate-600">
                  <a href={download("programas")} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Descargar programas en CSV</a>
                </p>
              )}
            </>
          )}
        </Section>
      )}
    </div>
  );
}
