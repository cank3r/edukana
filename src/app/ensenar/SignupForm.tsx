"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { AuthMessage, authButton, authInput } from "@/components/auth/AuthCard";
import { registerIndependentTeacherAction } from "@/server/actions/independent-signup";

const label = "block text-sm font-medium text-slate-900";
const hint = "mt-1 block text-xs font-normal text-slate-600";

/** Nombre, correo, contraseña y nombre del espacio. Al crear el espacio inicia la sesión y lleva al inicio. */
export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState<{ ok: boolean; message: string }>({ ok: false, message: "" });
  const [created, setCreated] = useState(false);
  const [pending, startTransition] = useTransition();
  const firstName = name.trim();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await registerIndependentTeacherAction(formData);
      setState(result);
      if (!result.ok || !result.slug) return;
      setCreated(true);
      const login = await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        institutionSlug: result.slug,
        redirect: false,
      });
      if (login?.error) {
        setState({ ok: false, message: "Tu espacio quedó creado, pero no pudimos iniciar tu sesión. Entra con tu correo y contraseña desde «Inicia sesión»." });
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className={label}>
        Tu nombre
        <input className={authInput} name="name" required minLength={3} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Ana Pérez" />
      </label>
      <label className={label}>
        Correo electrónico
        <input className={authInput} name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" placeholder="tu@correo.com" />
      </label>
      <label className={label}>
        Contraseña
        <input className={authInput} name="password" type="password" required maxLength={200} autoComplete="new-password" />
        <span className={hint}>Al menos 10 caracteres, con letras y números. Si ya tienes cuenta en Edukana, usa tu contraseña de siempre.</span>
      </label>
      <label className={label}>
        Nombre de tu espacio <span className="font-normal text-slate-500">(opcional)</span>
        <input className={authInput} name="spaceName" maxLength={160} placeholder={firstName ? `Cursos de ${firstName}` : "Cursos de tu nombre"} />
        <span className={hint}>Así lo verán tus estudiantes. Puedes cambiarlo después.</span>
      </label>
      <AuthMessage ok={state.ok} message={state.message} />
      <button className={authButton} type="submit" disabled={pending || created}>{pending ? "Creando tu espacio…" : created ? "Espacio creado" : "Crear mi espacio de docente"}</button>
      <p className="text-center text-sm text-slate-600">
        ¿Ya tienes cuenta? <Link className="font-medium text-blue-700 underline" href="/login">Inicia sesión</Link>
      </p>
    </form>
  );
}
