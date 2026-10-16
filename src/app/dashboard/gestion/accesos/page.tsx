import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { countPendingInvitations } from "@/server/people/invitations";
import { peopleReturnHref } from "../people-navigation";
import { ImportPeople, InvitePending } from "./AccessTools";

export const dynamic = "force-dynamic";

const link = "inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-[var(--blue)] underline " +
  "[overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--blue)]";
const template = "Nombre,Correo,Rol,Teléfono\nAna Pérez,ana@ejemplo.invalid,estudiante,8095550100\n";

type Params = { q?: string | string[]; volver?: string | string[] };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.manage")) redirect("/dashboard");

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const searchHref = peopleReturnHref(`/dashboard/gestion?${new URLSearchParams({ q })}`);
  const returnHref = peopleReturnHref(params.volver ?? searchHref);
  const pending = await countPendingInvitations(user.institutionId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <Link className={link} href={returnHref}>← Volver a Personas</Link>
      <header>
        <h1 className="text-2xl font-bold text-[var(--navy)]">Importar e invitar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Agrega personas desde un archivo y revisa las invitaciones pendientes de tu institución.
        </p>
      </header>

      {q && (
        <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          <p className="[overflow-wrap:anywhere]">
            La búsqueda de personas está en el directorio. Conservamos «{q}» para que continúes allí.
          </p>
          <Link className={`mt-1 ${link}`} href={searchHref}>Buscar en Personas</Link>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="paso-importar">
        <h2 id="paso-importar" className="text-lg font-bold text-slate-950">1. Agregar personas desde un archivo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Guarda tu hoja de cálculo como CSV con las columnas <strong>Nombre</strong> y <strong>Correo</strong>.
          Puedes añadir <strong>Rol</strong> (estudiante, docente o tutor) y <strong>Teléfono</strong>.
          Antes de crear personas revisarás un resumen.
        </p>
        <a className={`mt-2 ${link}`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          download="plantilla-personas.csv">Descargar plantilla de ejemplo</a>
        <p className="text-sm text-slate-600">La plantilla tiene datos ficticios. Sustitúyelos por los de tu lista antes de importarla.</p>
        <ImportPeople />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="paso-invitar">
        <h2 id="paso-invitar" className="text-lg font-bold text-slate-950">2. Invitar a todas las personas pendientes</h2>
        <InvitePending pending={pending} />
      </section>

      <aside className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="gestion-personas">
        <h2 id="gestion-personas" className="font-semibold text-slate-950">Datos y estado de cada persona</h2>
        <p className="mt-1 text-sm text-slate-600">
          Para buscar a alguien, editar sus datos o cambiar su estado en esta institución, vuelve a Personas.
        </p>
        <Link className={`mt-1 ${link}`} href="/dashboard/gestion?estado=suspendidos">Ver personas suspendidas</Link>
      </aside>
    </div>
  );
}
