import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CalendarDays } from "lucide-react";

export default async function CalendarioPage() {
  const session = await auth();
  const user = session!.user;
  const events = await db.calendarEvent.findMany({ where: { institutionId: user.institutionId, endDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, orderBy: { startDate: "asc" }, take: 100 });
  const date = (value: Date) => new Intl.DateTimeFormat("es", { dateStyle: "long", ...(value.getUTCHours() ? { timeStyle: "short" as const } : {}) }).format(value);
  return <div className="mx-auto max-w-4xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Calendario</h1><p className="mt-1 text-sm text-slate-500">Próximos eventos de tu institución</p></div><div className="space-y-3">{events.map((event) => <article key={event.id} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4"><div className="mt-1 h-10 w-1 shrink-0 rounded" style={{ background: event.color ?? "var(--blue)" }} /><div><h2 className="font-semibold">{event.title}</h2><p className="text-sm text-slate-500">{date(event.startDate)}{event.endDate ? ` – ${date(event.endDate)}` : ""}</p>{event.description && <p className="mt-2 text-sm text-slate-600">{event.description}</p>}</div></article>)}{events.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500"><CalendarDays className="mx-auto mb-3 text-slate-300" size={40} />No hay eventos próximos.</div>}</div></div>;
}
