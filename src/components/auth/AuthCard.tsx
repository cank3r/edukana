import Image from "next/image";
import Link from "next/link";

/** Marco común de las pantallas públicas de acceso: logo, título, una explicación corta y el contenido. */
export function AuthCard({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 flex justify-center" aria-label="Ir al inicio de sesión de Edukana">
          <Image src="/logos/edukana_horizontal_color.svg" alt="Edukana" width={160} height={42} priority />
        </Link>
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">{intro}</p>
        {children}
      </div>
    </main>
  );
}

export const authInput = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-500";
export const authButton = "min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
export const authLink = "flex min-h-11 items-center justify-center rounded-lg border border-blue-600 px-4 py-2.5 font-semibold text-blue-700";

export function AuthMessage({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {message}
    </p>
  );
}
