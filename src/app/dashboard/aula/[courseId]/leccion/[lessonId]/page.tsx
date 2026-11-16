import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeLessonVideo, type LessonVideo } from "@/lib/lesson-video";
import { getLessonView, parseVideoLink, type LessonView } from "@/server/courses/lesson-progress";
import { LessonActions } from "./LessonActions";
import { AskCourse } from "@/components/ai/AskCourse";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<LessonView["lesson"]["type"], string> = { TEXT: "Lectura", VIDEO: "Video", DOCUMENT: "Documento", ACTIVITY: "Actividad" };

function formatDay(value: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone }).format(value);
  } catch {
    return new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(value);
  }
}

function Outline({ view, base }: { view: LessonView; base: string }) {
  return (
    <nav aria-label="Temario del curso">
      <ol className="space-y-4">
        {view.outline.map((section) => (
          <li key={section.id}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{section.title}</p>
            <ol className="mt-1">
              {section.lessons.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${base}/${item.id}`}
                    aria-current={item.current ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm ${item.current ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.completed ? "bg-emerald-600 text-white" : "border border-slate-300"}`}>
                      {item.completed ? "✓" : ""}
                    </span>
                    <span className="min-w-0 break-words">{item.title}</span>
                    {item.completed && <span className="sr-only"> (completada)</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Progress({ view }: { view: LessonView }) {
  if (view.mode !== "student") return <p className="text-sm text-slate-600">{view.totalLessons === 1 ? "1 lección publicada" : `${view.totalLessons} lecciones publicadas`}</p>;
  const percent = view.totalLessons ? Math.round((view.completedLessons / view.totalLessons) * 100) : 0;
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{view.completedLessons} de {view.totalLessons} lecciones</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Avance del curso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Reproductor 16:9 del video de la lección. La dirección se vuelve a validar aquí antes de mostrarla. */
function LessonPlayer({ video, title }: { video: LessonVideo; title: string }) {
  if (video.kind === "file") {
    return (
      <video className="aspect-video w-full rounded-xl bg-black" controls preload="metadata" title={`Video: ${title}`}>
        <source src={video.src} />
        Tu navegador no puede mostrar este video.
      </video>
    );
  }
  return (
    <iframe
      src={video.src}
      title={`Video: ${title} (${video.provider})`}
      className="aspect-video w-full rounded-xl border-0 bg-black"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      loading="lazy"
    />
  );
}

function LessonBody({ lesson }: { lesson: LessonView["lesson"] }) {
  const player = normalizeLessonVideo(lesson.videoUrl);
  // Formato anterior: una lección de video guardaba solo el enlace en el contenido.
  const legacyVideo = !player && lesson.type === "VIDEO" ? parseVideoLink(lesson.content) : null;
  const shown = player ?? (legacyVideo?.kind === "embed" ? normalizeLessonVideo(legacyVideo.src) : null);
  const legacyLink = legacyVideo?.kind === "link" ? legacyVideo : null;
  const videoFiles = lesson.assets.filter((asset) => asset.kind === "VIDEO");
  const files = lesson.assets.filter((asset) => asset.kind !== "VIDEO");
  const hasText = Boolean(lesson.content?.trim()) && !legacyVideo;
  const isEmpty = !player && !legacyVideo && !hasText && lesson.assets.length === 0;

  return (
    <div className="mt-6 space-y-5">
      {shown && <LessonPlayer video={shown} title={lesson.title} />}
      {legacyLink && (
        <a href={legacyLink.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">
          Abrir video
        </a>
      )}
      {videoFiles.map((asset) => (
        <video key={asset.id} className="aspect-video w-full rounded-xl bg-black" controls preload="metadata">
          <source src={`/api/assets/${asset.id}`} type={asset.mimeType} />
          Tu navegador no puede mostrar este video.
        </video>
      ))}
      {/* React escribe el contenido como texto: lo que haya escrito el docente nunca se interpreta como HTML. */}
      {hasText && <div className="whitespace-pre-wrap break-words text-base leading-7 text-slate-800">{lesson.content}</div>}
      {files.length > 0 && (
        <section aria-labelledby="archivos-leccion">
          <h2 id="archivos-leccion" className="text-sm font-bold text-slate-900">Archivos de la lección</h2>
          <ul className="mt-2 space-y-2">
            {files.map((asset) => (
              <li key={asset.id}>
                <a href={`/api/assets/${asset.id}`} className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 underline">
                  <span className="min-w-0 break-words">Descargar {asset.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isEmpty && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Esta lección todavía no tiene contenido.</p>}
    </div>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const user = (await auth())?.user;
  if (!user?.id) redirect("/login");
  const { courseId, lessonId } = await params;
  const view = await getLessonView({ id: user.id, institutionId: user.institutionId, role: user.role }, { courseId, lessonId });
  if (!view) notFound();

  const courseHref = `/dashboard/aula/${view.course.id}`;
  const base = `${courseHref}/leccion`;
  const { lesson } = view;
  const timeZone = view.completedAt
    ? ((await db.institution.findUnique({ where: { id: user.institutionId }, select: { timezone: true } }))?.timezone ?? "UTC")
    : "UTC";
  const allDone = view.mode === "student" && view.totalLessons > 0 && view.completedLessons >= view.totalLessons;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      {view.mode === "preview" && (
        <p role="note" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Vista previa: así la ve el estudiante.{!lesson.isPublished && " Esta lección todavía no está publicada, así que los estudiantes aún no la ven."}
          {" "}<Link href={`/dashboard/aula/${view.course.id}/generar-preguntas?leccion=${lesson.id}`} className="inline-flex min-h-11 items-center font-semibold underline">Generar preguntas con IA</Link>
        </p>
      )}
      {allDone && (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Completaste todas las lecciones de este curso.</p>
      )}

      <details className="mt-3 rounded-xl border border-slate-200 bg-white lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 font-semibold text-slate-900">
          <span>Temario</span>
          <span className="text-sm font-normal text-slate-600">
            {view.mode === "student" ? `${view.completedLessons} de ${view.totalLessons} lecciones` : `${view.totalLessons} publicadas`}
          </span>
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-3">
          <Progress view={view} />
          <Outline view={view} base={base} />
        </div>
      </details>

      <div className="mt-4 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-slate-950">Temario</h2>
            <Progress view={view} />
            <Outline view={view} base={base} />
          </div>
        </aside>

        <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
          <p className="text-sm font-semibold text-blue-700">{lesson.sectionTitle}</p>
          <h1 className="mt-1 break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{lesson.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{TYPE_LABEL[lesson.type]} · {lesson.estimatedMinutes} min</p>
          {lesson.summary && <p className="mt-3 whitespace-pre-wrap break-words text-slate-700">{lesson.summary}</p>}

          <LessonBody lesson={lesson} />

          {view.mode === "student" ? (
            <LessonActions
              key={`${lesson.id}:${view.completedAt ? "1" : "0"}`}
              courseId={view.course.id}
              lessonId={lesson.id}
              previousHref={view.previousLessonId ? `${base}/${view.previousLessonId}` : null}
              nextHref={view.nextLessonId ? `${base}/${view.nextLessonId}` : null}
              courseHref={courseHref}
              completedOn={view.completedAt ? formatDay(view.completedAt, timeZone) : null}
              canComplete={view.canComplete}
            />
          ) : (
            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
              {view.previousLessonId ? <Link href={`${base}/${view.previousLessonId}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Anterior</Link> : <span />}
              {view.nextLessonId && <Link href={`${base}/${view.nextLessonId}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Siguiente</Link>}
            </div>
          )}
          {view.mode === "student" && <AskCourse actor={{ id: user.id, institutionId: user.institutionId, role: user.role }} courseId={view.course.id} lessonId={lesson.id} />}
        </article>
      </div>
    </div>
  );
}
