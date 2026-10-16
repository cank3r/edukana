import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = { title: "Recuperar contraseña · Edukana" };

export default function RecoverPage() {
  return (
    <AuthCard title="¿Olvidaste tu contraseña?" intro="Escribe tu correo para solicitar un enlace y crear una nueva contraseña. También sirve si es tu primera vez y aún no tienes contraseña.">
      <RecoverForm />
    </AuthCard>
  );
}
