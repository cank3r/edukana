import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = { title: "Recuperar contraseña · Edukana" };

export default function RecoverPage() {
  return (
    <AuthCard title="¿Olvidaste tu contraseña?" intro="Escribe tu correo y te enviamos un enlace para crear una nueva. También sirve si es tu primera vez y aún no tienes contraseña.">
      <RecoverForm />
    </AuthCard>
  );
}
