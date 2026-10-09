import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, BookOpen, CalendarDays, ClipboardList, CreditCard, GraduationCap, Megaphone, UserCheck } from "lucide-react";
import { AnnouncementContent } from "@/components/dashboard/AnnouncementContent";
import { safeAnnouncementHref } from "@/lib/announcements";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { formatNumber } from "@/lib/gradebook-calc";
import { spanishLabel } from "@/lib/ux";
import { authorizeChildren, getChildOverview, type ChildTask } from "@/server/family/guardian-portal";

const card = "rounded-xl border border-slate-200 bg-white p-4";
const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const money = (cents: number, currency: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(cents / 100);
/** Fechas guardadas sin hora (asistencia): se muestran tal cual, sin moverlas de día. */
const plainDate = (value: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(value);

const TASK_GROUPS: Array<{ title: string; states: ChildTask["state"][]; empty: string }> = [
  { title: "Pendientes", states: ["overdue", "pending"], empty: "No tiene tareas pendientes." },
  { title: "Entregadas", states: ["submitted"], empty: "No hay tareas esperando calificación." },
  { title: "Calificadas", states: ["graded"], empty: "Todavía no hay tareas con nota publicada." },
];

export default async function ChildOverviewPage({ params }: { params: Promise<{ studentId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "PARENT" || !capabilities.has("child.portal.view")) redirect("/dashboard");

  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const { studentId } = await params;
  // Las dos lecturas pasan por la misma comprobación de vínculo activo; sin vínculo no hay página.
  const [view, siblings] = await Promise.all([getChildOverview(actor, studentId), authorizeChildren(actor)]);
  if (!view) notFound();

  const { permissions } = view;
  const date = (value: Date | null) => (value ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: view.timezone }).format(value) : "Sin fecha");
  const showUpcoming = permissions.schedule || permissions.academics;
  const nothingAllowed = !Object.values(permissions).some(Boolean);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="text-sm font-semibold text-blue-700">Mis hijos</p>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{view.child.name}</h1>
        <p className="mt-1 text-sm text-slate-600">Aquí solo se consulta: no se cambia nada.</p>
      </header>

      {siblings.length > 1 && (
        <nav aria-label="Cambiar de hijo" className="mb-6 flex flex-wrap gap-2">
          {siblings.map((sibling) => {
            const current = sibling.student.id === view.child.id;
            return (
              <Link key={sibling.student.id} href={`/dashboard/hijos/${encodeURIComponent(sibling.student.id)}`} aria-current={current ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${current ? "bg-blue-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
                {sibling.student.name}
              </Link>
            );
          })}
        </nav>
      )}

      {view.alerts.length > 0 && (
        <ul className="mb-6 space-y-2" aria-label="Avisos importantes">
          {view.alerts.map((alert) => (
            <li key={alert.kind} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />{alert.text}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-8">
        {permissions.academics && (
          <section aria-labelledby="cursos">
            <Heading id="cursos" icon={<BookOpen aria-hidden="true" />} title="Cursos y avance" />
            {view.courses.length === 0 ? <Empty text="No está inscrito en ningún curso por ahora." /> : (
              <div className="grid gap-3 md:grid-cols-2">
                {view.courses.map((course) => (
                  <article className={card} key={course.courseId}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words font-semibold text-slate-900">{course.name}</h3>
                      {course.completed && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Completado</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{course.teacherName}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progressPercent} aria-label={`Avance en ${course.name}`}>
                      <div className="h-full rounded-full bg-blue-700" style={{ width: `${course.progressPercent}%` }} />
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{course.progressPercent} % · {course.lessonsDone} de {course.lessonsTotal} lecciones completadas</p>
                    {course.finalGrade !== null && <p className="mt-2 text-sm text-slate-900">Nota final: <strong>{formatNumber(course.finalGrade)}</strong></p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {permissions.academics && (
          <section aria-labelledby="tareas">
            <Heading id="tareas" icon={<ClipboardList aria-hidden="true" />} title="Tareas" />
            {view.tasks.length === 0 ? <Empty text="Sus cursos todavía no tienen tareas." /> : (
              <div className="space-y-4">
                {TASK_GROUPS.map((group) => {
                  const tasks = view.tasks.filter((task) => group.states.includes(task.state));
                  return (
                    <div key={group.title}>
                      <h3 className="mb-2 text-sm font-semibold text-slate-700">{group.title} ({tasks.length})</h3>
                      {tasks.length === 0 ? <p className="text-sm text-slate-600">{group.empty}</p> : (
                        <ul className="space-y-2">
                          {tasks.map((task) => (
                            <li className={card} key={task.id}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-words font-semibold text-slate-900">{task.title}</p>
                                  <p className="text-sm text-slate-600">{task.courseName} · {task.dueText ? `Fecha límite: ${task.dueText}` : "Sin fecha límite"}</p>
                                </div>
                                {task.state === "overdue" && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">Vencida sin entregar</span>}
                                {task.state === "graded" && task.score !== null && <strong className="text-slate-900">{formatNumber(task.score)} / {formatNumber(task.maxScore)}</strong>}
                              </div>
                              {task.feedback && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Comentario del docente: </span>{task.feedback}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {permissions.academics && (
          <section aria-labelledby="notas">
            <Heading id="notas" icon={<GraduationCap aria-hidden="true" />} title="Notas" />
            {view.grades.every((course) => course.items.length === 0) ? <Empty text="Todavía no hay notas publicadas por sus docentes." /> : (
              <div className="grid gap-3 md:grid-cols-2">
                {view.grades.filter((course) => course.items.length > 0).map((course) => (
                  <article className={card} key={course.courseId}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words font-semibold text-slate-900">{course.courseName}</h3>
                      <p className="shrink-0 text-right text-sm text-slate-600">Promedio<br /><strong className="text-xl text-blue-700">{course.average === null ? "—" : formatNumber(course.average)}</strong></p>
                    </div>
                    <ul className="mt-3 divide-y divide-slate-100">
                      {course.items.map((item) => (
                        <li className="py-2 text-sm" key={item.id}>
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 break-words text-slate-800">{item.title}</span>
                            <span className="shrink-0 font-semibold text-slate-900">{item.isExcused ? "Exonerada" : item.score === null ? "Sin nota aún" : `${formatNumber(item.score)} / ${formatNumber(item.maxScore)}`}</span>
                          </div>
                          {item.feedback && <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{item.feedback}</p>}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {permissions.attendance && view.attendance && (
          <section aria-labelledby="asistencia">
            <Heading id="asistencia" icon={<UserCheck aria-hidden="true" />} title="Asistencia" />
            {view.attendance.percent === null && view.attendance.incidents.length === 0 ? <Empty text="Todavía no se ha tomado asistencia en sus cursos." /> : (
              <div className={card}>
                {view.attendance.percent !== null && <p className="text-sm text-slate-700">Asistió al <strong className="text-2xl text-blue-700">{view.attendance.percent} %</strong> de sus clases.</p>}
                {view.attendance.incidents.length === 0 ? <p className="mt-2 text-sm text-slate-600">Sin ausencias ni tardanzas.</p> : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {view.attendance.incidents.map((incident) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={incident.id}>
                        <span className="text-slate-800">{plainDate(incident.date)} · {incident.courseName}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${incident.status === "ABSENT" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{spanishLabel(incident.status)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {showUpcoming && (
          <section aria-labelledby="proximas">
            <Heading id="proximas" icon={<CalendarDays aria-hidden="true" />} title="Próximas clases y fechas" />
            {view.liveClasses.length + view.deadlines.length + view.weekly.length + view.events.length === 0 ? <Empty text="No hay clases ni fechas próximas." /> : (
              <div className="grid gap-3 md:grid-cols-2">
                {view.liveClasses.length > 0 && (
                  <div className={card}>
                    <h3 className="font-semibold text-slate-900">Clases en vivo</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {view.liveClasses.map((item) => <li key={item.id}><span className="font-semibold text-slate-800">{item.when}</span> · {item.title} ({item.courseName}), {item.durationMinutes} min</li>)}
                    </ul>
                    <p className="mt-3 text-xs text-slate-600">A la clase entra el estudiante desde su propia cuenta.</p>
                  </div>
                )}
                {view.deadlines.length > 0 && (
                  <div className={card}>
                    <h3 className="font-semibold text-slate-900">Fechas límite</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {view.deadlines.map((item) => <li key={item.key}><span className="font-semibold text-slate-800">{item.dueText}</span> · {item.kind}: {item.title} ({item.courseName})</li>)}
                    </ul>
                  </div>
                )}
                {view.weekly.length > 0 && (
                  <div className={card}>
                    <h3 className="font-semibold text-slate-900">Horario de la semana</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {view.weekly.map((slot) => <li key={slot.id}><span className="font-semibold text-slate-800">{WEEKDAYS[slot.weekday] ?? ""} {clock(slot.startMinutes)}–{clock(slot.endMinutes)}</span> · {slot.courseName} · {slot.classroom}</li>)}
                    </ul>
                  </div>
                )}
                {view.events.length > 0 && (
                  <div className={card}>
                    <h3 className="font-semibold text-slate-900">Fechas de la institución</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {view.events.map((event) => <li key={event.id}><span className="font-semibold text-slate-800">{date(event.startDate)}</span> · {event.title}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {permissions.announcements && (
          <section aria-labelledby="avisos">
            <Heading id="avisos" icon={<Megaphone aria-hidden="true" />} title="Avisos" />
            {view.announcements.length === 0 ? <Empty text="No hay avisos para ti ni para tu hijo." /> : (
              <div className="space-y-3">
                {view.announcements.map((announcement) => {
                  const safeUrl = announcement.externalUrl ? safeAnnouncementHref(announcement.externalUrl) : null;
                  return (
                    <article className={card} key={announcement.id}>
                      <h3 className="break-words font-semibold text-slate-900">{announcement.title}</h3>
                      <div className="mt-2"><AnnouncementContent content={announcement.content} mentionIds={new Set(announcement.mentions.map((mention) => mention.userId))} /></div>
                      {announcement.assets.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {announcement.assets.map((asset) => asset.mimeType.startsWith("image/")
                            ? <Image alt={asset.originalName} className="h-40 w-full rounded-lg object-cover" height={320} key={asset.id} src={`/api/assets/${asset.id}`} unoptimized width={640} />
                            : <video aria-label={asset.originalName} className="h-40 w-full rounded-lg bg-black object-contain" controls key={asset.id} preload="metadata" src={`/api/assets/${asset.id}`} />)}
                        </div>
                      )}
                      {announcement.relatedCourses.length > 0 && <p className="mt-3 text-sm text-slate-600">Curso: {announcement.relatedCourses.map(({ course }) => course.name).join(", ")}</p>}
                      {safeUrl && <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={safeUrl} rel="noopener noreferrer" target={safeUrl.startsWith("https:") ? "_blank" : undefined}>Abrir enlace del aviso</a>}
                      <p className="mt-2 text-xs text-slate-600">{date(announcement.publishedAt)}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {permissions.finance && view.account && (
          <section aria-labelledby="cuenta">
            <Heading id="cuenta" icon={<CreditCard aria-hidden="true" />} title="Estado de cuenta" />
            {view.account.charges.length === 0 ? <Empty text="No tiene pagos pendientes." /> : (
              <div className={card}>
                {view.account.totals.map((total) => (
                  <dl className="grid grid-cols-2 gap-3 text-sm" key={total.currency}>
                    <div><dt className="text-slate-600">Debe en total</dt><dd className="text-xl font-bold text-slate-900">{money(total.owedCents, total.currency)}</dd></div>
                    <div><dt className="text-slate-600">De eso, ya vencido</dt><dd className={`text-xl font-bold ${total.overdueCents > 0 ? "text-red-700" : "text-slate-900"}`}>{money(total.overdueCents, total.currency)}</dd></div>
                  </dl>
                ))}
                <ul className="mt-3 divide-y divide-slate-100">
                  {view.account.charges.map((charge) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={charge.id}>
                      <span className="min-w-0 break-words text-slate-800">{charge.concept} · {charge.dueDate ? `vence ${date(charge.dueDate)}` : "sin fecha de vencimiento"}{charge.status === "PARTIAL" && " · con pago parcial"}</span>
                      <span className="flex items-center gap-2"><strong>{money(charge.amountCents, charge.currency)}</strong>{charge.overdue && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">Vencido</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {nothingAllowed && <Empty text="La institución todavía no ha indicado qué información puedes ver de este estudiante. Pídelo en la administración o la coordinación." />}
      </div>
    </div>
  );
}

function Heading({ id, icon, title }: { id: string; icon: React.ReactNode; title: string }) {
  return <h2 id={id} className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--navy)" }}><span className="text-blue-700">{icon}</span>{title}</h2>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-700">{text}</p>;
}
