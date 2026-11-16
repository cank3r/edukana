import { db } from "@/lib/db";
import type { EmailMessage } from "@/server/integrations/email";
import { institutionBaseUrl } from "./domain-policy";
import { EDUKANA_BLUE, ensureReadableOnWhite } from "./brand-color";
import { resolveWhiteLabel, safeBrandLogoUrl } from "./white-label";

export type EmailBrand = {
  name: string; logoUrl?: string | null; brandColor?: string | null; domain?: string | null;
  slug?: string; settings?: unknown; platformSubscription?: { plan: { features: unknown } } | null;
};
export const emailBrandSelect = {
  name: true, logoUrl: true, brandColor: true, domain: true, slug: true, settings: true,
  platformSubscription: { select: { plan: { select: { features: true } } } },
} as const;

export function loadEmailBrand(institutionId: string) {
  return db.institution.findUnique({ where: { id: institutionId }, select: emailBrandSelect });
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function emailHeader(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Legacy notifications can still be delivered without a configured application URL. */
export function emailBaseUrl(brand: EmailBrand | null): string | null {
  const configured = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const root = process.env.PLATFORM_ROOT_DOMAIN;
  if (!configured && !brand?.domain && !(root && brand?.slug)) return null;
  return institutionBaseUrl(brand ?? {});
}

/** Text stays available to old providers; only validated persisted/configured origins make links. */
export function brandedEmail(
  brand: EmailBrand | null,
  message: Pick<EmailMessage, "to" | "subject" | "text">,
): EmailMessage {
  const name = brand?.name || "Edukana";
  const color = ensureReadableOnWhite(brand?.brandColor ?? EDUKANA_BLUE).color;
  const base = emailBaseUrl(brand);
  const logo = safeBrandLogoUrl(brand?.logoUrl);
  const logoUrl = logo?.startsWith("/") ? (base ? `${base}${logo}` : null) : logo;
  const whiteLabel = !!brand && resolveWhiteLabel(brand.settings, brand.platformSubscription?.plan.features);
  const text = `${message.text}${whiteLabel ? "" : "\n\nHecho con Edukana"}`;
  const paragraphs = message.text.split("\n").map((line) => {
    // Only canonical application links become clickable; all other content is plain escaped text.
    const escaped = escapeEmailHtml(line);
    return base && line.startsWith(`${base}/`) && !/[\s<>"']/u.test(line)
      ? `<p><a href="${escaped}" style="color:${color}">${escaped}</a></p>`
      : `<p>${escaped || "&nbsp;"}</p>`;
  }).join("");
  return {
    ...message, subject: emailHeader(message.subject), text,
    fromName: brand ? `${emailHeader(name)} vía Edukana` : "Edukana",
    html: `<!doctype html><html lang="es"><body><main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border-top:6px solid ${color};padding:24px">`
      + (logoUrl ? `<img src="${escapeEmailHtml(logoUrl)}" alt="${escapeEmailHtml(name)}" width="120" />` : "")
      + `<h1 style="color:${color}">${escapeEmailHtml(name)}</h1>${paragraphs}`
      + (whiteLabel ? "" : "<footer><small>Hecho con Edukana</small></footer>") + "</main></body></html>",
  };
}
