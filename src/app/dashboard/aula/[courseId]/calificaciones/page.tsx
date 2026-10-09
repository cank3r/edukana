import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatNumber } from "@/lib/gradebook-calc";
import { loadGradeCell, loadGradebook, type GradebookCell, type GradebookItem } from "@/server/assessment/gradebook";
import { CategoryEditor, DeleteItem, GradeEditor, ItemForm, PublishToggle, SimpleSetup } from "./GradebookTools";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-slate-200 bg-white p-5";
const linkButton = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";
const summary = "min-h-11 cursor-pointer py-2.5 font-semibold text-slate-900";
const when = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

function cellText(cell: GradebookCell | undefined) {
  if (cell?.isExcused) return "Exon.";
  return cell && cell.score !== null ? formatNumber(cell.score) : "—";
}

function cellLabel(student: string, item: GradebookItem, cell: GradebookCell | undefined) {
  const current = cell?.isExcused ? "exonerado" : cell && cell.score !== null ? `nota ${formatNumber(cell.score)} de ${formatNumber(item.maxScore)}` : "sin nota";
  return `${student}, ${item.title}: ${current}. Tocar para cambiar.`;
}

function average(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

export default async function GradebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ nota?: string }>;
}) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  if (user.role === "STUDENT") redirect(`/dashboard/aula/${courseId}/mis-notas`);
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const book = await loadGradebook(actor, courseId);
  if (!book) notFound();

  const base = `/dashboard/aula/${book.course.id}/calificaciones`;
  const [cellItemId = "", cellEnrollmentId = ""] = ((await searchParams).nota ?? "").split("~");
  const cell = cellItemId && cellEnrollmentId ? await loadGradeCell(actor, cellItemId, cellEnrollmentId) : null;
  const cellHref = (itemId: string, enrollmentId: string) => `${base}?nota=${encodeURIComponent(`${itemId}~${enrollmentId}`)}`;

  const severalPeriods = book.periods.length > 1;
  const categoryOptions = book.periods.flatMap((period) =>
    period.categories.map((category) => ({ id: category.id, label: severalPeriods ? `${period.name} · ${category.name}` : category.name })),
  );
  const configured = categoryOptions.length > 0;
  const { items, students } = book;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <Link href={`/dashboard/aula/${book.course.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">
          ← Volver a {book.course.name}
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Calificaciones</h1>
        <p className="mt-1 text-sm text-slate-600">Toca una nota para ponerla o corregirla. Los estudiantes solo ven las actividades que publiques.</p>
      </header>

      {!configured ? (
        <section className={card}>
          <h2 className="text-lg font-bold text-slate-950">Este curso aún no tiene cómo calificar</h2>
          <p className="mt-1 text-sm text-slate-600">
            Con la configuración sencilla todas las actividades valen lo mismo y el promedio sale solo. Podrás cambiarla después en «Opciones avanzadas».
          </p>
          <div className="mt-4"><SimpleSetup courseId={book.course.id} /></div>
        </section>
      ) : (
        <>
          <section className={card}>
            <details open={items.length === 0}>
              <summary className={summary}>Agregar actividad calificable</summary>
              <p className="mb-3 text-sm text-slate-600">Para algo que no es una tarea ni un examen del curso: una exposición, la participación, un trabajo en clase.</p>
              <ItemForm courseId={book.course.id} categories={categoryOptions} />
            </details>
          </section>

          {items.length === 0 ? (
            <p className={`${card} text-sm text-slate-600`}>Todavía no hay actividades calificables. Agrega la primera arriba; las tareas y los exámenes del curso aparecerán aquí solos.</p>
          ) : students.length === 0 ? (
            <p className={`${card} text-sm text-slate-600`}>
              Este curso todavía no tiene estudiantes inscritos.{" "}
              <Link className="font-semibold text-blue-700 underline" href={`/dashboard/aula/${book.course.id}/estudiantes`}>Inscribir estudiantes</Link>
            </p>
          ) : (
            <section aria-labelledby="titulo-notas">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="titulo-notas" className="text-lg font-bold text-slate-950">Notas de {students.length} {students.length === 1 ? "estudiante" : "estudiantes"}</h2>
                <a href={`${base}/descargar`} className={linkButton} download>Descargar en CSV</a>
              </div>

              {/* Celular: un estudiante a la vez, sin desplazamiento lateral. */}
              <ul className="space-y-2 md:hidden">
                {students.map((student) => (
                  <li key={student.enrollmentId} className="rounded-xl border border-slate-200 bg-white">
                    <details open={cell?.student.enrollmentId === student.enrollmentId}>
                      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span className="font-semibold text-slate-900">{student.name}</span>
                        <span className="shrink-0 text-sm text-slate-600">Promedio: <strong className="text-slate-950">{average(student.average)}</strong></span>
                      </summary>
                      <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {items.map((item) => (
                          <li key={item.id}>
                            <Link href={cellHref(item.id, student.enrollmentId)} scroll={false} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm">
                              <span className="text-slate-800">{item.title}</span>
                              <span className="shrink-0 font-semibold text-blue-700">{cellText(student.cells[item.id])} <span className="font-normal text-slate-500">/ {formatNumber(item.maxScore)}</span></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>

              {/* Pantallas anchas: tabla completa. */}
              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold text-slate-900">Estudiante</th>
                      {items.map((item) => (
                        <th key={item.id} scope="col" className="min-w-28 px-2 py-3 text-center align-bottom font-semibold text-slate-900">
                          <span className="block">{item.title}</span>
                          <span className="block text-xs font-normal text-slate-500">máx. {formatNumber(item.maxScore)} · {item.isPublished ? "publicada" : "oculta"}</span>
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-900">Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.enrollmentId} className="border-b border-slate-100 last:border-0">
                        <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-1 text-left font-medium text-slate-900">{student.name}</th>
                        {items.map((item) => (
                          <td key={item.id} className="px-1 py-1 text-center">
                            <Link
                              href={cellHref(item.id, student.enrollmentId)}
                              scroll={false}
                              aria-label={cellLabel(student.name, item, student.cells[item.id])}
                              className="mx-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg font-semibold text-blue-700 hover:bg-blue-50 focus-visible:bg-blue-50"
                            >
                              {cellText(student.cells[item.id])}
                            </Link>
                          </td>
                        ))}
                        <td className="px-4 py-1 text-right font-bold text-slate-950">{average(student.average)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                El promedio va de 0 a 100. Cada nota cuenta según su puntaje máximo y el peso de su categoría; lo exonerado («Exon.») y lo que aún no tiene nota no cuentan. Incluye también las actividades ocultas.
              </p>
            </section>
          )}

          {items.length > 0 && (
            <section className={card} aria-labelledby="titulo-actividades">
              <h2 id="titulo-actividades" className="text-lg font-bold text-slate-950">Actividades calificables</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-sm text-slate-600">
                          {severalPeriods ? `${item.periodName} · ` : ""}{item.categoryName} · máximo {formatNumber(item.maxScore)} · {item.gradedCount} de {students.length} con nota
                        </p>
                        <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${item.isPublished ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                          {item.isPublished ? "Los estudiantes ven esta nota" : "Oculta para los estudiantes"}
                        </p>
                      </div>
                      <PublishToggle courseId={book.course.id} itemId={item.id} published={item.isPublished} gradedCount={item.gradedCount} />
                    </div>
                    {item.source === "manual" ? (
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        <details className="min-w-0 flex-1 basis-64">
                          <summary className={summary}>Editar</summary>
                          <ItemForm courseId={book.course.id} categories={categoryOptions} item={{ id: item.id, title: item.title, maxScore: item.maxScore, categoryId: item.categoryId }} />
                        </details>
                        <DeleteItem courseId={book.course.id} itemId={item.id} title={item.title} gradedCount={item.gradedCount} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        {item.source === "assignment" ? "Viene de una tarea: su título y puntaje se cambian allí. " : "Viene de un examen: su título y puntaje se cambian allí. "}
                        <Link
                          className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline"
                          href={item.source === "assignment" ? `/dashboard/aula/${book.course.id}/tareas/${item.sourceId}` : `/dashboard/aula/${book.course.id}/examenes`}
                        >
                          {item.source === "assignment" ? "Abrir la tarea" : "Abrir los exámenes"}
                        </Link>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <details>
              <summary className={summary}>Opciones avanzadas</summary>
              <p className="text-sm text-slate-600">
                Las categorías agrupan las actividades (por ejemplo «Tareas» y «Exámenes») y el peso dice cuánto vale cada grupo en el promedio. Los pesos deben sumar 100 %: así el promedio siempre queda entre 0 y 100.
              </p>
              {book.periods.map((period) => (
                <div key={period.id} className="mt-4">
                  {severalPeriods && <h3 className="mb-2 font-semibold text-slate-900">{period.name}</h3>}
                  <CategoryEditor courseId={book.course.id} periodId={period.id} categories={period.categories} />
                </div>
              ))}
            </details>
          </section>
        </>
      )}

      {cell && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="titulo-editor" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="titulo-editor" className="text-lg font-bold text-slate-950">{cell.student.name}</h2>
                <p className="text-sm text-slate-600">{cell.item.title}</p>
              </div>
              <Link href={base} scroll={false} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 px-3 font-semibold text-slate-800">Cerrar</Link>
            </div>
            <GradeEditor
              key={`${cell.item.id}~${cell.student.enrollmentId}`}
              courseId={book.course.id}
              closeHref={base}
              itemId={cell.item.id}
              enrollmentId={cell.student.enrollmentId}
              maxScore={cell.item.maxScore}
              entry={cell.entry}
            />
            {cell.entry && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="font-semibold text-slate-900">Historial de esta nota</h3>
                {cell.history.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">Esta nota no se ha cambiado desde que se puso.</p>
                ) : (
                  <ul className="mt-2 space-y-3 text-sm">
                    {cell.history.map((change) => (
                      <li key={change.id} className="rounded-lg bg-slate-50 p-3">
                        <p className="font-semibold text-slate-900">
                          {change.from === change.to
                            ? "Cambió el comentario"
                            : `De ${change.from === null ? "sin nota" : formatNumber(change.from)} a ${change.to === null ? "sin nota" : formatNumber(change.to)}`}
                        </p>
                        <p className="text-slate-600">{change.who} · {when.format(change.when)}</p>
                        <p className="text-slate-700">{change.reason ? `Motivo: ${change.reason}` : "Sin motivo escrito."}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
