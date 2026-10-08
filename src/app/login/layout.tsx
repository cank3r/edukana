import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Una sesión vigente no necesita el formulario. Se decide aquí, con la sesión
// revalidada contra la base, y no en el proxy, que solo ve el token.
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return children;
}
