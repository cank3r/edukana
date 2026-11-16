# Planes y facturación manual

Esta pieza no integra pasarelas, facturación fiscal ni bloqueo de límites. Los valores iniciales de FREE, STARTER, PRO y ENTERPRISE son ejemplos editables por Carlos. Ejecutar `seedPlatformPlans(tx)` de `src/server/platform/plan-defaults.ts` en la semilla. Es idempotente y no sobrescribe precios editados. Las dos altas aseguran esa semilla y crean un trial FREE de 30 días dentro de la misma transacción; `PLATFORM_TRIAL_DAYS` centraliza la duración.

El operador edita los planes en `/operador/planes`. La ficha muestra `BillingSection`, con precio pactado, estado, uso, cambio con nombre escrito, extensión de fecha, generación de factura y registro/anulación manual. Solo las facturas abiertas admiten pago o anulación. No se anula un pago ya registrado. Cambiar precio de un plan no cambia precios pactados. El pago de un período actual o inmediatamente siguiente activa la suscripción y nunca acorta su fin; un período futuro separado por un hueco no concede acceso adelantado. Una suscripción cancelada no se reactiva implícitamente.

`/operador/facturacion` filtra abiertas, vencidas, pagadas o anuladas. Los totales por cobrar del mes se agrupan por moneda y fecha de vencimiento. Las listas tienen límites de 200 global y 100 por institución. Los límites de almacenamiento usan MB binarios (1.048.576 bytes) y los pedidos de IA cuentan `AI_USED` del mes UTC. `PlanLimitBanner` se muestra solo al administrador de su propia institución; nunca bloquea acciones.

## Vercel Cron

Configurar `CRON_SECRET` como secreto de entorno del proyecto, sin incluirlo en Git. Añadir a la configuración Vercel, cuando se autorice desplegar:

```json
{"crons":[{"path":"/api/cron/plataforma","schedule":"0 6 * * *"}]}
```

Vercel envía `Authorization: Bearer <CRON_SECRET>`. La ruta falla cerrada si falta el secreto o no coincide. No se ejecutó ni configuró en staging/producción. Se recomienda una ejecución diaria; PAST_DUE solo señala atención, jamás suspende. Un pago de un período ya terminado no cubre un período futuro. Las mutaciones de facturación y el cron comparten un bloqueo por institución dentro de la transacción, evitando perder pagos concurrentes. Auditoría `PLATFORM_*` guarda antes/después; el cron usa `changes.operator = "system:cron"`.

## Ensamblaje

- Ficha operador: `<BillingSection institutionId={institutionId} />` desde `src/components/platform/BillingSection`.
- Dashboard layout: `<PlanLimitBanner institutionId={session.user.institutionId} />` desde `src/components/platform/PlanLimitBanner`.
- Migas: `planes: "Planes"`, `facturacion: "Facturación"`.
- Semilla: `await db.$transaction((tx) => seedPlatformPlans(tx))`.
- Añadir suite `tests/platform-billing.test.ts` usando el stub server-only como integración o comando Node separado; integración PostgreSQL ya recoge `tests/integration/platform-billing.test.ts`.
- Migración aditiva: `20261010110000_backoffice_planes`, después de la suspensión B.
