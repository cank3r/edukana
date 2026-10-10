import { withRequestHost } from "../helpers/request-host-context";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { requestCourse, ENROLLED_MESSAGE } from "@/server/catalog/checkout";
import { createCoupon, deleteCoupon, listCoupons, setCouponActive } from "@/server/catalog/coupons";
import { setCourseCatalog } from "@/server/catalog/manage";
import { cancelOrder, confirmOrderPayment, listOrders } from "@/server/catalog/orders";
import { getPublicCourse, listPublicCourses } from "@/server/catalog/public";
import { saveReview } from "@/server/catalog/reviews";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { A, B, ensureSeed } from "./setup";

const mail = new MemoryEmailProvider();
const SLUG_A = "instituto-a";
const COURSES = ["cat_free", "cat_paid", "cat_private", "cat_archived", "cat_draft", "cat_b"];
const NEW_EMAILS = ["nueva@catalogo.test", "comprador1@catalogo.test", "comprador2@catalogo.test", "comprador3@catalogo.test", "robot@catalogo.test", "limite@catalogo.test"];
const startedAt = new Date();
let ipCounter = 0;
const ip = () => `10.77.0.${++ipCounter}`;
const ask = (courseId: string, email: string, extra: { coupon?: string; website?: string; name?: string; slug?: string } = {}) =>
  withRequestHost("edukana.test", () => requestCourse({
    slug: extra.slug ?? SLUG_A, courseId, name: extra.name ?? "Persona de Prueba", email,
    coupon: extra.coupon, website: extra.website, ip: ip(),
  }));
const memberOfA = (email: string) => db.user.findFirst({ where: { institutionId: A.institutionId, email } });

async function cleanup() {
  const createdInA = await db.user.findMany({ where: { institutionId: A.institutionId, email: { in: [...NEW_EMAILS, "estudiante@b.test"] } }, select: { id: true } });
  const ids = createdInA.map((user) => user.id);
  await db.enrollment.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.passwordResetToken.deleteMany({ where: { userId: { in: [...ids, A.student.id, A.student2.id] } } });
  await db.courseOrder.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.courseReview.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.coupon.deleteMany({ where: { code: { startsWith: "CAT" } } });
  await db.course.deleteMany({ where: { id: { in: COURSES } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.identity.deleteMany({ where: { email: { in: NEW_EMAILS }, users: { none: {} } } });
  await db.auditLog.deleteMany({ where: { createdAt: { gte: startedAt }, institutionId: { in: [A.institutionId, B.institutionId] }, action: { in: ["CATALOG_ENROLLED", "COURSE_ORDER_CREATED", "COURSE_ORDER_PAID", "COURSE_ORDER_CANCELLED", "COUPON_CREATED", "COUPON_UPDATED", "COUPON_DELETED", "CATALOG_COURSE_UPDATED", "PEOPLE_INVITED"] } } });
  await db.loginAttempt.deleteMany();
}

before(async () => {
  process.env.APP_URL = "https://edukana.test";
  await ensureSeed();
  setEmailProviderForTests(mail);
  await cleanup();
  const base = { institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id, isPublished: true, isPublic: true };
  await db.course.createMany({
    data: [
      { ...base, id: "cat_free", name: "Catálogo Fotografía básica", description: "Aprende a usar tu cámara." },
      { ...base, id: "cat_paid", name: "Catálogo Excel avanzado", priceCents: 150_000, currency: "DOP" },
      { ...base, id: "cat_private", name: "Catálogo curso interno", isPublic: false },
      { ...base, id: "cat_archived", name: "Catálogo archivado", archivedAt: new Date() },
      { ...base, id: "cat_draft", name: "Catálogo borrador", isPublished: false },
      { ...base, id: "cat_b", institutionId: B.institutionId, periodId: "b_period", teacherId: B.teacher.id, name: "Catálogo de B" },
    ],
  });
  await db.courseSection.create({
    data: {
      id: "cat_section",
      institutionId: A.institutionId,
      courseId: "cat_free",
      title: "Primeros pasos",
      isPublished: true,
      lessons: {
        create: [
          { institutionId: A.institutionId, courseId: "cat_free", title: "Tu cámara", order: 0, isPublished: true },
          { institutionId: A.institutionId, courseId: "cat_free", title: "La luz", order: 1, isPublished: true },
          { institutionId: A.institutionId, courseId: "cat_free", title: "Borrador oculto", order: 2, isPublished: false },
        ],
      },
    },
  });
});
beforeEach(async () => {
  mail.sent.length = 0;
  await db.loginAttempt.deleteMany();
});
after(async () => {
  await cleanup();
  setEmailProviderForTests(null);
  await db.$disconnect();
});

test("catálogo: solo aparecen los cursos públicos, publicados y no archivados de esa institución", async () => {
  const names = (await listPublicCourses(A.institutionId)).map((course) => course.name);
  assert.ok(names.includes("Catálogo Fotografía básica") && names.includes("Catálogo Excel avanzado"));
  for (const hidden of ["Catálogo curso interno", "Catálogo archivado", "Catálogo borrador", "Catálogo de B", "course A"]) assert.equal(names.includes(hidden), false, hidden);
  assert.deepEqual((await listPublicCourses(A.institutionId, "excel")).map((course) => course.id), ["cat_paid"]);

  const detail = await getPublicCourse(A.institutionId, "cat_free");
  assert.ok(detail);
  assert.equal(detail.lessons, 2, "solo lecciones publicadas");
  assert.deepEqual(detail.sections[0].lessons.map((lesson) => lesson.title), ["Tu cámara", "La luz"]);
  assert.equal(await getPublicCourse(A.institutionId, "cat_b"), null, "un curso de B no se ve en el catálogo de A");
  assert.equal(await getPublicCourse(A.institutionId, "cat_private"), null);
  assert.equal((await ask("cat_b", "nueva@catalogo.test")).ok, false, "no se puede pedir un curso de B desde A");
  assert.equal((await ask("cat_private", "nueva@catalogo.test")).ok, false);
});

test("inscripción gratuita: crea la persona y la matrícula, invita, y repetirla no duplica", async () => {
  const first = await ask("cat_free", " Nueva@Catalogo.test ", { name: "Nueva Persona" });
  assert.deepEqual(first, { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE });
  const user = await memberOfA("nueva@catalogo.test");
  assert.ok(user);
  assert.deepEqual([user.role, user.status, user.name], ["STUDENT", "ACTIVE", "Nueva Persona"]);
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_free", studentId: user.id, status: "ACTIVE" } }), 1);
  assert.equal(mail.sent.length, 1);
  assert.match(mail.sent[0].text, /\/restablecer\//, "recibe el enlace para crear su contraseña");

  assert.deepEqual(await ask("cat_free", "nueva@catalogo.test"), first, "la misma respuesta");
  assert.equal(await db.user.count({ where: { institutionId: A.institutionId, email: "nueva@catalogo.test" } }), 1);
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_free", studentId: user.id } }), 1);
});

test("correo ya miembro: se inscribe sin duplicar a la persona; correo de otra institución reutiliza su identidad", async () => {
  const identities = await db.identity.count();
  assert.deepEqual(await ask("cat_free", "estudiante@a.test", { name: "Otro Nombre" }), { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE });
  assert.equal(await db.user.count({ where: { institutionId: A.institutionId, email: "estudiante@a.test" } }), 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: A.student.id } })).name, "student A", "no se cambian sus datos");
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_free", studentId: A.student.id, status: "ACTIVE" } }), 1);

  await ask("cat_free", "estudiante@b.test");
  const inA = await memberOfA("estudiante@b.test");
  const inB = await db.user.findUniqueOrThrow({ where: { id: B.student.id } });
  assert.ok(inA && inA.id !== inB.id);
  assert.equal(inA.identityId, inB.identityId, "misma identidad: su contraseña no cambia");
  assert.equal(await db.identity.count(), identities, "no se creó otra identidad");
  assert.equal(inB.institutionId, B.institutionId);

  // Una persona suspendida recibe la misma respuesta y no se inscribe.
  assert.deepEqual(await ask("cat_free", "suspendido@a.test"), { ok: true, kind: "enrolled", message: ENROLLED_MESSAGE });
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_free", studentId: "a_suspended" } }), 0);
});

test("protección: el campo trampa no crea nada y hay límite de solicitudes por correo", async () => {
  assert.equal((await ask("cat_free", "robot@catalogo.test", { website: "http://spam.test" })).ok, true);
  assert.equal(await memberOfA("robot@catalogo.test"), null);
  assert.equal(mail.sent.length, 0);

  for (let index = 0; index < 5; index += 1) assert.equal((await ask("cat_free", "limite@catalogo.test")).ok, true);
  const blocked = await ask("cat_free", "LIMITE@catalogo.test");
  assert.equal(blocked.ok, false);
  assert.match(blocked.ok ? "" : blocked.message, /15 minutos/);
  assert.equal((await ask("cat_free", "x")).ok, false, "correo no válido");
});

test("pedido con cupón: calcula el descuento y dos confirmaciones simultáneas no superan los usos", async () => {
  assert.equal((await createCoupon(A.admin, { code: " cat25 ", percentOff: "25", maxUses: "1" })).ok, true);
  assert.equal((await createCoupon(A.admin, { code: "CAT25", percentOff: 10 })).ok, false, "código repetido");
  assert.equal((await createCoupon(A.admin, { code: "CATMAL", percentOff: 0 })).ok, false);
  assert.equal((await createCoupon(A.admin, { code: "CATVIEJO", percentOff: 10, expiresOn: "2020-01-01" })).ok, false, "fecha pasada");

  assert.equal((await ask("cat_paid", "comprador1@catalogo.test", { coupon: "NOEXISTE" })).ok, false);
  const one = await ask("cat_paid", "comprador1@catalogo.test", { coupon: "cat25" });
  const two = await ask("cat_paid", "comprador2@catalogo.test", { coupon: "CAT25" });
  assert.ok(one.ok && one.kind === "order" && two.ok && two.kind === "order");
  assert.deepEqual([one.amountCents, one.priceCents, one.currency], [112_500, 150_000, "DOP"]);
  assert.match(one.instructions, /Instituto A/);
  assert.match(one.orderNumber, /^[A-Z0-9]{8}$/);
  const buyer = await memberOfA("comprador1@catalogo.test");
  assert.equal(buyer?.status, "INACTIVE", "no puede entrar hasta que se confirme el pago");
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_paid" } }), 0);

  const orders = await db.courseOrder.findMany({ where: { courseId: "cat_paid", status: "PENDING" }, orderBy: { createdAt: "asc" } });
  assert.equal(orders.length, 2);
  assert.equal((await ask("cat_paid", "comprador1@catalogo.test", { coupon: "CAT25" })).ok, true);
  assert.equal(await db.courseOrder.count({ where: { courseId: "cat_paid" } }), 2, "un pedido pendiente por persona y curso");

  const results = await Promise.all(orders.map((order) => confirmOrderPayment(A.admin, order.id, { method: "TRANSFER" })));
  assert.equal(results.filter((result) => result.ok).length, 1, "solo una confirmación entra");
  assert.match(results.find((result) => !result.ok)?.message ?? "", /cupón/);
  assert.equal((await db.coupon.findFirstOrThrow({ where: { institutionId: A.institutionId, code: "CAT25" } })).usedCount, 1);
  assert.equal(await db.courseOrder.count({ where: { courseId: "cat_paid", status: "PAID" } }), 1);
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_paid" } }), 1);
  assert.equal((await ask("cat_paid", "comprador3@catalogo.test", { coupon: "CAT25" })).ok, false, "cupón agotado");

  const listed = await listCoupons(A.admin);
  assert.deepEqual(listed?.filter((coupon) => coupon.code === "CAT25").map((coupon) => [coupon.usedCount, coupon.orders]), [[1, 2]]);
  const coupon = listed!.find((item) => item.code === "CAT25")!;
  assert.equal((await deleteCoupon(A.admin, coupon.id)).ok, false, "un cupón usado no se borra");
  assert.equal((await setCouponActive(A.admin, coupon.id, false)).ok, true);
});

test("confirmar pago: activa a la persona, la inscribe una sola vez e invita una sola vez", async () => {
  const order = await ask("cat_paid", "comprador3@catalogo.test");
  assert.ok(order.ok && order.kind === "order");
  assert.equal(order.amountCents, 150_000);
  const row = await db.courseOrder.findFirstOrThrow({ where: { courseId: "cat_paid", buyer: { email: "comprador3@catalogo.test" } } });
  mail.sent.length = 0;

  assert.equal((await confirmOrderPayment(A.admin, row.id, { method: "NADA" })).ok, false);
  assert.equal((await confirmOrderPayment(A.admin, row.id, { method: "CASH", note: "Recibo 123" })).ok, true);
  const again = await confirmOrderPayment(A.admin, row.id, { method: "CASH" });
  assert.deepEqual(again, { ok: true, message: "Este pedido ya estaba confirmado. No se cambió nada." });

  const buyer = await memberOfA("comprador3@catalogo.test");
  assert.equal(buyer?.status, "ACTIVE");
  assert.equal(await db.enrollment.count({ where: { courseId: "cat_paid", studentId: buyer!.id, status: "ACTIVE" } }), 1);
  assert.equal(mail.sent.filter((message) => message.to === "comprador3@catalogo.test").length, 1, "una sola invitación");
  const paid = await db.courseOrder.findUniqueOrThrow({ where: { id: row.id } });
  assert.deepEqual([paid.status, paid.paymentMethod, paid.paymentNote], ["PAID", "CASH", "Recibo 123"]);
  assert.equal((await cancelOrder(A.admin, row.id)).ok, false, "un pedido pagado no se cancela");

  const listed = await listOrders(A.admin, { status: "PAID", q: order.orderNumber });
  assert.deepEqual(listed?.orders.map((item) => item.id), [row.id], "se encuentra por número de pedido");
});

test("cancelar: el pedido queda cancelado y ya no se puede confirmar", async () => {
  const pending = await db.courseOrder.findFirstOrThrow({ where: { courseId: "cat_paid", status: "PENDING" } });
  assert.equal((await cancelOrder(A.admin, pending.id)).ok, true);
  assert.equal((await confirmOrderPayment(A.admin, pending.id, { method: "TRANSFER" })).ok, false);
  assert.equal((await db.courseOrder.findUniqueOrThrow({ where: { id: pending.id } })).status, "CANCELLED");
});

test("permisos: sin «gestionar cobros» no se ve ni se cambia nada", async () => {
  const order = await db.courseOrder.findFirstOrThrow({ where: { courseId: "cat_paid" } });
  for (const actor of [A.teacher, A.student, A.coordinator]) {
    assert.equal(await listOrders(actor, {}), null);
    assert.equal(await listCoupons(actor), null);
    assert.equal((await confirmOrderPayment(actor, order.id, { method: "CASH" })).ok, false);
    assert.equal((await cancelOrder(actor, order.id)).ok, false);
    assert.equal((await createCoupon(actor, { code: "CATNO", percentOff: 10 })).ok, false);
    assert.equal((await setCourseCatalog(actor, "cat_private", { isPublic: true, price: "0" })).ok, false);
  }
  assert.equal(await db.coupon.count({ where: { code: "CATNO" } }), 0);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: "cat_private" } })).isPublic, false);
});

test("aislamiento: B no ve ni toca pedidos, cupones ni cursos de A", async () => {
  const order = await db.courseOrder.findFirstOrThrow({ where: { courseId: "cat_paid" }, select: { id: true } });
  const coupon = await db.coupon.findFirstOrThrow({ where: { institutionId: A.institutionId, code: "CAT25" } });
  assert.equal((await listOrders(B.admin, {}))?.orders.some((item) => item.id === order.id), false);
  assert.equal((await listCoupons(B.admin))?.some((item) => item.id === coupon.id), false);
  assert.equal((await confirmOrderPayment(B.admin, order.id, { method: "CASH" })).ok, false);
  assert.equal((await cancelOrder(B.admin, order.id)).ok, false);
  assert.equal((await setCouponActive(B.admin, coupon.id, true)).ok, false);
  assert.equal((await deleteCoupon(B.admin, coupon.id)).ok, false);
  assert.equal((await setCourseCatalog(B.admin, "cat_private", { isPublic: true, price: "0" })).ok, false);
  assert.equal((await saveReview(B.student, "cat_free", { rating: 5 })).ok, false);
  assert.equal((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).isActive, false, "sigue desactivado");
});

test("catálogo del panel: poner un curso en venta con precio en centavos", async () => {
  assert.equal((await setCourseCatalog(A.admin, "cat_private", { isPublic: true, price: "2,500.50", imageUrl: "javascript:alert(1)" })).ok, false);
  assert.equal((await setCourseCatalog(A.admin, "cat_private", { isPublic: true, price: "abc" })).ok, false);
  assert.equal((await setCourseCatalog(A.admin, "cat_private", { isPublic: true, price: "2,500.50", imageUrl: "https://img.test/a.jpg" })).ok, true);
  const course = await db.course.findUniqueOrThrow({ where: { id: "cat_private" } });
  assert.deepEqual([course.isPublic, course.priceCents, course.imageUrl], [true, 250_050, "https://img.test/a.jpg"]);
  assert.ok((await listPublicCourses(A.institutionId)).some((item) => item.id === "cat_private"));
  assert.equal((await setCourseCatalog(A.admin, "cat_b", { isPublic: true, price: "0" })).ok, false, "curso de otra institución");
});

test("reseñas: solo quien está inscrito, de 1 a 5, y la suya se corrige sin duplicar", async () => {
  assert.equal((await saveReview(A.student2, "cat_free", { rating: 5 })).ok, false, "no inscrito");
  assert.equal((await saveReview(A.student, "cat_free", { rating: 6 })).ok, false);
  assert.deepEqual(await saveReview(A.student, "cat_free", { rating: 5, comment: "Muy claro" }), { ok: true, message: "Gracias por tu reseña." });
  assert.equal((await saveReview(A.student, "cat_free", { rating: 3, comment: "" })).ok, true);
  assert.equal(await db.courseReview.count({ where: { courseId: "cat_free" } }), 1);
  const detail = await getPublicCourse(A.institutionId, "cat_free");
  assert.deepEqual([detail?.rating, detail?.reviewCount, detail?.reviews[0].author, detail?.reviews[0].comment], [3, 1, "student A.", null]);
  const card = (await listPublicCourses(A.institutionId)).find((item) => item.id === "cat_free");
  assert.deepEqual([card?.rating, card?.reviews], [3, 1]);
});

// Real tenant lookup and all checkout writes remain on disposable PostgreSQL in CI.
test("catálogo: host de B no puede inscribir en A aunque el formulario envíe el slug de A", async () => {
  const previousRoot = process.env.PLATFORM_ROOT_DOMAIN;
  process.env.PLATFORM_ROOT_DOMAIN = "catalog-host.test";
  try {
    const b = await db.institution.findUniqueOrThrow({ where: { id: B.institutionId }, select: { slug: true } });
    const beforeEnrollments = await db.enrollment.count({ where: { courseId: "cat_free" } });
    const beforeOrders = await db.courseOrder.count({ where: { courseId: "cat_free" } });
    const result = await withRequestHost(`${b.slug}.catalog-host.test`, () => requestCourse({
      slug: SLUG_A, courseId: "cat_free", name: "Persona de Prueba", email: "nueva@catalogo.test", ip: ip(),
    }));
    assert.deepEqual(result, { ok: false, message: "Este curso ya no está disponible." });
    assert.equal(await db.enrollment.count({ where: { courseId: "cat_free" } }), beforeEnrollments);
    assert.equal(await db.courseOrder.count({ where: { courseId: "cat_free" } }), beforeOrders);
    assert.equal(mail.sent.length, 0);
  } finally {
    if (previousRoot === undefined) delete process.env.PLATFORM_ROOT_DOMAIN;
    else process.env.PLATFORM_ROOT_DOMAIN = previousRoot;
  }
});
