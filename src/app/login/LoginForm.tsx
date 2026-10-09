"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

/** Marca de la institución cuando se entra con `?institucion=<identificador>`. */
export type LoginBrand = { slug: string; name: string; logoUrl: string | null; color: string };

export function LoginScreen({ brand, showSetup = false }: { brand: LoginBrand | null; showSetup?: boolean }) {
  return <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--cloud)" }} />}><LoginForm brand={brand} showSetup={showSetup} /></Suspense>;
}

function LoginForm({ brand, showSetup }: { brand: LoginBrand | null; showSetup: boolean }) {
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
      ...(brand ? { institutionSlug: brand.slug } : {}),
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
    <div className="min-h-screen flex" style={{ background: "var(--cloud)", ...(brand ? { "--blue": brand.color } : {}) } as React.CSSProperties}>
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
          <p className="text-sm" style={{ color: "#B6C4E3" }}>
            Gestiona, enseña, comunica y crece desde una sola plataforma.
          </p>
        </div>

        <p className="text-xs" style={{ color: "#94A6CC" }}>
          © 2026 Edukana · Cerkana
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {brand && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border bg-white p-3" style={{ borderColor: brand.color, borderLeftWidth: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- el logo viene del almacenamiento de la institución. */}
              {brand.logoUrl && <img src={brand.logoUrl} alt={`Logo de ${brand.name}`} width={48} height={48} className="h-12 w-12 shrink-0 rounded object-contain" />}
              <p className="min-w-0 text-base font-semibold" style={{ color: "var(--navy)" }}>{brand.name}</p>
            </div>
          )}
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
            {brand ? `Ingresa a ${brand.name}` : "Ingresa a tu institución"}
          </p>

          <form method="post" action="/api/auth/callback/credentials" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--navy)" }}
              >
                Correo electrónico
              </label>
              <input
                id="login-email"
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
                htmlFor="login-password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--navy)" }}
              >
                Contraseña
              </label>
              <input
                id="login-password"
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
                role="alert"
                aria-live="polite"
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

          <p className="mt-4 text-center text-sm">
            <Link href="/recuperar" className="inline-flex min-h-11 items-center font-semibold underline" style={{ color: "var(--blue)" }}>¿Olvidaste tu contraseña o es tu primera vez?</Link>
          </p>

          {/* Solo mientras no exista ninguna institución: después, /setup ya no sirve. */}
          {showSetup && (
            <p className="mt-4 text-center text-xs" style={{ color: "#64748B" }}>
              ¿Base de datos nueva? <Link href="/setup" className="inline-flex min-h-11 items-center font-semibold underline" style={{ color: "var(--blue)" }}>Crear la primera institución</Link>
            </p>
          )}

          <p className="text-xs text-center mt-8" style={{ color: "#64748B" }}>
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
