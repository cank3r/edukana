import type { EmailMessage } from "@/server/integrations/email";
import { brandedEmail, emailBaseUrl, escapeEmailHtml as escape, type EmailBrand } from "@/server/platform/branded-email";
import { EDUKANA_BLUE, ensureReadableOnWhite } from "@/server/platform/brand-color";
import { resolveWhiteLabel, safeBrandLogoUrl } from "@/server/platform/white-label";

type Notice = { kind: string; title: string; body: string | null; href: string | null; name: string };
const NAVY = "#101B3F";
const CLOUD = "#F4F7FC";
export const EMAIL_LOGO_PATH = "/logos/edukana_email.png";
const font = "font-family:Arial,Helvetica,sans-serif;";
const wrap = "overflow-wrap:anywhere;word-break:break-word;";
const table = 'role="presentation" border="0" cellpadding="0" cellspacing="0"';

const labels: Record<string, [string, string]> = {
  grade: ["Calificaciones", "Ver nota y comentarios"],
  announcement: ["Avisos", "Leer aviso"],
  assignment: ["Tareas", "Ver tarea"],
  submission: ["Entregas", "Revisar entrega"],
  exam: ["Exámenes", "Ver examen"],
  live_class: ["Clases en vivo", "Ver clase"],
  certificate: ["Certificados", "Ver certificado"],
  charge: ["Estado de cuenta", "Ver estado de cuenta"],
};

/** Only validated application origins and internal paths can become HTML links. */
function applicationLink(base: string | null, path: string | null): string | null {
  if (!base || !path?.startsWith("/") || path.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/u.test(path)) return null;
  try {
    const origin = new URL(base);
    const url = new URL(path, origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) return null;
    if (url.origin !== origin.origin || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Recognize only the existing grade event copy; unfamiliar/truncated titles keep their original content. */
function presentation(notice: Notice) {
  const grade = notice.kind === "grade" && /^(Ya tienes nota en|Se corrigió tu nota en) «(.+)»$/u.exec(notice.title);
  const course = grade && /^Curso: (.+)\. Abre la tarea para ver tu nota y los comentarios\.$/u.exec(notice.body ?? "");
  return {
    heading: grade ? (grade[1] === "Se corrigió tu nota en" ? "Tu nota fue actualizada" : "Tu tarea ya fue calificada") : notice.title,
    task: grade ? grade[2] : null,
    course: course ? course[1] : null,
    body: course ? "Ya puedes consultar tu nota y los comentarios de tu docente." : notice.body,
  };
}

function image(url: string, alt: string, width: number, height?: number) {
  return `<img src="${escape(url)}" alt="${escape(alt)}" width="${width}"${height ? ` height="${height}"` : ""}`
    + ` border="0" style="display:block;border:0;max-width:100%;height:auto;${font}color:${NAVY};font-size:18px;" />`;
}

function button(url: string, label: string, color: string) {
  const href = escape(url);
  const text = escape(label);
  // VML gives classic Outlook a fully clickable 48px button. Other clients use the ordinary accessible link.
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
href="${href}" style="height:48px;v-text-anchor:middle;width:248px;" arcsize="12%" stroke="f" fillcolor="${color}">
<w:anchorlock/><center style="${font}color:#FFFFFF;font-size:16px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" style="${font}display:inline-block;box-sizing:border-box;max-width:100%;
background-color:${color};border:1px solid ${color};border-radius:6px;color:#FFFFFF;font-size:16px;font-weight:bold;
line-height:22px;text-align:center;text-decoration:none;padding:12px 18px;mso-hide:all;">${text}</a><!--<![endif]-->`;
}

/** Presentation only: delivery, preferences, sender, subject and plain text remain in their existing paths. */
export function notificationEmail(
  brand: EmailBrand,
  message: Pick<EmailMessage, "to" | "subject" | "text">,
  notice: Notice,
): EmailMessage {
  const original = brandedEmail(brand, message);
  const base = emailBaseUrl(brand);
  const action = applicationLink(base, notice.href);
  const preferences = applicationLink(base, "/dashboard/notificaciones/preferencias");
  const logoBase = applicationLink(base, EMAIL_LOGO_PATH);
  const whiteLabel = resolveWhiteLabel(brand.settings, brand.platformSubscription?.plan.features);
  const color = ensureReadableOnWhite(brand.brandColor ?? EDUKANA_BLUE).color;
  const logo = safeBrandLogoUrl(brand.logoUrl);
  const institutionLogo = logo?.startsWith("/") ? applicationLink(base, logo) : logo;
  const [label, cta] = labels[notice.kind] ?? ["Notificación", "Ver notificación"];
  const content = presentation(notice);
  const institution = escape(brand.name);
  const summaryRow = (key: string, value: string) => `<tr><td style="padding:0 18px 16px;${font}${wrap}">
<p style="margin:0 0 4px;color:${NAVY};font-size:12px;line-height:18px;font-weight:bold;">${key}</p>
<p style="margin:0;color:${NAVY};font-size:17px;line-height:25px;">${escape(value)}</p></td></tr>`;
  const summary = content.task ? `<table ${table} width="100%" bgcolor="${CLOUD}"
style="width:100%;table-layout:fixed;background-color:${CLOUD};border-radius:8px;">
<tr><td height="18" style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>
${summaryRow("Tarea", content.task)}${content.course ? summaryRow("Curso", content.course) : ""}</table>` : "";
  const paragraphs = (content.body ?? "").split(/\n+/u).filter((line) => line.trim())
    .map((line) => `<p style="margin:0 0 12px;${font}${wrap}color:${NAVY};font-size:16px;line-height:25px;">${escape(line)}</p>`).join("");
  const branding = !whiteLabel
    ? (logoBase ? image(logoBase, "Edukana", 156, 44) : `<p style="margin:0;${font}color:${NAVY};font-size:24px;font-weight:bold;">Edukana</p>`)
    : "";
  const customLogo = institutionLogo ? `<div style="padding-top:${whiteLabel ? 0 : 16}px;">${image(institutionLogo, brand.name, 100)}</div>` : "";
  const html = `<!doctype html>
<html lang="es" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="x-apple-disable-message-reformatting" />
<title>${escape(content.heading)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head><body bgcolor="${CLOUD}" style="margin:0;padding:0;width:100%;background-color:${CLOUD};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${escape(notice.kind === "grade" ? `${content.heading}. Consulta los detalles en la plataforma.` : notice.title)}</div>
<table ${table} width="100%" bgcolor="${CLOUD}" style="width:100%;background-color:${CLOUD};table-layout:fixed;">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table ${table} width="600" align="center"><tr><td><![endif]-->
<table ${table} width="100%" bgcolor="#FFFFFF"
style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-top:4px solid ${color};border-radius:12px;table-layout:fixed;">
<tr><td style="padding:28px 24px 24px;${font}${wrap}">${branding}${customLogo}
<p style="margin:${branding || customLogo ? 16 : 0}px 0 0;color:${NAVY};font-size:15px;font-weight:bold;line-height:22px;">${institution}</p></td></tr>
<tr><td style="padding:0 24px;"><table ${table} width="100%"><tr>
<td style="border-top:1px solid #E2E8F0;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px 24px 18px;${font}${wrap}">
<p style="margin:0 0 12px;color:${color};font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">${escape(label.toUpperCase())}</p>
<h1 style="margin:0;color:${NAVY};${font}font-size:28px;line-height:35px;font-weight:bold;">${escape(content.heading)}</h1>
<p style="margin:18px 0 0;color:${NAVY};font-size:16px;line-height:24px;">Hola, ${escape(notice.name)}:</p></td></tr>
${summary ? `<tr><td style="padding:0 24px 20px;">${summary}</td></tr>` : ""}
<tr><td style="padding:0 24px 12px;">${paragraphs}</td></tr>
<tr><td style="padding:0 24px 28px;${font}${wrap}">
${action ? button(action, cta, color) : `<p style="margin:0;color:${NAVY};font-size:16px;line-height:24px;">Entra a la plataforma de ${institution} para verlo.</p>`}
${notice.kind === "grade" ? `<p style="margin:16px 0 0;color:${NAVY};font-size:13px;line-height:20px;">Tu nota y los comentarios se consultan dentro de la plataforma.</p>` : ""}
</td></tr>
<tr><td bgcolor="${CLOUD}" style="padding:20px 24px;background-color:${CLOUD};border-top:1px solid #E2E8F0;${font}${wrap}">
<p style="margin:0 0 8px;color:${NAVY};font-size:12px;line-height:19px;">Recibes este correo porque eres parte de ${institution}.</p>
${preferences ? `<a href="${escape(preferences)}" style="display:inline-block;padding:11px 0;color:${color};font-size:13px;line-height:22px;text-decoration:underline;">Elegir qué correos recibo</a>`
    : `<p style="margin:0;color:${NAVY};font-size:12px;line-height:19px;">Puedes elegir qué correos recibes en Notificaciones.</p>`}
${whiteLabel ? "" : `<p style="margin:14px 0 0;color:${NAVY};font-size:12px;line-height:18px;">Hecho con Edukana</p>`}
</td></tr></table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { ...original, html };
}
