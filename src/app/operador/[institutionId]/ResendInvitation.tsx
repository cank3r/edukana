"use client";

import { useActionState } from "react";
import { resendAdminInvitationAction, type OperatorActionState } from "@/server/actions/operator";

const empty: OperatorActionState = { ok: false, message: "" };

export function ResendInvitation({ institutionId, adminUserId }: { institutionId: string; adminUserId: string }) {
  const [state, action, pending] = useActionState(resendAdminInvitationAction, empty);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="adminUserId" value={adminUserId} />
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60 sm:w-auto">
        {pending ? "Enviando…" : "Reenviar invitación al administrador"}
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </form>
  );
}
