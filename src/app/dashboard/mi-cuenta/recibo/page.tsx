import { redirect } from "next/navigation";

/** Los recibos se abren desde el historial de pagos; esta dirección sola lleva al estado de cuenta. */
export default function MisRecibosPage() {
  redirect("/dashboard/mi-cuenta");
}
