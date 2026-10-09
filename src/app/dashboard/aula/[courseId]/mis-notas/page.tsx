import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatNumber } from "@/lib/gradebook-calc";
import { loadMyGrades } from "@/server/assessment/gradebook";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-slate-200 bg-white p-5";

export default async function MyGradesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  if (user.role !== "STUDENT") redirect(`/dashboard/aula/${courseId}/calificaciones`);
  const grades = await loadMyGrades({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!grades) notFound();

  const severalGroups = grades.groups.length > 1;
  const nothingYet = grades.groups.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mis notas</h1>
      </header>

      <section className={card} aria-labelledby="titulo-promedio">
        <h2 id="titulo-promedio" className="text-sm font-semibold text-slate-600">Mi promedio hasta ahora</h2>
        <p className="mt-1 text-4xl font-bold text-slate-950">
          {grades.average === null ? "—" : formatNumber(grades.average)}
          {grades.average !== null && <span className="text-lg font-semibold text-slate-500"> de 100</span>}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {grades.average === null
            ? "Aparecerá cuando tu docente publique tu primera nota."
            : severalGroups
              ? "Se calcula con tus notas publicadas, según el peso de cada categoría. Lo que aún no tiene nota y lo exonerado no cuentan."
              : "Se calcula con tus notas publicadas. Lo que aún no tiene nota y lo exonerado no cuentan."}
        </p>
      </section>

      {nothingYet ? (
        <p className={`${card} text-sm text-slate-600`}>Tu docente todavía no ha publicado notas en este curso. Cuando lo haga, las verás aquí con sus comentarios.</p>
      ) : (
        <>
          {grades.pending.length > 0 && (
            <section className={card} aria-labelledby="titulo-pendientes">
              <h2 id="titulo-pendientes" className="text-lg font-bold text-slate-950">Falta por calificar ({grades.pending.length})</h2>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {grades.pending.map((item) => (
                  <li key={item.id}>
                    {item.title}
                    {severalGroups && <span className="text-slate-500"> · {item.categoryName}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {grades.groups.map((group) => (
            <section key={group.id} className={card} aria-labelledby={`grupo-${group.id}`}>
              <h2 id={`grupo-${group.id}`} className="text-lg font-bold text-slate-950">
                {group.name}
                {severalGroups && <span className="ml-2 text-sm font-normal text-slate-500">vale {formatNumber(group.weight)} % del promedio</span>}
              </h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {group.items.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="shrink-0 text-right text-sm">
                        {item.isExcused ? (
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">Exonerado</span>
                        ) : item.score === null ? (
                          <span className="text-slate-500">Sin calificar</span>
                        ) : (
                          <>
                            <strong className="text-base text-slate-950">{formatNumber(item.score)}</strong>
                            <span className="text-slate-500"> de {formatNumber(item.maxScore)}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {item.isExcused && <p className="mt-1 text-sm text-slate-600">No cuenta en tu promedio.</p>}
                    {item.feedback && (
                      <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">Comentario de tu docente: </span>
                        {item.feedback}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
