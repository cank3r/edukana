import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listPlatformAnnouncements } from "@/server/platform/announcements";
import { announcementIsCurrent } from "@/server/platform/announcement-policy";
import { formatOperatorDateTime } from "../format";

export const dynamic = "force-dynamic";
const audiences = { ALL: "Todas las personas", ADMINS: "Administradores", INDEPENDENT: "Docentes independientes" };
export default async function PlatformAnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const operator = await getOperatorEmail();
  if (!operator) notFound();
  const announcements = await listPlatformAnnouncements(operator);
  const query = await searchParams;
  const now = new Date();
  return <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <header><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Avisos de Edukana</h1>
      <p className="mt-1 text-sm text-slate-600">Mensajes de la plataforma que aparecen al entrar al panel. Las horas son de Santo Domingo.</p></header>
    {(query.guardado || query.terminado) && <p role="status" className="rounded-lg bg-emerald-50 p-3">
      {query.terminado ? "Aviso terminado." : "Aviso guardado."}</p>}
    <Link href="/operador/avisos/nuevo" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 font-semibold text-white">
      Crear aviso</Link>
    {!announcements.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">Todavía no hay avisos de Edukana. Crea el primero para informar a tu comunidad.</p>}
    <ul className="space-y-3">{announcements.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="break-words text-lg font-semibold">{item.title}</h2>
      <p className="text-sm text-slate-600">{audiences[item.audience]} · {announcementIsCurrent(item, now)
        ? "Visible" : item.endsAt && item.endsAt <= now ? "Terminado" : "Programado"}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.body}</p>
      <p className="mt-2 text-sm text-slate-600">Desde el {formatOperatorDateTime(item.startsAt)}
        {item.endsAt ? ` hasta el ${formatOperatorDateTime(item.endsAt)}` : " · Sin fecha de fin"}</p>
      <Link href={`/operador/avisos/${item.id}`} className="mt-2 inline-flex min-h-11 items-center text-blue-700 underline">
        Editar o terminar<span className="sr-only"> {item.title}</span></Link>
    </li>)}</ul>
    {announcements.length === 100 && <p className="text-sm text-slate-600">Se muestran los 100 avisos más recientes.</p>}
  </div>;
}
