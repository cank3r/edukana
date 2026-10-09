"use client";

import { useEffect, useState } from "react";

const EVENT = "edukana:avisos-mensaje";

/** Avisa a la pantalla de avisos que una acción terminó bien; el mensaje anterior se reemplaza. */
export function showAnnouncementMessage(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** Mensaje de éxito arriba de la lista de avisos. Sobrevive a que el aviso borrado desaparezca. */
export function AnnouncementFlash() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const listener = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);
  if (!message) return null;
  return <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">{message}</p>;
}
