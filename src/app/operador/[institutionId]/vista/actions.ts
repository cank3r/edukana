"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { startSupportView, stopSupportView, SUPPORT_COOKIE } from "@/server/platform/support";

export type SupportState = { message: string };
export async function enterSupportAction(_state: SupportState, formData: FormData): Promise<SupportState> {
  const email = await getOperatorEmail();
  if (!email) return { message: "No tienes permiso para hacer esto." };
  const institutionId = String(formData.get("institutionId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!institutionId || institutionId.length > 200 || confirmation.length > 160) return { message: "Revisa los datos." };
  const jar = await cookies();
  // Close any prior view before issuing another ticket; no domain data is changed.
  const result = await startSupportView(email, institutionId, confirmation);
  if (!result.ok) return { message: result.message };
  await stopSupportView(email, jar.get(SUPPORT_COOKIE)?.value);
  jar.set(SUPPORT_COOKIE, result.ticket, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/operador",
    // Retain an expired opaque ticket until browser close so a subsequent request can audit its expiry.
    // Server-side expiry, never cookie lifetime, is the access boundary.
  });
  redirect(`/operador/${encodeURIComponent(institutionId)}/vista`);
}

export async function exitSupportAction(): Promise<void> {
  const email = await getOperatorEmail();
  if (!email) throw new Error("No tienes permiso para hacer esto.");
  const jar = await cookies();
  const institutionId = await stopSupportView(email, jar.get(SUPPORT_COOKIE)?.value);
  jar.set(SUPPORT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/operador", maxAge: 0 });
  redirect(institutionId ? `/operador/${encodeURIComponent(institutionId)}` : "/operador");
}
