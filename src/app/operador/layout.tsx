import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";

export const metadata: Metadata = { title: "Panel de la plataforma · Edukana" };
export const dynamic = "force-dynamic";

/** Panel del operador de la plataforma. Para cualquier otra cuenta la ruta no existe. */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!(await getOperatorEmail())) notFound();
  return (
    <div className="min-h-screen" style={{ background: "var(--cloud)" }}>
      <a className="skip-link" href="#contenido-operador">Saltar al contenido principal</a>
      <header className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-8" style={{ background: "var(--navy)" }}>
        <Link href="/operador" aria-label="Ir al panel de la plataforma" className="flex items-center gap-3">
          <Image src="/logos/edukana_horizontal_color_fondo_oscuro.svg" alt="Edukana" width={128} height={34} priority />
          <span className="hidden text-sm font-semibold text-white/80 sm:inline">Panel de la plataforma</span>
        </Link>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/10">
          Volver a mi institución
        </Link>
      </header>
      <main id="contenido-operador" tabIndex={-1}>{children}</main>
    </div>
  );
}
