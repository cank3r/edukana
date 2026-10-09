import { z } from "zod";
import { db } from "@/lib/db";
import { formatMoney } from "@/server/finance/money";
import { normalizeEmail } from "@/server/identity";
import { getEmailProvider } from "@/server/integrations/email";
import { sendInvitations } from "@/server/people/invitations";
import { appUrl } from "@/server/password-reset";
import { applyEnrollment, checkSeat, ensureBuyer, rowLocked, type Buyer } from "./buyer";
import { couponProblem, discountedCents, isFree, normalizeCouponCode, orderNumber, paymentInstructionsOf } from "./pricing";
import { findBrand, publicCourseWhere, type PublicBrand } from "./public";
import { takeCatalogAttempt } from "./throttle";

export type CheckoutInput = { slug: string; courseId: string; name: string; email: string; coupon?: string; website?: string; ip: string };
export type CheckoutResult =
  | { ok: false; message: string }
  | { ok: true; kind: "enrolled"; message: string }
  | { ok: true; kind: "order"; message: string; orderNumber: string; amountCents: number; priceCents: number; currency: string; instructions: string };

/** Respuesta única para la inscripción gratuita: no dice si el correo ya existía ni qué se le envió. */
export const ENROLLED_MESSAGE = "¡Listo! Revisa tu correo: te enviamos cómo entrar al curso. Si no lo ves, mira en la carpeta de correo no deseado.";
const TOO_MANY = "Recibimos muchas solicitudes seguidas. Espera unos 15 minutos e intenta de nuevo.";
const UNAVAILABLE = "Este curso ya no está disponible.";

const schema = z.object({
  name: z.string().trim().min(3, "Escribe tu nombre completo.").max(120, "El nombre es demasiado largo."),
  email: z.string().max(254, "El correo es demasiado largo.").regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Escribe un correo válido, por ejemplo ana@correo.com."),
  coupon: z.string().max(40, "Ese cupón no existe o ya no está activo."),
});

async function send(to: string, subject: string, lines: string[]) {
  try {
    await getEmailProvider().send({ to, subject, text: lines.join("\n") });
  } catch (error) {
    console.error("catalog: no se pudo enviar el correo", { correlationId: crypto.randomUUID(), error });
  }
}

/**
 * Solicitud del formulario público de un curso. Si es gratis inscribe e invita; si tiene precio
 * crea un pedido pendiente. La respuesta en pantalla nunca depende de si el correo ya existía:
 * lo que cambia según la persona va solo en el correo que recibe.
 */
export async function requestCourse(input: CheckoutInput, now = new Date()): Promise<CheckoutResult> {
  const brand = await findBrand(String(input.slug ?? ""));
  const course = brand
    ? await db.course.findFirst({ where: { ...publicCourseWhere(brand.id), id: String(input.courseId ?? "") }, select: { id: true, name: true, priceCents: true, currency: true, maxStudents: true } })
    : null;
  if (!brand || !course) return { ok: false, message: UNAVAILABLE };
  // Campo trampa: una persona no lo ve ni lo llena; un robot sí. Se le responde como si nada.
  if (String(input.website ?? "").trim()) return { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE };

  const parsed = schema.safeParse({ name: input.name ?? "", email: normalizeEmail(String(input.email ?? "")), coupon: normalizeCouponCode(input.coupon ?? "") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;
  if (!(await takeCatalogAttempt({ email: data.email, ip: input.ip }, now))) return { ok: false, message: TOO_MANY };

  return isFree(course.priceCents) ? enrollFree(brand, course, data) : createOrder(brand, { ...course, priceCents: course.priceCents! }, data, now);
}

async function enrollFree(brand: PublicBrand, course: { id: string; name: string }, data: { name: string; email: string }): Promise<CheckoutResult> {
  const { buyer } = await ensureBuyer(brand.id, data, "ACTIVE");
  if (buyer.status === "SUSPENDED") return { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE };
  if (buyer.role !== "STUDENT") {
    await send(buyer.email, `Tu solicitud en ${brand.name}`, [
      `Hola, ${buyer.name}:`,
      "",
      `Pediste entrar al curso «${course.name}», pero tu cuenta en ${brand.name} no es de estudiante.`,
      "Pide a la institución que te inscriba directamente.",
    ]);
    return { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE };
  }

  const outcome = await db.$transaction(async (tx) => {
    const seat = await checkSeat(tx, brand.id, course.id, buyer.id);
    if (!seat.ok) return seat;
    // INACTIVE solo nace de un pedido sin pagar: al entrar a un curso gratis ya puede usar su cuenta.
    if (buyer.status === "INACTIVE") await tx.user.update({ where: { id: buyer.id }, data: { status: "ACTIVE" } });
    const result = await applyEnrollment(tx, brand.id, course.id, buyer.id, seat.enrollment);
    if (result !== "already") {
      await tx.auditLog.create({
        data: { institutionId: brand.id, userId: buyer.id, action: "CATALOG_ENROLLED", entity: "Course", entityId: course.id, changes: { result } },
      });
    }
    return { ok: true as const };
  }, rowLocked);
  if (!outcome.ok) return outcome;
  await sendInvitations({ id: buyer.id, institutionId: brand.id }, [buyer.id]);
  return { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE };
}

type PaidCourse = { id: string; name: string; priceCents: number; currency: string; maxStudents: number | null };

async function createOrder(brand: PublicBrand, course: PaidCourse, data: { name: string; email: string; coupon: string }, now: Date): Promise<CheckoutResult> {
  const coupon = data.coupon
    ? await db.coupon.findUnique({ where: { institutionId_code: { institutionId: brand.id, code: data.coupon } } })
    : null;
  if (data.coupon) {
    const problem = couponProblem(coupon, now);
    if (problem) return { ok: false, message: problem };
  }
  if (course.maxStudents !== null && (await db.enrollment.count({ where: { courseId: course.id, status: "ACTIVE" } })) >= course.maxStudents) {
    return { ok: false, message: "Este curso ya no tiene cupos disponibles." };
  }

  const amountCents = coupon ? discountedCents(course.priceCents, coupon.percentOff) : course.priceCents;
  const { buyer } = await ensureBuyer(brand.id, data, "INACTIVE");
  const order = await upsertPendingOrder(brand.id, course, buyer, { couponId: coupon?.id ?? null, amountCents });
  const instructions = paymentInstructionsOf(brand.settings, brand.name);
  const number = orderNumber(order.id);
  const total = formatMoney(amountCents, course.currency);

  if (buyer.status !== "SUSPENDED") {
    const enrolled = await db.enrollment.count({ where: { courseId: course.id, studentId: buyer.id, status: { in: ["ACTIVE", "COMPLETED"] } } });
    await send(buyer.email, `Pedido ${number}: ${course.name}`, [
      `Hola, ${buyer.name}:`,
      "",
      ...(enrolled
        ? [`Ya tienes acceso al curso «${course.name}» en ${brand.name}: no necesitas pagar este pedido. Entra en ${appUrl()}/login`]
        : [`Recibimos tu pedido del curso «${course.name}» en ${brand.name}.`, `Número de pedido: ${number}`, `Total a pagar: ${total}`, "", "Cómo pagar:", instructions]),
    ]);
  }
  return {
    ok: true,
    kind: "order",
    message: `Tu pedido ${number} quedó registrado. Te enviamos estos datos por correo.`,
    orderNumber: number,
    amountCents,
    priceCents: course.priceCents,
    currency: course.currency,
    instructions,
  };
}

/** Un pedido pendiente por persona y curso: si ya había uno, se actualiza con el cupón nuevo. */
async function upsertPendingOrder(institutionId: string, course: PaidCourse, buyer: Buyer, values: { couponId: string | null; amountCents: number }) {
  const pending = await db.courseOrder.findFirst({ where: { institutionId, courseId: course.id, buyerId: buyer.id, status: "PENDING" }, select: { id: true } });
  if (pending) return db.courseOrder.update({ where: { id: pending.id }, data: { ...values, currency: course.currency }, select: { id: true } });
  const order = await db.courseOrder.create({
    data: { institutionId, courseId: course.id, buyerId: buyer.id, currency: course.currency, status: "PENDING", ...values },
    select: { id: true },
  });
  await db.auditLog.create({
    data: { institutionId, userId: buyer.id, action: "COURSE_ORDER_CREATED", entity: "CourseOrder", entityId: order.id, changes: { courseId: course.id, amountCents: values.amountCents } },
  });
  return order;
}
