import { redirect } from "next/navigation";

/** Las migas de pan de una ficha enlazan aquí: la lista de personas vive en /dashboard/gestion. */
export default function PersonasIndexPage() {
  redirect("/dashboard/gestion");
}
