import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getAdmissionsFunnel } from "@/server/dashboard/admissions";
import type { BoardContext } from "@/server/dashboard/context";
import { COURSE_SORT_KEYS, LOW_COURSE_PROGRESS, QUIET_DAYS, getCourseHealth, getTeacherLoad, parseCourseSort, type CourseHealth, type CourseSortKey } from "@/server/dashboard/courses";
import { NO_DATA, compare, formatCount, formatMoneyShort, formatPercent } from "@/server/dashboard/format";
import { getBoardIndicators, type BoardIndicators } from "@/server/dashboard/indicators";
import { PASSING_GRADE_PERCENT, RISK_ATTENDANCE_PERCENT, getAtRiskStudents, riskSignalLabel } from "@/server/dashboard/risk";
import { BlockSkeleton, CornerLink, Indicator, NAVY, Panel, RangeSwitch, Tag, WhenFilled } from "./parts";
import { TrendChart } from "./TrendChart";

/** Cuántos estudiantes, cursos y docentes muestra el inicio; el resto está en su pantalla. */
export const BOARD_RISK_ROWS = 6;
export const BOARD_COURSE_ROWS = 8;
export const BOARD_TEACHER_ROWS = 5;

export type QuickAction = { href: string; label: string; icon: ReactNode };
type Query = { rango?: string; orden?: string };

const DAY_MS = 24 * 60 * 60_000;

function boardHref(current: Query, changes: Query, anchor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) if (value) params.set(key, value);
  const query = params.toString();
  return `/dashboard${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`;
}

/**
 * Tablero de control del inicio de quien dirige o coordina.
 * La estructura es siempre la misma, aunque la institución esté vacía: cada bloque dice cuándo se llena.
 * Cada bloque aparece solo si el rol tiene la capacidad que lo respalda (ver `BoardContext.can`).
 */
export function Board({ ctx, userName, query, quickActions, firstSteps, attention }: {
  ctx: BoardContext;
  userName?: string | null;
  query: Query;
  quickActions: QuickAction[];
  firstSteps?: ReactNode;
  attention: ReactNode;
}) {
  const firstName = userName?.split(" ")[0];
  const current: Query = { rango: query.rango ? ctx.range.key : undefined, orden: query.orden };
  const indicators = getBoardIndicators(ctx);
  const ranges = [
    { key: "semana", label: "Esta semana" },
    { key: "mes", label: "Este mes" },
    ...(ctx.period ? [{ key: "periodo", label: "Este período" }] : []),
  ].map((option) => ({ ...option, href: boardHref(current, { rango: option.key }) }));
  const showResults = ctx.can.results;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <header className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="break-words text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>{ctx.institutionName || "Tu institución"}</h1>
          <PeriodLine ctx={ctx} />
        </div>
        {quickActions.length > 0 && (
          <nav aria-label="Acciones frecuentes" className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:border-slate-400 hover:bg-slate-50">
                <span className="text-slate-500">{action.icon}</span>
                {action.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {firstSteps}

      <section aria-labelledby="como-va" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="como-va" className="text-lg font-bold sm:text-xl" style={{ color: NAVY }}>Cómo va la institución</h2>
            <p className="text-sm text-slate-600">
              {ctx.range.label}{ctx.range.previous ? `, comparado con ${ctx.range.previousLabel} a esta misma altura` : ""}.
            </p>
          </div>
          <RangeSwitch options={ranges} current={ctx.range.key} />
        </div>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none" aria-busy="true"><span className="sr-only">Cargando cifras…</span></div>}>
          <IndicatorsBlock ctx={ctx} indicators={indicators} />
        </Suspense>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* En el celular «Requiere tu atención» va justo después de las cifras; en pantalla ancha, al costado. */}
        <div className={`min-w-0 ${showResults ? "lg:order-2" : "lg:col-span-3"}`}>{attention}</div>
        {showResults && (
          <Suspense fallback={<BlockSkeleton title="Últimas 8 semanas" rows={4} className="lg:col-span-2" />}>
            <TrendBlock ctx={ctx} indicators={indicators} />
          </Suspense>
        )}
      </div>

      {(showResults || ctx.can.teachers) && (
        <div className="grid gap-5 lg:grid-cols-5">
          {showResults && (
            <Suspense fallback={<BlockSkeleton title="Estudiantes en riesgo" rows={5} className="lg:col-span-3" />}>
              <RiskBlock ctx={ctx} />
            </Suspense>
          )}
          {ctx.can.teachers && (
            <Suspense fallback={<BlockSkeleton title="Docentes" rows={4} className="lg:col-span-2" />}>
              <TeachersBlock ctx={ctx} wide={!showResults} />
            </Suspense>
          )}
        </div>
      )}

      {showResults && (
        <Suspense fallback={<BlockSkeleton title="Cursos" rows={5} />}>
          <CoursesBlock ctx={ctx} query={current} />
        </Suspense>
      )}

      {ctx.can.admissions && (
        <Suspense fallback={<BlockSkeleton title="Admisiones" rows={2} />}>
          <AdmissionsBlock ctx={ctx} />
        </Suspense>
      )}
    </div>
  );
}

function PeriodLine({ ctx }: { ctx: BoardContext }) {
  if (!ctx.period) return <p className="mt-1 text-sm text-slate-600">Sin período académico en curso.</p>;
  const progress = ctx.progress;
  return (
    <div className="mt-2 max-w-md">
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{ctx.period.name}</span>
        {progress ? (progress.ended ? ", ya terminó" : `, semana ${progress.week} de ${progress.weeks}`) : ", todavía no empieza"}
      </p>
      {progress && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, progress.percent)}%`, background: "var(--brand)" }} />
        </div>
      )}
    </div>
  );
}

// ---------- Cifras grandes ----------

async function IndicatorsBlock({ ctx, indicators }: { ctx: BoardContext; indicators: Promise<BoardIndicators> }) {
  const { students, attendance, progress, onTime, finance } = await indicators;
  const { range } = ctx;
  const windowText = range.label.toLowerCase();
  const fallback = range.previous ? "Todavía sin datos anteriores para comparar" : "No hay un período anterior para comparar";
  const resultsHref = ctx.can.reports ? "/dashboard/analitica" : "#cursos";
  const cells: ReactNode[] = [];

  if (students) {
    const empty = students.active === 0 && students.trend.every((value) => value === 0);
    cells.push(
      <Indicator
        key="students"
        href={ctx.can.personLink ? "/dashboard/gestion?rol=estudiantes" : "/dashboard/aula"}
        label="Estudiantes activos"
        value={empty ? NO_DATA : formatCount(students.active)}
        detail={empty ? "Se llenará cuando inscribas estudiantes en un curso." : `${formatCount(students.newInRange)} ${students.newInRange === 1 ? "nuevo" : "nuevos"} ${windowText}`}
        change={empty ? null : compare(students.active, students.activeBefore, range.previousLabel, { kind: "count", higherIsBetter: true })}
        fallback={empty ? "" : fallback}
        trend={students.trend}
      />,
    );
  }
  if (attendance) {
    const empty = attendance.whole === 0;
    cells.push(
      <Indicator
        key="attendance"
        href={resultsHref}
        label="Asistencia promedio"
        value={formatPercent(attendance.percent)}
        detail={empty ? "Se llenará cuando los docentes registren asistencia." : `${formatCount(attendance.part)} de ${formatCount(attendance.whole)} registros`}
        change={compare(attendance.percent, attendance.previousPercent, range.previousLabel, { kind: "points", higherIsBetter: true })}
        fallback={empty ? "" : fallback}
        trend={attendance.trend}
      />,
    );
  }
  if (progress) {
    const empty = progress.enrollments === 0;
    cells.push(
      <Indicator
        key="progress"
        href={resultsHref}
        label="Avance promedio"
        value={formatPercent(empty ? null : progress.percent)}
        detail={empty ? "Se llenará cuando haya estudiantes inscritos que completen lecciones." : `${formatCount(progress.lessonsInRange)} ${progress.lessonsInRange === 1 ? "lección completada" : "lecciones completadas"} ${windowText}`}
        change={empty ? null : compare(progress.lessonsInRange, progress.lessonsBefore, range.previousLabel, { kind: "count", higherIsBetter: true, unit: ["lección", "lecciones"] })}
        fallback={empty ? "" : fallback}
        trend={progress.trend}
      />,
    );
  }
  if (onTime) {
    const empty = onTime.whole === 0;
    cells.push(
      <Indicator
        key="ontime"
        href={resultsHref}
        label="Entregas a tiempo"
        value={formatPercent(onTime.percent)}
        detail={empty ? `Se llenará cuando venza una tarea publicada ${windowText}.` : `${formatCount(onTime.part)} de ${formatCount(onTime.whole)} entregas esperadas`}
        change={compare(onTime.percent, onTime.previousPercent, range.previousLabel, { kind: "points", higherIsBetter: true })}
        fallback={empty ? "" : fallback}
        trend={onTime.trend}
      />,
    );
  }
  if (finance) {
    const money = (cents: number) => formatMoneyShort(cents, finance.currency);
    const empty = finance.collectedCents === 0 && finance.pendingCents === 0 && finance.trend.every((value) => value === 0);
    cells.push(
      <Indicator
        key="finance"
        href="/dashboard/pagos"
        label={`Cobrado ${windowText}`}
        value={empty ? NO_DATA : money(finance.collectedCents)}
        detail={
          empty ? "Se llenará cuando registres cargos y pagos." : (
            <>
              Por cobrar {money(finance.pendingCents)}
              {finance.overdueCents > 0 && <>, <span className="font-semibold text-red-700">vencido {money(finance.overdueCents)}</span></>}
              {finance.mixedCurrencies && " (hay cargos en otra moneda)"}
            </>
          )
        }
        change={empty ? null : compare(finance.collectedCents, finance.collectedBeforeCents, range.previousLabel, { kind: "money", higherIsBetter: true, currency: finance.currency })}
        fallback={empty ? "" : fallback}
        trend={finance.trend}
        compact
      />,
    );
  }
  if (cells.length === 0) return null;
  const columns = cells.length >= 5 ? "lg:grid-cols-5" : cells.length === 4 ? "lg:grid-cols-4" : cells.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  // Con un número impar de cifras, la última ocupa el ancho completo en la vista de dos columnas.
  const oddLast = cells.length % 2 === 1 ? "[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1" : "";
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Una sola franja dividida: las cifras se leen juntas, como en un tablero. */}
      <div className={`grid grid-cols-2 gap-px bg-slate-200 ${columns} ${oddLast}`}>
        {cells}
      </div>
    </div>
  );
}

// ---------- Tendencia ----------

async function TrendBlock({ ctx, indicators }: { ctx: BoardContext; indicators: Promise<BoardIndicators> }) {
  const { attendance, onTime } = await indicators;
  if (!attendance || !onTime) return null;
  const labels = ctx.weeks.map((week) => week.label);
  const hasData = attendance.trendWhole.some((value) => value > 0) || onTime.trendWhole.some((value) => value > 0);
  const lastAttendance = [...attendance.trend].reverse().find((value) => value !== null) ?? null;
  const summary = hasData
    ? `Asistencia y entregas a tiempo por semana durante las últimas 8 semanas. Asistencia más reciente: ${formatPercent(lastAttendance)}.`
    : "Todavía no hay asistencia ni tareas vencidas en las últimas 8 semanas.";
  return (
    <Panel id="tendencia" title="Últimas 8 semanas" className="lg:col-span-2 lg:order-1">
      {hasData ? (
        <TrendChart
          id="grafico-tendencia"
          title="Asistencia y entregas a tiempo por semana"
          summary={summary}
          weeks={labels}
          threshold={{ value: RISK_ATTENDANCE_PERCENT, label: `${RISK_ATTENDANCE_PERCENT} %` }}
          series={[
            { key: "asistencia", label: "Asistencia", values: attendance.trend, details: attendance.trendPart.map((part, index) => `${part} de ${attendance.trendWhole[index]} registros`), color: "#1D3FBF" },
            { key: "entregas", label: "Entregas a tiempo", values: onTime.trend, details: onTime.trendPart.map((part, index) => `${part} de ${onTime.trendWhole[index]} entregas`), color: "#0E7490", dashed: true },
          ]}
        />
      ) : (
        <>
          <EmptyChart labels={labels} />
          <WhenFilled>Se llenará cuando los docentes registren asistencia o venzan las primeras tareas.</WhenFilled>
        </>
      )}
    </Panel>
  );
}

/** El mismo marco del gráfico, sin líneas: muestra desde el primer día qué se verá aquí. */
function EmptyChart({ labels }: { labels: string[] }) {
  return (
    <div aria-hidden="true" className="mb-3 grid h-32 grid-cols-8 items-end gap-2 border-b border-slate-200 px-1 pb-1">
      {labels.map((label, index) => (
        <div key={label + index} className="flex flex-col items-center gap-1">
          <div className="h-px w-full bg-slate-200" />
          <span className="text-[11px] text-slate-500 max-sm:[&:nth-child(odd)]:hidden">{index === labels.length - 1 ? "Hoy" : label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Estudiantes en riesgo ----------

async function RiskBlock({ ctx }: { ctx: BoardContext }) {
  const risk = await getAtRiskStudents(ctx, { limit: BOARD_RISK_ROWS });
  const rangeQuery = ctx.range.key === "mes" ? "" : `?rango=${ctx.range.key}`;
  return (
    <Panel
      id="riesgo"
      title="Estudiantes en riesgo"
      className="lg:col-span-3"
      action={ctx.can.fullRiskList && risk.total > 0 ? <CornerLink href={`/dashboard/analitica/riesgo${rangeQuery}`}>Ver todos ({formatCount(risk.total)})</CornerLink> : undefined}
    >
      <p className="mb-3 text-sm text-slate-600">
        {risk.total > 0
          ? `${formatCount(risk.total)} ${risk.total === 1 ? "estudiante reúne" : "estudiantes reúnen"} al menos una señal: asistencia menor de ${RISK_ATTENDANCE_PERCENT} %, 2 o más tareas vencidas, nota por debajo de ${PASSING_GRADE_PERCENT}, avance muy por debajo de su grupo${ctx.can.finance ? " o cargos vencidos" : ""}.`
          : `Aquí aparecen quienes tienen asistencia menor de ${RISK_ATTENDANCE_PERCENT} %, 2 o más tareas vencidas, nota por debajo de ${PASSING_GRADE_PERCENT} o un avance muy por debajo de su grupo.`}
      </p>
      {risk.rows.length === 0 ? (
        <WhenFilled>Ningún estudiante tiene señales de alerta por ahora. La lista se llena sola con la asistencia, las tareas y las notas.</WhenFilled>
      ) : (
        <ul className="divide-y divide-slate-100">
          {risk.rows.map((row) => (
            <li key={row.studentId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Ancho propio para el nombre: con varias señales, sin esto se parte en tres renglones. */}
              <div className="min-w-0 sm:w-44 sm:shrink-0">
                {ctx.can.personLink ? (
                  <Link href={`/dashboard/gestion/personas/${row.studentId}`} className="inline-flex min-h-11 items-center break-words font-semibold text-slate-900 underline-offset-2 hover:underline sm:min-h-0">{row.name}</Link>
                ) : (
                  <span className="font-semibold text-slate-900">{row.name}</span>
                )}
                <p className="text-xs text-slate-500">{row.courses === 1 ? "1 curso" : `${row.courses} cursos`}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5 sm:justify-end" aria-label={`Señales de ${row.name}`}>
                {row.signals.map((signal) => <li key={signal}><Tag>{riskSignalLabel(signal, row)}</Tag></li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Docentes ----------

async function TeachersBlock({ ctx, wide }: { ctx: BoardContext; wide: boolean }) {
  const teachers = await getTeacherLoad(ctx, { limit: BOARD_TEACHER_ROWS });
  const waitDays = (since: Date | null) => (since ? Math.max(0, Math.floor((ctx.now.getTime() - since.getTime()) / DAY_MS)) : 0);
  return (
    <Panel id="docentes" title="Docentes" className={wide ? "lg:col-span-5" : "lg:col-span-2"} action={ctx.can.reports && teachers.total > BOARD_TEACHER_ROWS ? <CornerLink href="/dashboard/analitica#docentes">Ver todos</CornerLink> : undefined}>
      <p className="mb-3 text-sm text-slate-600">Lo que espera calificación y los cursos sin lecciones nuevas, asistencia ni notas en {QUIET_DAYS} días.</p>
      {teachers.rows.length === 0 ? (
        <WhenFilled>Se llenará cuando haya cursos con un docente asignado.</WhenFilled>
      ) : (
        <ul className="divide-y divide-slate-100">
          {teachers.rows.map((teacher) => {
            const days = waitDays(teacher.oldestPendingAt);
            return (
              <li key={teacher.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  {ctx.can.personLink ? (
                    <Link href={`/dashboard/gestion/personas/${teacher.id}`} className="min-w-0 break-words font-semibold text-slate-900 underline-offset-2 hover:underline">{teacher.name}</Link>
                  ) : (
                    <span className="min-w-0 break-words font-semibold text-slate-900">{teacher.name}</span>
                  )}
                  <span className={`shrink-0 text-right text-sm font-semibold tabular-nums ${teacher.pendingGrading > 0 ? "text-slate-900" : "text-slate-500"}`}>
                    {teacher.pendingGrading > 0 ? `${formatCount(teacher.pendingGrading)} por calificar` : "Al día"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {teacher.courses === 1 ? "1 curso" : `${teacher.courses} cursos`}
                  {teacher.pendingGrading > 0 && (days >= 7 ? <span className="font-semibold text-red-700">, la más antigua espera {days} días</span> : days === 0 ? ", la más antigua llegó hoy" : `, la más antigua espera ${days === 1 ? "1 día" : `${days} días`}`)}
                </p>
                {teacher.quiet.length > 0 && (
                  <p className="mt-1 text-sm text-amber-800">
                    Sin actividad en {QUIET_DAYS} días: {teacher.quiet.slice(0, 3).map((course) => course.name).join(", ")}
                    {teacher.quiet.length > 3 ? ` y ${teacher.quiet.length - 3} más` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Cursos ----------

const COURSE_COLUMNS: Array<{ key: CourseSortKey; label: string; numeric?: boolean }> = [
  { key: "nombre", label: "Curso" },
  { key: "inscritos", label: "Inscritos", numeric: true },
  { key: "avance", label: "Avance", numeric: true },
  { key: "asistencia", label: "Asistencia", numeric: true },
  { key: "nota", label: "Nota promedio", numeric: true },
  { key: "porCalificar", label: "Por calificar", numeric: true },
];

function courseFlags(course: CourseHealth) {
  return {
    progress: course.enrolled > 0 && (course.averageProgress ?? 0) < LOW_COURSE_PROGRESS,
    attendance: course.attendance !== null && course.attendance < RISK_ATTENDANCE_PERCENT,
    grade: course.averageGrade !== null && course.averageGrade < PASSING_GRADE_PERCENT,
  };
}

async function CoursesBlock({ ctx, query }: { ctx: BoardContext; query: Query }) {
  const sort = parseCourseSort(query.orden);
  const courses = await getCourseHealth(ctx, { sort, limit: BOARD_COURSE_ROWS });
  const warn = (flag: boolean) => (flag ? "font-semibold text-red-700" : "text-slate-800");
  const grade = (value: number | null) => (value === null ? NO_DATA : `${Math.round(value)} de 100`);
  return (
    <Panel id="cursos" title="Cursos" action={courses.total > BOARD_COURSE_ROWS ? <CornerLink href="/dashboard/aula">Ver los {formatCount(courses.total)} cursos</CornerLink> : undefined}>
      <p className="mb-3 text-sm text-slate-600">
        {sort === "atencion" ? "Primero los que necesitan atención." : "Ordenados por la columna elegida."} La asistencia es de {ctx.range.label.toLowerCase()}; en rojo lo que está por debajo de lo esperado.
      </p>
      {courses.rows.length === 0 ? (
        <WhenFilled>Se llenará cuando crees el primer curso y le inscribas estudiantes.</WhenFilled>
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Cursos con inscritos, avance, asistencia, nota promedio y pendientes por calificar</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  {COURSE_COLUMNS.map((column) => {
                    const active = sort === column.key;
                    return (
                      <th key={column.key} scope="col" aria-sort={active ? (column.key === "nombre" ? "ascending" : column.key === "inscritos" || column.key === "porCalificar" ? "descending" : "ascending") : undefined} className={`py-2 pr-3 font-semibold ${column.numeric ? "text-right" : ""}`}>
                        <Link href={boardHref(query, { orden: column.key }, "cursos")} className={`inline-flex min-h-11 items-center underline-offset-2 hover:underline ${active ? "text-slate-950 underline" : ""}`}>
                          {column.label}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {courses.rows.map((course) => {
                  const flags = courseFlags(course);
                  return (
                    <tr key={course.id} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="py-2.5 pr-3 font-normal">
                        <Link href={`/dashboard/aula/${course.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">{course.name}</Link>
                        <span className="block text-xs text-slate-500">{course.teacherName}</span>
                      </th>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(course.enrolled)}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${warn(flags.progress)}`}>{course.enrolled ? formatPercent(course.averageProgress) : NO_DATA}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${warn(flags.attendance)}`}>{formatPercent(course.attendance)}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${warn(flags.grade)}`}>{grade(course.averageGrade)}</td>
                      <td className="py-2.5 text-right tabular-nums">{course.pendingGrading > 0 ? <span className="font-semibold text-slate-900">{formatCount(course.pendingGrading)}</span> : <span className="text-slate-500">Al día</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            <nav aria-label="Ordenar cursos" className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {(["atencion", ...COURSE_SORT_KEYS.filter((key) => key !== "atencion" && key !== "nombre")] as CourseSortKey[]).map((key) => (
                <Link key={key} href={boardHref(query, { orden: key }, "cursos")} aria-current={sort === key ? "true" : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${sort === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                  {key === "atencion" ? "Necesitan atención" : COURSE_COLUMNS.find((column) => column.key === key)?.label}
                </Link>
              ))}
            </nav>
            <ul className="space-y-2">
              {courses.rows.map((course) => {
                const flags = courseFlags(course);
                return (
                  <li key={course.id} className="rounded-xl border border-slate-200 p-3">
                    <Link href={`/dashboard/aula/${course.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">{course.name}</Link>
                    <p className="text-xs text-slate-500">{course.teacherName}, {course.enrolled === 1 ? "1 inscrito" : `${formatCount(course.enrolled)} inscritos`}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-slate-600">Avance</dt><dd className={`text-right tabular-nums ${warn(flags.progress)}`}>{course.enrolled ? formatPercent(course.averageProgress) : NO_DATA}</dd>
                      <dt className="text-slate-600">Asistencia</dt><dd className={`text-right tabular-nums ${warn(flags.attendance)}`}>{formatPercent(course.attendance)}</dd>
                      <dt className="text-slate-600">Nota promedio</dt><dd className={`text-right tabular-nums ${warn(flags.grade)}`}>{grade(course.averageGrade)}</dd>
                      <dt className="text-slate-600">Por calificar</dt><dd className="text-right tabular-nums">{course.pendingGrading > 0 ? formatCount(course.pendingGrading) : "Al día"}</dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </Panel>
  );
}

// ---------- Admisiones ----------

async function AdmissionsBlock({ ctx }: { ctx: BoardContext }) {
  const funnel = await getAdmissionsFunnel(ctx);
  if (!funnel) return null;
  const windowText = ctx.range.label.toLowerCase();
  const steps = [
    { label: "Solicitudes nuevas", value: funnel.received, note: funnel.waiting > 0 ? `${formatCount(funnel.waiting)} sin atender todavía` : "Todas atendidas" },
    { label: "En proceso", value: funnel.inProcess, note: "Con documentos, en revisión o admitidas" },
    { label: "Inscritas", value: funnel.enrolled, note: funnel.rejected > 0 ? `${formatCount(funnel.rejected)} ${funnel.rejected === 1 ? "no admitida" : "no admitidas"}` : "Ya son estudiantes" },
  ];
  const change = compare(funnel.received, funnel.receivedBefore, ctx.range.previousLabel, { kind: "count", higherIsBetter: true, unit: ["solicitud", "solicitudes"] });
  return (
    <Panel id="admisiones" title={`Admisiones ${windowText}`} action={<CornerLink href="/dashboard/admisiones">Ver admisiones</CornerLink>}>
      {funnel.received === 0 ? (
        <>
          <ol className="mb-3 grid gap-2 sm:grid-cols-3" aria-hidden="true">
            {steps.map((step) => (
              <li key={step.label} className="rounded-xl border border-dashed border-slate-300 p-3">
                <p className="text-sm font-semibold text-slate-700">{step.label}</p>
                <p className="text-2xl font-bold text-slate-400">{NO_DATA}</p>
              </li>
            ))}
          </ol>
          <WhenFilled>Se llenará cuando llegue la primera solicitud de ingreso {windowText}.</WhenFilled>
        </>
      ) : (
        <>
          <ol className="grid gap-2 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-700">{step.label}</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: NAVY }}>{formatCount(step.value)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${(step.value / Math.max(1, funnel.received)) * 100}%`, background: "var(--brand)" }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{step.note}</p>
              </li>
            ))}
          </ol>
          {change && <p className="mt-3 text-sm text-slate-600">{change.text}.</p>}
        </>
      )}
    </Panel>
  );
}
