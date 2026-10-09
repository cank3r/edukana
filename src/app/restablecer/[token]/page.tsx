import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetForm } from "./ResetForm";

// El enlace es secreto: no debe viajar a otros sitios en la cabecera Referer ni quedar indexado.
export const metadata: Metadata = { title: "Crear contraseña · Edukana", referrer: "no-referrer", robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthCard title="Crea tu contraseña" intro="Elige una contraseña que solo tú conozcas. La usarás con tu correo para entrar a Edukana.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
