import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award, Bell, BookOpen, CalendarClock, ClipboardCheck, ClipboardList, CreditCard, FileText, Inbox, Megaphone,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatZonedTime, isValidTimeZone } from "@/lib/timezone";
import { markAllNotificationsReadAction, openNotificationAction } from "@/server/actions/notifications";
import { countUnread, groupByDay, listNotifications } from "@/server/notifications";
import { PendingButton } from "./NotificationButtons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notificaciones · Edukana" };

const ICONS: Record<string, typeof Bell> = {
  announcement: Megaphone,
  assignment: ClipboardList,
  submission: Inbox,
  grade: ClipboardCheck,
  exam: FileText,
  live_class: CalendarClock,
  certificate: Award,
  enrollment: BookOpen,
  charge: CreditCard,
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ antes?: string | string[] }> }) {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const viewer = { id: user.id, institutionId: user.institutionId };
  const params = await searchParams;
  const cursor = typeof params.antes === "string" ? params.antes : null;

  const [page, unread, institution] = await Promise.all([
    listNotifications(viewer, { cursor }),
    countUnread(viewer),
    db.institution.findUnique({ where: { id: user.institutionId }, select: { timezone: true } }),
  ]);
  const timeZone = institution && isValidTimeZone(institution.timezone) ? institution.timezone : "America/Santo_Domingo";
  const groups = groupByDay(page.items, timeZone);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Notificaciones</h1>
          <p className="mt-1 text-sm text-slate-600">
            {unread > 0 ? `Tienes ${unread === 1 ? "1 sin leer" : `${unread} sin leer`}. ` : ""}
            Toca una para abrirla.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/notificaciones/preferencias" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50">
            Elegir qué me llega por correo
          </Link>
          {unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <PendingButton
                label="Marcar todas como leídas"
                pendingLabel="Marcando…"
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              />
            </form>
          )}
        </div>
      </header>

      {page.items.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-950">{cursor ? "No hay notificaciones más antiguas" : "No tienes notificaciones"}</h2>
          <p className="mt-1 text-sm text-slate-700">
            Aquí te avisamos de lo que te toca: tareas y exámenes nuevos, tus notas, las clases en vivo, los avisos de tu institución y tus cobros.
          </p>
          <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href={cursor ? "/dashboard/notificaciones" : "/dashboard"}>
            {cursor ? "Ver las más recientes" : "Ir al inicio"}
          </Link>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`dia-${group.key}`}>
            <h2 id={`dia-${group.key}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{group.label}</h2>
            <ul className="space-y-2">
              {group.items.map((item) => {
                const Icon = ICONS[item.kind] ?? Bell;
                const isNew = !item.readAt;
                return (
                  <li key={item.id}>
                    <form action={openNotificationAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        className={`flex min-h-11 w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${isNew ? "border-blue-200 bg-blue-50 hover:bg-blue-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isNew ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`break-words ${isNew ? "font-bold text-slate-950" : "font-semibold text-slate-800"}`}>
                              {isNew && <span className="sr-only">Sin leer: </span>}
                              {item.title}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">{formatZonedTime(item.createdAt, timeZone)}</span>
                          </span>
                          {item.body && <span className="mt-1 block break-words text-sm text-slate-700">{item.body}</span>}
                        </span>
                        {isNew && <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {(page.nextCursor || (cursor && page.items.length > 0)) && (
        <nav aria-label="Más notificaciones" className="flex flex-wrap gap-3">
          {cursor && page.items.length > 0 && (
            <Link href="/dashboard/notificaciones" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50">
              Ver las más recientes
            </Link>
          )}
          {page.nextCursor && (
            <Link href={`/dashboard/notificaciones?antes=${encodeURIComponent(page.nextCursor)}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50">
              Ver anteriores
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
