import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageFinance, getPaymentReceipt } from "@/server/finance/charges";
import { Receipt, ReceiptNotFound } from "../Receipt";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo de pago", robots: { index: false, follow: false } };

/** Recibo para quien gestiona cobros. El estudiante y el tutor ven el suyo desde «Mi estado de cuenta». */
export default async function PagoReciboPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { paymentId } = await params;
  const viewer = { id: user.id, institutionId: user.institutionId, role: user.role };
  if (!(await canManageFinance(viewer))) redirect(`/dashboard/mi-cuenta/recibo/${encodeURIComponent(paymentId)}`);

  const receipt = await getPaymentReceipt(viewer, paymentId);
  if (!receipt) return <ReceiptNotFound backHref="/dashboard/pagos" backLabel="Volver a Cobros" />;
  return <Receipt receipt={receipt} backHref="/dashboard/pagos" backLabel="Volver a Cobros" />;
}
