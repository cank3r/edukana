import { randomUUID } from "node:crypto";

export type PasswordResetStage =
  | "request_context" | "host_resolution" | "request"
  | "rate_limit_check" | "attempt_record" | "identity_lookup" | "membership_lookup"
  | "branding_lookup" | "token_create" | "provider_setup" | "message_build" | "provider_send"
  | "password_update";

/** Only fixed diagnostic codes leave this boundary: never serialize the exception or request. */
export function reportPasswordResetFailure(stage: PasswordResetStage, error: unknown) {
  let databaseCode: string | undefined;
  let authConfiguration = false;
  // Exceptions can contain throwing accessors/proxies. Never stringify or enumerate them.
  try {
    if (error instanceof Error) {
      const candidate = "code" in error ? error.code : undefined;
      if (typeof candidate === "string" && /^P\d{4}$/.test(candidate)) databaseCode = candidate;
      authConfiguration = (stage === "request" || stage === "rate_limit_check")
        && error.message === "AUTH_SECRET es obligatorio para el límite de intentos.";
    }
  } catch { /* An unreadable exception receives the fixed fallback code. */ }
  const safeStage = stages.has(stage) ? stage : "request";
  const code = databaseCode ? "DATABASE_ERROR"
    : authConfiguration ? "AUTH_CONFIGURATION"
    : safeStage === "provider_setup" ? "MAIL_CONFIGURATION"
    : safeStage === "message_build" ? "MESSAGE_CONFIGURATION"
    : safeStage === "provider_send" ? "MAIL_PROVIDER"
    : "UNEXPECTED_ERROR";
  let correlationId: string = "unavailable";
  try { correlationId = randomUUID(); } catch { /* Diagnostics must not change the operation's result. */ }
  const diagnostic = Object.freeze({ correlationId, stage: safeStage, code, ...(databaseCode ? { databaseCode } : {}) });
  try { console.error("password_reset_failure", diagnostic); } catch { /* Never log the logger failure or retry. */ }
  return diagnostic;
}

const stages = new Set<PasswordResetStage>([
  "request_context", "host_resolution", "request", "rate_limit_check", "attempt_record", "identity_lookup",
  "membership_lookup", "branding_lookup", "token_create", "provider_setup", "message_build", "provider_send", "password_update",
]);
