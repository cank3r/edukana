"use server";

import { headers } from "next/headers";
import { registerIndependentTeacher } from "@/server/platform/independent";
import { clientIpFromHeaders } from "@/server/security/login-throttle";

export type IndependentSignupState = { ok: boolean; message: string; slug?: string };

/**
 * Formulario de `/ensenar`. Campos: `name`, `email`, `password`, `spaceName`.
 * Solo crea el espacio; el navegador inicia la sesión después con el mismo correo y contraseña.
 */
export async function registerIndependentTeacherAction(formData: FormData): Promise<IndependentSignupState> {
  try {
    const result = await registerIndependentTeacher(
      {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        spaceName: String(formData.get("spaceName") ?? ""),
      },
      clientIpFromHeaders(await headers()),
    );
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, message: "Tu espacio está listo. Entrando…", slug: result.slug };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("registerIndependentTeacherAction failed", { correlationId, error });
    return { ok: false, message: `No pudimos crear tu espacio. Intenta de nuevo en un momento. Código: ${correlationId}` };
  }
}
