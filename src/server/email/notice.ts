import type { EmailBrand } from "@/server/platform/branded-email";
import { transactionalEmail, type TransactionalMessage } from "./layout";

export type EmailNotice = { kind: string; title: string; body: string | null; href: string | null; name: string };
const labels: Record<string, [string, string]> = {
  grade: ["Calificaciones", "Ver nota y comentarios"], announcement: ["Avisos", "Leer aviso"],
  assignment: ["Tareas", "Ver tarea"], submission: ["Entregas", "Revisar entrega"],
  exam: ["Exámenes", "Ver examen"], live_class: ["Clases en vivo", "Ver clase"],
  certificate: ["Certificados", "Ver certificado"], charge: ["Estado de cuenta", "Ver estado de cuenta"],
};

/** Same event copy recognition as PR125; never add scores/feedback or activate delivery. */
export function noticeEmail(brand: EmailBrand, message: TransactionalMessage, notice: EmailNotice) {
  const grade = notice.kind === "grade" && /^(Ya tienes nota en|Se corrigió tu nota en) «(.+)»$/u.exec(notice.title);
  const course = grade && /^Curso: (.+)\. Abre la tarea para ver tu nota y los comentarios\.$/u.exec(notice.body ?? "");
  const heading = grade ? grade[1] === "Se corrigió tu nota en" ? "Tu nota fue actualizada" : "Tu tarea ya fue calificada"
    : notice.title;
  const [category, label] = labels[notice.kind] ?? ["Notificación", "Ver notificación"];
  return transactionalEmail(brand, message, {
    category, heading, name: notice.name,
    preheader: notice.kind === "grade" ? `${heading}. Consulta los detalles en la plataforma.` : notice.title,
    paragraphs: [course ? "Ya puedes consultar tu nota y los comentarios de tu docente." : notice.body ?? ""],
    ...(grade ? { summary: [{ label: "Tarea", value: grade[2] }, ...(course ? [{ label: "Curso", value: course[1] }] : [])] } : {}),
    action: { label, href: notice.href ?? "" },
    ...(notice.kind === "grade" ? { note: "Tu nota y los comentarios se consultan dentro de la plataforma." } : {}),
    preferences: true,
  });
}
