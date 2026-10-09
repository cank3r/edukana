import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPaymentReceipt } from "@/server/finance/charges";
import { Receipt, ReceiptNotFound } from "../../../pagos/recibo/Receipt";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo de pago", robots: { index: false, follow: false } };

/**
 * Recibo para el estudiante (solo los suyos) y para el tutor con permiso de finanzas y vínculo activo
 * (solo los de su hijo). Lo decide `getPaymentReceipt` en el servidor.
 */
export default async function MiReciboPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { paymentId } = await params;
  const viewer = { id: user.id, institutionId: user.institutionId, role: user.role };
  const receipt = await getPaymentReceipt(viewer, paymentId);
  const back = user.role === "PARENT" && receipt?.student.id ? `/dashboard/mi-cuenta?estudiante=${encodeURIComponent(receipt.student.id)}` : "/dashboard/mi-cuenta";
  const backLabel = user.role === "PARENT" ? "Volver al estado de cuenta" : "Volver a mi cuenta";
  if (!receipt) return <ReceiptNotFound backHref={back} backLabel={backLabel} />;
  return <Receipt receipt={receipt} backHref={back} backLabel={backLabel} />;
}
