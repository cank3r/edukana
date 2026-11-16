"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { announcementDismissalKey } from "@/server/platform/announcement-policy";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("edukana:platform-dismiss", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("edukana:platform-dismiss", callback);
  };
};
export function DismissiblePlatformAnnouncement({ personId, announcement }: {
  personId: string;
  announcement: { id: string; title: string; body: string; level: "INFO" | "WARNING"; endsAt: string | null };
}) {
  const key = announcementDismissalKey(personId, announcement.id);
  const stored = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) === "closed"; } catch { return false; }
  }, () => false);
  const [closed, setClosed] = useState(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!announcement.endsAt) return;
    const end = new Date(announcement.endsAt).getTime();
    const timer = window.setInterval(() => setExpired(Date.now() >= end), 1000);
    return () => window.clearInterval(timer);
  }, [announcement.endsAt]);
  if (stored || closed || expired) return null;
  return <aside aria-label="Aviso de Edukana" className={`rounded-lg border p-4 ${
    announcement.level === "WARNING" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"
  }`}>
    <div className="flex items-start justify-between gap-3">
      <h2 className="font-semibold break-words">{announcement.title}</h2>
      <button type="button" aria-label={`Cerrar aviso: ${announcement.title}`} className="min-h-11 min-w-11 shrink-0 underline"
        onClick={() => {
          setClosed(true);
          try { localStorage.setItem(key, "closed"); } catch { /* Private mode still closes this visit. */ }
          window.dispatchEvent(new Event("edukana:platform-dismiss"));
        }}>Cerrar</button>
    </div>
    <p className="whitespace-pre-wrap break-words text-sm">{announcement.body}</p>
  </aside>;
}
