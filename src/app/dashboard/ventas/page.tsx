import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import type { SalesActor as Actor } from "@/server/catalog/access";
import { listCoupons } from "@/server/catalog/coupons";
import { listCatalogCourses } from "@/server/catalog/manage";
import { listOrders } from "@/server/catalog/orders";
import { ORDER_STATUSES } from "@/server/catalog/pricing";
import { centsToInput, formatMoney } from "@/server/finance/money";
import { CatalogCourseItem, CouponCreate, CouponItem, OrderItem } from "./SalesTools";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "pedidos", label: "Pedidos" },
  { value: "cupones", label: "Cupones" },
  { value: "cursos", label: "Cursos en el catálogo" },
] as const;
const STATUS_FILTERS = [
  { value: "PENDING", label: "Por confirmar" },
  { value: "PAID", label: "Pagados" },
  { value: "CANCELLED", label: "Cancelados" },
] as const;
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
/** «14 oct 2026» en la zona de la institución. */
const formatZonedDay = (instant: Date, timeZone: string) => new Intl.DateTimeFormat("es", { timeZone, dateStyle: "medium" }).format(instant);
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("finance.manage")) redirect("/dashboard");

  const params = await searchParams;
  const tab = TABS.find((item) => item.value === one(params.ver))?.value ?? "pedidos";
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const institution = await db.institution.findUnique({ where: { id: user.institutionId }, select: { slug: true, timezone: true } });
  const timeZone = institution?.timezone ?? "America/Santo_Domingo";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Ventas de cursos</h1>
        <p className="mt-1 text-sm text-slate-600">Confirma los pagos de quienes compran un curso, crea cupones de descuento y elige qué cursos se ofrecen al público.</p>
        {institution && (
          <Link href={`/catalogo/${institution.slug}`} target="_blank" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Ver el catálogo público</Link>
        )}
      </header>

      <nav aria-label="Secciones de ventas" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/ventas?ver=${item.value}`}
            aria-current={tab === item.value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-4 font-semibold ${tab === item.value ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "pedidos" && <OrdersSection actor={actor} params={params} timeZone={timeZone} />}
      {tab === "cupones" && <CouponsSection actor={actor} />}
      {tab === "cursos" && <CoursesSection actor={actor} />}
    </div>
  );
}

async function OrdersSection({ actor, params, timeZone }: { actor: Actor; params: Record<string, string | string[] | undefined>; timeZone: string }) {
  const filters = { status: one(params.estado), courseId: one(params.curso).slice(0, 64), q: one(params.q).slice(0, 100) };
  if (!ORDER_STATUSES.some((value) => value === filters.status)) filters.status = "";
  const [data, courses] = await Promise.all([
    listOrders(actor, filters),
    db.course.findMany({ where: { institutionId: actor.institutionId, orders: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  if (!data) redirect("/dashboard");
  const filtering = Boolean(filters.status || filters.courseId || filters.q);
  const total = Object.values(data.counts).reduce((sum, value) => sum + (value ?? 0), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="pedidos">
      <h2 id="pedidos" className="text-lg font-bold text-slate-950">Pedidos</h2>
      <p className="mt-1 text-sm text-slate-600">{data.counts.PENDING ? `${data.counts.PENDING} por confirmar.` : "No hay pagos por confirmar."} Al confirmar un pago, la persona queda inscrita y recibe su acceso por correo.</p>

      <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" role="search">
        <label className="sr-only" htmlFor="buscar-pedido">Buscar por nombre, correo o número de pedido</label>
        <input id="buscar-pedido" name="q" defaultValue={filters.q} placeholder="Nombre, correo o número…" className={field} />
        <label className="sr-only" htmlFor="estado-pedido">Estado</label>
        <select id="estado-pedido" name="estado" defaultValue={filters.status} className={field}>
          <option value="">Todos los estados</option>
          {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="curso-pedido">Curso</label>
        <select id="curso-pedido" name="curso" defaultValue={filters.courseId} className={field}>
          <option value="">Todos los cursos</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
        <input type="hidden" name="ver" value="pedidos" />
        <button className="min-h-11 rounded-lg border border-blue-600 px-4 font-semibold text-blue-700" type="submit">Filtrar</button>
      </form>
      {filtering && <Link href="/dashboard/ventas?ver=pedidos" className="mt-2 inline-flex min-h-11 items-center text-sm text-blue-700 underline">Quitar filtros</Link>}

      {data.orders.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          {total === 0
            ? "Todavía no hay pedidos. Aparecen aquí cuando alguien pide un curso con precio desde el catálogo público. Empieza en «Cursos en el catálogo»."
            : "Ningún pedido coincide con estos filtros."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3 md:space-y-0 md:divide-y md:divide-slate-100">
          {data.orders.map((order) => (
            <OrderItem
              key={order.id}
              order={{
                id: order.id,
                number: order.number,
                courseName: order.courseName,
                buyerName: order.buyerName,
                buyerEmail: order.buyerEmail,
                amount: formatMoney(order.amountCents, order.currency),
                status: order.status,
                couponCode: order.couponCode,
                createdOn: formatZonedDay(order.createdAt, timeZone),
                paidOn: order.paidAt ? formatZonedDay(order.paidAt, timeZone) : "",
                paymentMethod: order.paymentMethod ?? "",
                paymentNote: order.paymentNote ?? "",
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

async function CouponsSection({ actor }: { actor: Actor }) {
  const coupons = await listCoupons(actor);
  if (!coupons) redirect("/dashboard");
  return (
    <section className="space-y-4" aria-labelledby="cupones">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 id="cupones" className="text-lg font-bold text-slate-950">Cupones</h2>
        <p className="mt-1 text-sm text-slate-600">Un cupón descuenta un porcentaje del precio de cualquier curso del catálogo. Se gasta un uso cuando confirmas el pago del pedido.</p>
        <CouponCreate />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        {coupons.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Todavía no hay cupones. Crea el primero con el formulario de arriba.</p>
        ) : (
          <ul className="divide-y divide-slate-100">{coupons.map((coupon) => <CouponItem key={coupon.id} coupon={coupon} />)}</ul>
        )}
      </div>
    </section>
  );
}

async function CoursesSection({ actor }: { actor: Actor }) {
  const courses = await listCatalogCourses(actor);
  if (!courses) redirect("/dashboard");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cursos-catalogo">
      <h2 id="cursos-catalogo" className="text-lg font-bold text-slate-950">Cursos en el catálogo</h2>
      <p className="mt-1 text-sm text-slate-600">Marca los cursos que cualquiera puede ver e inscribirse desde la página pública, y fija su precio. Con precio 0 el curso es gratis.</p>
      {courses.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Todavía no hay cursos. Crea uno en Cursos y vuelve aquí para ofrecerlo al público.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {courses.map((course) => (
            <CatalogCourseItem
              key={course.id}
              course={{
                id: course.id,
                name: course.name,
                teacherName: course.teacherName,
                isPublic: course.isPublic,
                isPublished: course.isPublished,
                price: course.priceCents ? formatMoney(course.priceCents, course.currency) : "Gratis",
                priceInput: course.priceCents ? centsToInput(course.priceCents) : "0",
                imageUrl: course.imageUrl ?? "",
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
