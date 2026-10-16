import { emailBaseUrl, type EmailBrand } from "@/server/platform/branded-email";
import { resolveWhiteLabel } from "@/server/platform/white-label";
import { transactionalEmail, type TransactionalMessage } from "./layout";
import { applicationEmailLink } from "./links";

type AccessInput = { name: string; href: string; days: number; existing: boolean };

export function invitationEmail(brand: EmailBrand, message: TransactionalMessage, input: AccessInput) {
  const whiteLabel = resolveWhiteLabel(brand.settings, brand.platformSubscription?.plan.features);
  const recovery = applicationEmailLink(emailBaseUrl(brand), "/recuperar");
  // Build both alternatives from the same explicit fields; never extract a token/link from body text.
  const text = [`Hola, ${input.name}:`, "", `${brand.name} te dio acceso a ${whiteLabel ? "su plataforma" : "Edukana"}.`,
    ...(input.existing ? ["Ya tienes una cuenta con este correo: entra con tu contraseña de siempre.", "", input.href]
      : [`Abre este enlace para crear tu contraseña. Vence en ${input.days} días y solo funciona una vez:`, "", input.href, "",
        recovery ? `Si vence, entra a ${recovery} y pide uno nuevo con este mismo correo.`
          : "Si vence, pide un enlace nuevo desde Recuperar contraseña con este mismo correo."]),
  ].join("\n");
  return transactionalEmail(brand, { ...message, text }, {
    category: "Tu acceso", heading: input.existing ? "Ya puedes entrar" : "Crea tu contraseña",
    preheader: input.existing ? "Entra con la contraseña que ya usas." : `Tu invitación es válida durante ${input.days} días.`,
    name: input.name,
    paragraphs: [`${brand.name} te ha dado acceso a su plataforma.`, input.existing
      ? "Ya tienes una cuenta con este correo: entra con tu contraseña de siempre."
      : "Crea tu contraseña para comenzar."],
    action: { label: input.existing ? "Entrar a la plataforma" : "Crear mi contraseña", href: input.href },
    ...(input.existing ? {} : {
      callout: { title: `Tu invitación es válida durante ${input.days} días`, text: "El enlace funciona una sola vez. No lo compartas." },
      secondaryHelp: "Si el enlace vence o ya lo usaste, pide uno nuevo con el mismo correo.",
      secondary: { label: "Solicitar un nuevo enlace", href: "/recuperar" },
    }),
  });
}

export function resetEmail(
  brand: EmailBrand | null, message: TransactionalMessage, input: { name: string; href: string; minutes: number },
) {
  return transactionalEmail(brand, message, {
    category: "Tu cuenta", heading: "Restablece tu contraseña", preheader: "Recibimos una solicitud para cambiar tu contraseña.",
    name: input.name, paragraphs: ["Recibimos una solicitud para cambiar la contraseña de tu cuenta."],
    callout: { title: `El enlace vence en ${input.minutes} minutos`, text: "Funciona una sola vez. No lo compartas." },
    action: { label: "Restablecer contraseña", href: input.href },
    note: "Si no lo pediste, ignora este mensaje: tu contraseña no cambia.",
  });
}
