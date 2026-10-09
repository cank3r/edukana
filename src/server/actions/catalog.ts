"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { SalesActor } from "@/server/catalog/access";
import { requestCourse, type CheckoutResult } from "@/server/catalog/checkout";
import { createCoupon, deleteCoupon, setCouponActive } from "@/server/catalog/coupons";
import { setCourseCatalog } from "@/server/catalog/manage";
import { cancelOrder, confirmOrderPayment } from "@/server/catalog/orders";
import { saveReview } from "@/server/catalog/reviews";
import { clientIpFromHeaders } from "@/server/security/login-throttle";

export type CheckoutState = CheckoutResult | { ok: false; message: ""; kind?: undefined };
export type SalesState = { ok: boolean; message: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function failure(name: string, error: unknown) {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false as const, message: `No se pudo completar. Intenta de nuevo en unos minutos. Código: ${correlationId}` };
}

/** Formulario público del curso. Campos: `slug`, `courseId`, `name`, `email`, `coupon` y el campo trampa `website`. */
export async function requestCourseAction(_state: CheckoutState, formData: FormData): Promise<CheckoutState> {
  try {
    return await requestCourse({
      slug: text(formData, "slug"),
      courseId: text(formData, "courseId"),
      name: text(formData, "name"),
      email: text(formData, "email"),
      coupon: text(formData, "coupon"),
      website: text(formData, "website"),
      ip: clientIpFromHeaders(await headers()),
    });
  } catch (error) {
    return failure("requestCourseAction", error);
  }
}

/** Reseña de quien ha iniciado sesión. Campos: `courseId`, `rating` (1–5), `comment` y `slug` (para refrescar la portada). */
export async function saveReviewAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión para dejar tu reseña." };
  try {
    const courseId = text(formData, "courseId");
    const result = await saveReview({ id: user.id, institutionId: user.institutionId }, courseId, { rating: text(formData, "rating"), comment: text(formData, "comment") });
    if (result.ok) {
      const slug = text(formData, "slug");
      if (/^[a-z0-9-]{1,100}$/.test(slug)) revalidatePath(`/catalogo/${slug}/${courseId}`);
    }
    return result;
  } catch (error) {
    return failure("saveReviewAction", error);
  }
}

async function salesActor(): Promise<SalesActor | null> {
  const user = (await auth())?.user;
  return user?.id && user.institutionId ? { id: user.id, institutionId: user.institutionId, role: user.role } : null;
}

async function run(name: string, task: (actor: SalesActor) => Promise<SalesState>): Promise<SalesState> {
  const actor = await salesActor();
  if (!actor) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const result = await task(actor);
    if (result.ok) revalidatePath("/dashboard/ventas");
    return result;
  } catch (error) {
    return failure(name, error);
  }
}

/** Campos: `orderId`, `method` (TRANSFER | CASH | CARD | OTHER) y `note`. */
export async function confirmOrderAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("confirmOrderAction", (actor) => confirmOrderPayment(actor, text(formData, "orderId"), { method: text(formData, "method"), note: text(formData, "note") }));
}

/** Campo: `orderId`. */
export async function cancelOrderAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("cancelOrderAction", (actor) => cancelOrder(actor, text(formData, "orderId")));
}

/** Campos: `code`, `percentOff`, `maxUses` (opcional) y `expiresOn` (AAAA-MM-DD, opcional). */
export async function createCouponAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("createCouponAction", (actor) =>
    createCoupon(actor, { code: text(formData, "code"), percentOff: text(formData, "percentOff"), maxUses: text(formData, "maxUses"), expiresOn: text(formData, "expiresOn") }),
  );
}

/** Campos: `couponId` y `active` ("true" | "false"). */
export async function setCouponActiveAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("setCouponActiveAction", (actor) => setCouponActive(actor, text(formData, "couponId"), text(formData, "active") === "true"));
}

/** Campo: `couponId`. */
export async function deleteCouponAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("deleteCouponAction", (actor) => deleteCoupon(actor, text(formData, "couponId")));
}

/** Campos: `courseId`, `isPublic` (casilla), `price` e `imageUrl`. */
export async function setCourseCatalogAction(_state: SalesState, formData: FormData): Promise<SalesState> {
  return run("setCourseCatalogAction", (actor) =>
    setCourseCatalog(actor, text(formData, "courseId"), { isPublic: formData.get("isPublic") === "on", price: text(formData, "price"), imageUrl: text(formData, "imageUrl") }),
  );
}
