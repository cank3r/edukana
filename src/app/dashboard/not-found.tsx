import Link from "next/link";

export default function DashboardNotFound() {
  return <div className="flex min-h-full items-center justify-center p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-xl font-bold text-slate-900">Recurso no encontrado</h1><p className="mt-2 text-sm text-slate-600">El registro no existe o no pertenece a tu institución.</p><Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Volver al inicio</Link></div></div>;
}
