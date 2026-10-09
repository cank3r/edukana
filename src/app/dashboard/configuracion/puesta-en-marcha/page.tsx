import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Esta pantalla ya no existe: las personas se crean en «Personas» y los períodos en
 * «Períodos académicos». La dirección se conserva porque el inicio y la guía «Primeros pasos»
 * todavía enlazan aquí para «Crear período» y «Revisar períodos»: si no hay un período actual
 * vigente (no hay ninguno, ninguno está marcado o el marcado ya terminó) lleva a los períodos;
 * en cualquier otro caso, al inicio.
 */
export default async function PilotSetupRedirect() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (capabilities.has("academic.structure.manage")) {
    const current = await db.academicPeriod.findFirst({
      where: { institutionId: user.institutionId, isActive: true },
      orderBy: { endDate: "desc" },
      select: { endDate: true },
    });
    if (!current || current.endDate < new Date()) redirect("/dashboard/configuracion/periodos");
  }
  redirect("/dashboard");
}
