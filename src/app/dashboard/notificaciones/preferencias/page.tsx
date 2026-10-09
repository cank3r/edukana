import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEmailPreferences } from "@/server/notifications/preferences";
import { PreferencesForm } from "./PreferencesForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Correos de notificación · Edukana" };

export default async function NotificationPreferencesPage() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const items = await getEmailPreferences({ id: user.id, institutionId: user.institutionId });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Qué me llega por correo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Todo te sigue apareciendo en Notificaciones. Aquí eliges qué quieres recibir también en tu correo{user.email ? ` (${user.email})` : ""}.
        </p>
      </header>

      {items.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-950">No hay correos para elegir</h2>
          <p className="mt-1 text-sm text-slate-700">Tu cuenta no recibe notificaciones por correo. Seguirás viendo todo en Notificaciones.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <PreferencesForm items={items} />
        </section>
      )}

      <Link href="/dashboard/notificaciones" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50">
        Volver a Notificaciones
      </Link>
    </div>
  );
}
