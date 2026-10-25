import type { ShownStatus } from "@/server/finance/money";

export const STATUS_LABEL: Record<ShownStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-slate-100 text-slate-800" },
  PARTIAL: { label: "Pago parcial", className: "bg-blue-50 text-blue-800" },
  OVERDUE: { label: "Vencido", className: "bg-red-50 text-red-800" },
  PAID: { label: "Pagado", className: "bg-emerald-50 text-emerald-800" },
  CANCELLED: { label: "Anulado", className: "bg-slate-200 text-slate-700" },
};

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

/** «15 oct 2026» a partir de `AAAA-MM-DD`; el día se lee tal cual, sin moverlo de zona horaria. */
export function formatDateKey(key: string | null): string {
  if (!key) return "";
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
