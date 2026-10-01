"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="flex min-h-full items-center justify-center p-6"><div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center"><h1 className="text-xl font-bold text-slate-900">No pudimos cargar esta sección</h1><p className="mt-2 text-sm text-slate-600">Verifica tu conexión e inténtalo de nuevo. Si el problema continúa, contacta a tu institución.</p><button type="button" onClick={reset} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Reintentar</button></div></div>;
}
