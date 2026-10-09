import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { AnnouncementForm } from "../AnnouncementForm";
export const dynamic = "force-dynamic";
export default async function NewPlatformAnnouncementPage() {
  if (!(await getOperatorEmail())) notFound();
  return <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
    <Link className="inline-flex min-h-11 items-center text-blue-700 underline" href="/operador/avisos">Volver a avisos</Link>
    <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Crear aviso</h1><AnnouncementForm />
  </div>;
}
