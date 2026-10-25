import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";

/** Quien presenta exámenes: un estudiante con permiso de participar. `null` para cualquier otra persona. */
export async function currentStudent() {
  const user = (await auth())?.user;
  if (!user?.id) redirect("/login");
  if (!user.institutionId || user.role !== "STUDENT") return null;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  return capabilities.has("course.participate") ? { id: user.id, institutionId: user.institutionId } : null;
}

/** Fecha y hora en la zona horaria de la institución, por ejemplo «lunes, 12 de octubre, 3:00 p. m.». */
export function dateTime(value: Date, timezone: string) {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(value);
  try {
    return format(timezone);
  } catch {
    return format("America/Santo_Domingo");
  }
}

export function points(value: number) {
  return Number(value.toFixed(2)).toLocaleString("es");
}

export function timeLimit(durationMinutes: number | null, closesAt: Date | null) {
  if (durationMinutes) return durationMinutes === 1 ? "1 minuto" : `${durationMinutes} minutos`;
  return closesAt ? "Sin contador propio: tienes hasta la hora de cierre" : "Hasta 24 horas desde que inicias";
}

export const primaryLink = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";
export const secondaryLink = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";

/** Pantalla para cuando no hay nada que mostrar: dice por qué y ofrece a dónde ir. */
export function NothingHere({ title, message, href, label }: { title: string; message: string; href: string; label: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
      <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{title}</h1>
      <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700">{message}</p>
      <Link className={secondaryLink} href={href}>{label}</Link>
    </div>
  );
}
