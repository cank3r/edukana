"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  closeHref: string;
  returnHref: string | null;
  children: ReactNode;
};

function visible(element: HTMLElement) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
}

function tabStops(dialog: HTMLDialogElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
  )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && visible(element));
}

function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const stops = tabStops(dialog);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = document.activeElement;
  if (!first) {
    event.preventDefault();
    dialog.focus();
  } else if (!dialog.contains(active) || active === dialog || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function cellLinks(dialog: HTMLDialogElement, href: string) {
  return Array.from(dialog.closest("main")?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])
    .filter((link) => link.getAttribute("href") === href);
}

function restoreCellFocus(dialog: HTMLDialogElement, href: string, summary: HTMLElement | null) {
  const links = cellLinks(dialog, href);
  let target = links.find(visible);
  if (!target) {
    for (const link of links) {
      const details = link.closest("details");
      const trigger = details?.querySelector("summary");
      // The route update closes the mobile details; reopen only the card containing this cell.
      if (details && trigger && visible(trigger)) {
        details.open = true;
        if (visible(link)) { target = link; break; }
      }
    }
  }
  if (target) target.focus({ preventScroll: true });
  else if (summary?.isConnected && visible(summary)) summary.focus({ preventScroll: true });
  else {
    const heading = dialog.closest("main")?.querySelector("h1");
    if (!heading) return;
    const previous = heading.getAttribute("tabindex");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    if (previous === null) heading.removeAttribute("tabindex");
    else heading.setAttribute("tabindex", previous);
  }
}

/** Keep this boundary mounted when the query closes, so focus survives the server page update. */
export function GradeDialog({ open, closeHref, returnHref, children }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnTarget = useRef<{ href: string; summary: HTMLElement | null } | null>(null);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (returnHref) {
        const trigger = cellLinks(dialog, returnHref).find(visible);
        returnTarget.current = { href: returnHref, summary: trigger?.closest("details")?.querySelector("summary") ?? null };
      }
      wasOpen.current = true;
      if (!dialog.open) dialog.showModal();
      const initial = dialog.querySelector<HTMLInputElement>('input[name="score"]') ?? tabStops(dialog)[0] ?? dialog;
      initial.focus({ preventScroll: true });
      return () => { if (dialog.open) dialog.close(); };
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = returnTarget.current;
    const frame = requestAnimationFrame(() => {
      // Do not steal focus after navigating away or reopening another cell.
      if (!target || location.pathname + location.search !== closeHref) return;
      if (new URL(target.href, location.origin).pathname !== location.pathname) return;
      restoreCellFocus(dialog, target.href, target.summary);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, closeHref, returnHref]);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={open ? "titulo-editor" : undefined}
      onKeyDown={keepFocusInside}
      onCancel={(event) => {
        event.preventDefault();
        router.push(closeHref, { scroll: false });
      }}
      className={[
        "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0",
        "backdrop:bg-slate-900/50",
      ].join(" ")}
    >
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
          {children}
        </section>
      </div>
    </dialog>
  );
}
