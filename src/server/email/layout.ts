import type { EmailMessage } from "@/server/integrations/email";
import {
  brandedEmail, emailBaseUrl, emailHeader, escapeEmailHtml as escape, type EmailBrand,
} from "@/server/platform/branded-email";
import { EDUKANA_BLUE, ensureReadableOnWhite } from "@/server/platform/brand-color";
import { resolveWhiteLabel, safeBrandLogoUrl } from "@/server/platform/white-label";
import { applicationEmailLink } from "./links";

export type EmailAction = { label: string; href: string; origin?: "platform" };
export type EmailPresentation = {
  category: string; heading: string; preheader: string; name?: string;
  paragraphs?: readonly string[]; summary?: ReadonlyArray<{ label: string; value: string }>;
  callout?: { title: string; text: string }; action?: EmailAction; secondary?: EmailAction;
  secondaryHelp?: string; note?: string; preferences?: boolean;
};
export type TransactionalMessage = Pick<EmailMessage, "to" | "subject" | "text">;
export const EMAIL_LOGO_PATH = "/logos/edukana_email.png";
// Official PNG pinned to a public commit: email image proxies cannot authenticate to protected previews.
export const EDUKANA_EMAIL_LOGO_URL =
  "https://raw.githubusercontent.com/cank3r/edukana/673bb72eec620ddf6a3290b8f394b70ef11e23e9/public/logos/edukana_email.png";
const NAVY = "#101B3F";
const CLOUD = "#F4F7FC";
const font = "font-family:Arial,Helvetica,sans-serif;";
const wrap = "overflow-wrap:anywhere;word-break:break-word;";
const table = 'role="presentation" border="0" cellpadding="0" cellspacing="0"';

function image(url: string, alt: string, width: number, height?: number) {
  return `<img src="${escape(url)}" alt="${escape(alt)}" width="${width}"${height ? ` height="${height}"` : ""}`
    + ` border="0" style="display:block;border:0;max-width:100%;height:auto;${font}color:${NAVY};font-size:18px;" />`;
}

function button(url: string, label: string, color: string) {
  const href = escape(url);
  const text = escape(label);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
href="${href}" style="height:48px;v-text-anchor:middle;width:248px;" arcsize="12%" stroke="f" fillcolor="${color}">
<w:anchorlock/><center style="${font}color:#FFFFFF;font-size:16px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" style="${font}display:inline-block;box-sizing:border-box;max-width:100%;
background-color:${color};border:1px solid ${color};border-radius:6px;color:#FFFFFF;font-size:16px;font-weight:bold;
line-height:22px;text-align:center;text-decoration:none;padding:12px 18px;mso-hide:all;">${text}</a><!--<![endif]-->`;
}

/** Presentation only. No recipients, tokens, preferences, queries or delivery side effects. */
export function transactionalEmail(brand: EmailBrand | null, message: TransactionalMessage, view: EmailPresentation): EmailMessage {
  const original = brandedEmail(brand, message);
  const base = emailBaseUrl(brand);
  const whiteLabel = !!brand && resolveWhiteLabel(brand.settings, brand.platformSubscription?.plan.features);
  const color = ensureReadableOnWhite(brand?.brandColor ?? EDUKANA_BLUE).color;
  const institution = escape(brand?.name || "Edukana");
  const logo = safeBrandLogoUrl(brand?.logoUrl);
  const custom = logo?.startsWith("/") ? applicationEmailLink(base, logo) : logo;
  const resolveAction = (action?: EmailAction) => action
    ? applicationEmailLink(action.origin === "platform" ? emailBaseUrl(null) : base, action.href) : null;
  const action = resolveAction(view.action);
  const secondary = resolveAction(view.secondary);
  const preferences = view.preferences ? applicationEmailLink(base, "/dashboard/notificaciones/preferencias") : null;
  const branding = whiteLabel ? "" : image(EDUKANA_EMAIL_LOGO_URL, "Edukana", 156, 44);
  const customLogo = custom ? `<div style="padding-top:${whiteLabel ? 0 : 16}px;">${image(custom, brand!.name, 100)}</div>` : "";
  const summary = view.summary?.length ? `<table ${table} width="100%" bgcolor="${CLOUD}"
style="width:100%;table-layout:fixed;background-color:${CLOUD};border-radius:8px;">
<tr><td height="18" style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>
${view.summary.map((item) => `<tr><td style="padding:0 18px 16px;${font}${wrap}">
<p style="margin:0 0 4px;color:${NAVY};font-size:12px;line-height:18px;font-weight:bold;">${escape(item.label)}</p>
<p style="margin:0;color:${NAVY};font-size:17px;line-height:25px;">${escape(item.value)}</p></td></tr>`).join("")}</table>` : "";
  const paragraphs = (view.paragraphs ?? []).flatMap((line) => line.split(/\n+/u)).filter((line) => line.trim())
    .map((line) => `<p style="margin:0 0 12px;${font}${wrap}color:${NAVY};font-size:16px;line-height:25px;">${escape(line)}</p>`).join("");
  const callout = view.callout ? `<table ${table} width="100%" bgcolor="${CLOUD}"
style="width:100%;table-layout:fixed;background-color:${CLOUD};border-radius:8px;"><tr>
<td style="padding:16px 18px;${font}${wrap}"><p style="margin:0 0 5px;color:${NAVY};font-size:15px;line-height:22px;font-weight:bold;">${escape(view.callout.title)}</p>
<p style="margin:0;color:${NAVY};font-size:14px;line-height:22px;">${escape(view.callout.text)}</p></td></tr></table>` : "";
  const html = `<!doctype html>
<html lang="es" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="x-apple-disable-message-reformatting" />
<title>${escape(view.heading)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head><body lang="es" bgcolor="${CLOUD}" style="margin:0;padding:0;width:100%;background-color:${CLOUD};-webkit-text-size-adjust:100%;">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(view.preheader)}</div>
<table ${table} width="100%" bgcolor="${CLOUD}" style="width:100%;background-color:${CLOUD};table-layout:fixed;">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table ${table} width="600" align="center"><tr><td><![endif]-->
<table ${table} width="100%" bgcolor="#FFFFFF"
style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-top:4px solid ${color};border-radius:12px;table-layout:fixed;">
<tr><td style="padding:26px 24px 22px;${font}${wrap}">${branding}${customLogo}
<p style="margin:${branding || customLogo ? 16 : 0}px 0 0;color:${NAVY};font-size:15px;line-height:22px;font-weight:bold;">${institution}</p></td></tr>
<tr><td style="padding:0 24px;"><table ${table} width="100%"><tr><td style="border-top:1px solid #E2E8F0;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px 24px 18px;${font}${wrap}">
<p style="margin:0 0 10px;color:${color};font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">${escape(view.category.toUpperCase())}</p>
<h1 style="margin:0;color:${NAVY};${font}font-size:28px;line-height:35px;font-weight:bold;">${escape(view.heading)}</h1>
${view.name ? `<p style="margin:20px 0 0;color:${NAVY};font-size:16px;line-height:25px;">Hola, ${escape(view.name)}:</p>` : ""}</td></tr>
${summary ? `<tr><td style="padding:0 24px 20px;">${summary}</td></tr>` : ""}
${paragraphs ? `<tr><td style="padding:0 24px 10px;">${paragraphs}</td></tr>` : ""}
${callout ? `<tr><td style="padding:0 24px 22px;">${callout}</td></tr>` : ""}
<tr><td style="padding:0 24px 24px;${font}${wrap}">
${action ? button(action, view.action!.label, color) : view.action
    ? `<p style="margin:0;color:${NAVY};font-size:16px;line-height:24px;">Entra a la plataforma de ${institution} para continuar.</p>` : ""}
${view.note ? `<p style="margin:16px 0 0;color:${NAVY};font-size:13px;line-height:20px;">${escape(view.note)}</p>` : ""}
${view.secondaryHelp ? `<p style="margin:18px 0 0;color:${NAVY};font-size:14px;line-height:22px;">${escape(view.secondaryHelp)}</p>` : ""}
${secondary ? `<a href="${escape(secondary)}" style="display:inline-block;padding:11px 0;color:${NAVY};font-size:14px;line-height:22px;text-decoration:underline;">${escape(view.secondary!.label)}</a>` : ""}
</td></tr>
<tr><td bgcolor="${CLOUD}" style="padding:18px 24px;background-color:${CLOUD};border-top:1px solid #E2E8F0;${font}${wrap}">
<p style="margin:0;color:${NAVY};font-size:12px;line-height:19px;">${view.preferences
    ? `Recibes este correo porque eres parte de ${institution}.` : `Este mensaje corresponde a tu acceso o solicitud en ${institution}.`}</p>
${preferences ? `<a href="${escape(preferences)}" style="display:inline-block;padding:11px 0;color:${NAVY};font-size:13px;line-height:22px;text-decoration:underline;">Elegir qué correos recibo</a>` : view.preferences
    ? `<p style="margin:8px 0 0;color:${NAVY};font-size:12px;line-height:19px;">Puedes elegir qué correos recibes en Notificaciones.</p>` : ""}
${whiteLabel ? "" : `<p style="margin:12px 0 0;color:${NAVY};font-size:12px;line-height:18px;">Hecho con Edukana</p>`}
</td></tr></table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { ...original, ...(whiteLabel && brand ? { fromName: emailHeader(brand.name) } : {}), html };
}
