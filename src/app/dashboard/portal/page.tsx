import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";

/**
 * «Mi aprendizaje» se unió a «Mis cursos» (`/dashboard/aula` ya muestra solo los cursos del estudiante).
 * El estado de cuenta y los certificados tienen su propia entrada en el menú del estudiante.
 */
export default async function StudentPortalPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  redirect(user.role === "STUDENT" && capabilities.has("student.portal.view") ? "/dashboard/aula" : "/dashboard");
}
