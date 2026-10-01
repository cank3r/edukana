"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--cloud)" }} />}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push(callbackUrl);
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--cloud)" }}>
      {/* Panel izquierdo — branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: "var(--navy)" }}
      >
        <div>
          {/* Logo fondo oscuro */}
          <Image
            src="/logos/edukana_horizontal_color_fondo_oscuro.svg"
            alt="Edukana"
            width={180}
            height={48}
            priority
          />
        </div>

        <div>
          <p
            className="text-4xl font-bold leading-tight mb-4"
            style={{ color: "white" }}
          >
            La educación
            <br />
            evoluciona.
            <br />
            <span style={{ color: "var(--cyan)" }}>Tú también.</span>
          </p>
          <p className="text-sm" style={{ color: "#6B7DA8" }}>
            Gestiona, enseña, comunica y crece desde una sola plataforma.
          </p>
        </div>

        <p className="text-xs" style={{ color: "#3A4A6B" }}>
          © 2026 Edukana · Cerkana
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo móvil */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Image
              src="/logos/edukana_horizontal_color.svg"
              alt="Edukana"
              width={160}
              height={42}
              priority
            />
          </div>

          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--navy)" }}
          >
            Bienvenido
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--gray)" }}>
            Ingresa a tu institución
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--navy)" }}
              >
                Correo electrónico
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="tu@institucion.edu"
                className="w-full px-4 py-2.5 rounded-lg text-sm border outline-none transition-all"
                style={{
                  background: "white",
                  border: errors.email ? "1.5px solid var(--coral)" : "1.5px solid #E2E8F0",
                  color: "var(--navy)",
                }}
                onFocus={(e) => {
                  if (!errors.email) e.target.style.border = "1.5px solid var(--blue)";
                }}
                onBlur={(e) => {
                  if (!errors.email) e.target.style.border = "1.5px solid #E2E8F0";
                }}
              />
              {errors.email && (
                <p className="text-xs mt-1" style={{ color: "var(--coral)" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--navy)" }}
              >
                Contraseña
              </label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg text-sm border outline-none transition-all"
                style={{
                  background: "white",
                  border: errors.password ? "1.5px solid var(--coral)" : "1.5px solid #E2E8F0",
                  color: "var(--navy)",
                }}
                onFocus={(e) => {
                  if (!errors.password) e.target.style.border = "1.5px solid var(--blue)";
                }}
                onBlur={(e) => {
                  if (!errors.password) e.target.style.border = "1.5px solid #E2E8F0";
                }}
              />
              {errors.password && (
                <p className="text-xs mt-1" style={{ color: "var(--coral)" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm"
                style={{
                  background: "var(--coral-light)",
                  color: "#DC2626",
                  border: "1px solid #FECACA",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: loading ? "#6B7DB8" : "var(--blue)" }}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <p className="text-xs text-center mt-8" style={{ color: "#9CA3AF" }}>
            ¿Problemas para ingresar?{" "}
            <a
              href="mailto:info@cerkana.site"
              className="underline"
              style={{ color: "var(--blue)" }}
            >
              Escríbenos
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
