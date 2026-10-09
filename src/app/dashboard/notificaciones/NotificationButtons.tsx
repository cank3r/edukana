"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que se desactiva y cambia su texto mientras el formulario se procesa. */
export function PendingButton({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
