import { redirect } from "next/navigation";

/** Los recibos se abren desde el historial de pagos; esta dirección sola lleva a Cobros. */
export default function RecibosPage() {
  redirect("/dashboard/pagos");
}
