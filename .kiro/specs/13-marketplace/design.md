# 13 · Marketplace — Diseño
**Datos:** `Category`, `Course` (estado de revisión), `Offering(SELF_PACED, priceCents)`, `Coupon`, `Order`, `OrderItem`, `Review`, `InstructorEarning`, `Payout`, `PlatformFee`.
**Checkout:** `createOrder` calcula precios en servidor (nunca confía en el cliente) → `PaymentGateway.createCheckout` → confirmación idempotente → `fulfillOrder` (matrículas, ganancias, comisión, correo).
**Pasarela:** la del espacio. En el marketplace propio de Edukana, la de plataforma.
**SEO:** rutas `(public)/cursos`, `(public)/cursos/[slug]` con ISR, `sitemap.xml` y datos estructurados por espacio.
**Reembolso:** `refundOrderItem` valida política → pasarela → revoca matrícula → asiento negativo en ganancias.
**Liquidación:** job mensual agrupa ganancias liberadas (pasado el plazo de reembolso).
**UI:** `/catalogo/{cursos,revision,cupones,resenas,instructores,pedidos,liquidaciones}`, panel `/ensenar/ventas`.
**Pruebas:** manipulación de precio; cupón agotado en concurrencia; doble confirmación; reembolso fuera de plazo; instructor no ve cursos ajenos; reseña sin progreso.
