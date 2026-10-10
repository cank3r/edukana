import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getPlatformAnnouncement } from "@/server/platform/announcements";
import { AnnouncementForm } from "../AnnouncementForm";
export const dynamic = "force-dynamic";
export default async function EditPlatformAnnouncementPage({ params }: { params: Promise<{ announcementId: string }> }) {
  const operator = await getOperatorEmail();
  if (!operator) notFound();
  const item = await getPlatformAnnouncement(operator, (await params).announcementId);
  if (!item) notFound();
  return <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
    <Link className="inline-flex min-h-11 items-center text-blue-700 underline" href="/operador/avisos">Volver a avisos</Link>
    <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Editar aviso</h1>
    <AnnouncementForm initial={{ ...item, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt?.toISOString() ?? null }} />
  </div>;
}
