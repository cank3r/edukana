"use server";

import { getRequestInstitution } from "@/server/platform/domains";
import { headers } from "next/headers";
import { z } from "zod";
import { requestPasswordReset, resetPasswordWithToken } from "@/server/password-reset";
import { clientIpFromHeaders } from "@/server/security/login-throttle";
import { reportPasswordResetFailure, type PasswordResetStage } from "@/server/security/password-reset-observability";

export type PasswordResetState = { ok: boolean; message: string };

const REQUEST_MESSAGE = "Solicitud recibida. Si podemos procesarla, recibirás un enlace para cambiar tu contraseña. "
  + "Si no llega, inténtalo más tarde.";

/** Formulario "Olvidé mi contraseña". Campo: `email`. La respuesta es la misma exista o no la cuenta. */
export async function requestPasswordResetAction(_state: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const email = z.string().trim().toLowerCase().email().max(200).safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Escribe un correo válido." };
  let stage: PasswordResetStage = "request_context";
  try {
    const ip = clientIpFromHeaders(await headers());
    stage = "host_resolution";
    const institutionId = (await getRequestInstitution())?.id;
    stage = "request";
    // Do not expose the internal outcome: acceptance by a provider is not confirmed delivery.
    await requestPasswordReset({
      email: email.data, ip, institutionId,
    });
  } catch (error) {
    reportPasswordResetFailure(stage, error);
  }
  return { ok: true, message: REQUEST_MESSAGE };
}

/** Formulario del enlace. Campos: `token`, `password`, `confirmPassword`. */
export async function resetPasswordAction(_state: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) return { ok: false, message: "Las contraseñas no coinciden." };
  try {
    const result = await resetPasswordWithToken({ token, password });
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." };
  } catch (error) {
    const { correlationId } = reportPasswordResetFailure("password_update", error);
    return { ok: false, message: `No se pudo cambiar la contraseña. Intenta de nuevo. Código: ${correlationId}` };
  }
}
