"use client";

import { useEffect } from "react";

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("courses route failed", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950" role="alert">
        <h1 className="text-xl font-bold">No pudimos cargar los cursos</h1>
        <p className="mt-2 text-sm">Revisa tu conexión e inténtalo otra vez. Si continúa, comparte el código mostrado por la aplicación.</p>
        <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white">
          Reintentar
        </button>
      </div>
    </div>
  );
}
