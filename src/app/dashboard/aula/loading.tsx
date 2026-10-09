export default function CoursesLoading() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8" aria-busy="true" aria-label="Cargando cursos">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mb-6 h-11 w-full animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-5 w-20 rounded bg-slate-100" />
            <div className="mt-4 h-6 w-3/4 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando cursos…</span>
    </div>
  );
}
