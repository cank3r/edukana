# 12 · Finanzas — Diseño
**Datos:** `FeePlan`, `FeePlanItem`, `Charge`, `Payment`, `PaymentAllocation`, `Discount`, `CashSession`, `Refund`. Migrar `PaymentConcept` → `Charge` (+ `Payment` si estaba pagado). Montos `Int` en centavos.
**Libro:** saldo = Σ cargos − Σ asignaciones; nunca campo editable. Estado del cargo derivado.
**Pasarela:**
```ts
interface PaymentGateway { createCheckout(order): {redirectUrl, ref}; verifyCallback(req): Result; refund(ref, amount): Result; fetchSettlement(date): Tx[] }
```
`/api/pagos/[tenant]/retorno` y `/api/pagos/[tenant]/notificacion`; `WebhookEvent` con `externalId` único. Pago pendiente expira a los 30 min.
**Fiscal:** `FiscalProvider { issue(payment): {number} }` con implementación manual (secuencia configurada) y punto de extensión para facturación electrónica.
**Numeración** de recibos con bloqueo por espacio.
**UI:** `/finanzas/{resumen,cargos,pagos,planes,descuentos,conciliacion,caja}`, `/aprender/cuenta`, `/familia/[id]/pagos`.
**Pruebas:** pago parcial; doble notificación; firma inválida; recargo con gracia; mezcla de monedas; fuga de datos hacia roles académicos.
