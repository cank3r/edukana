import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { isIndependentSignupEnabled } from "@/server/platform/independent";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enseña en Edukana" };

/** Alta pública del docente independiente. Con `INDEPENDENT_SIGNUP_ENABLED` apagado responde 404. */
export default function TeachPage() {
  if (!isIndependentSignupEnabled()) notFound();
  return (
    <AuthCard
      title="Enseña tus cursos en Edukana"
      intro="Crea tu espacio en un minuto: arma tus cursos, véndelos con tu propia página y acompaña a tus estudiantes. No necesitas una institución."
    >
      <SignupForm />
    </AuthCard>
  );
}
