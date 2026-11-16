"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { exitSupportAction } from "./actions";

export function SupportFrame({ name, expiresAt, children }: { name: string; expiresAt: string; children: ReactNode }) {
  const router = useRouter();
  const deadline = new Date(expiresAt).getTime();
  const [expired, setExpired] = useState(() => Date.now() >= deadline);
  useEffect(() => {
    const check = () => {
      if (Date.now() >= deadline) { setExpired(true); router.refresh(); }
    };
    const timer = setTimeout(check, Math.max(0, deadline - Date.now()));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [deadline, router]);
  return <>
    <aside className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 p-4"
      aria-label="Modo soporte">
      <p className="min-w-0 break-words font-semibold text-amber-950">Estás viendo {name} como soporte. Solo lectura.</p>
      <form action={exitSupportAction}><button className="min-h-11 rounded-lg border border-amber-500 bg-white px-4 py-2 font-semibold text-slate-950">Salir</button></form>
    </aside>
    {expired ? <p role="status" className="p-4">La vista de soporte terminó. Vuelve a la ficha para abrirla de nuevo.</p> : children}
  </>;
}
