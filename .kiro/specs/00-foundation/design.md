# 00 · Fundaciones — Diseño

## Componentes
- `src/server/context.ts`: `getRequestContext()` (tenant, user, membership activa, permisos resueltos, settings, terminology). Memoizado con `cache()`.
- `src/server/authz/permissions.ts`: catálogo tipado (`as const`) de `roles-permissions.md`.
- `src/server/authz/roles.ts`: plantillas de sistema por tipo de espacio.
- `src/server/authz/can.ts`: `can(ctx, perm, resource?)`. Resolutores de relación por tipo de recurso (`offering`, `student`, `enrollment`, `course`, `charge`) que consultan lo mínimo y se memoizan por petición.
- `src/server/authz/route.ts`: `definePage({ permission, module? }, handler)` y `defineAction({ permission, schema }, handler)`. Envoltorios obligatorios; una regla de ESLint prohíbe `export default async function` en `app/(app)/**/page.tsx` sin `definePage`, y prohíbe importar `@/server/db` fuera de `src/server/data`.
- `src/server/data/**`: funciones `getXView(ctx, id)` que devuelven DTOs. Para curso: `getStudentOfferingView`, `getStaffOfferingView`, `getGuardianChildOfferingView`.
- `src/server/audit.ts`: `audit(ctx, action, entity, before, after)` dentro de la transacción.
- `src/server/log.ts`: registro estructurado.

## Migración de datos
- Paso 1 (esta spec): mantener modelos actuales; añadir `sessionVersion`; no renombrar aún.
- `Enrollment.status` existente `COMPLETED` causado por progreso: script que devuelve a `ACTIVE` las matrículas cuya oferta sigue en un período abierto.

## Interfaz
- Reescribir la página de curso como rutas por pestaña con las vistas del DAL.
- Banda de solo lectura reutilizable `<ReadOnlyBanner reason>`.

## Pruebas
- `tests/integration/setup.ts`: Postgres efímero, migraciones, semilla con 2 espacios × todos los roles.
- `tests/integration/authz.matrix.test.ts`: genera casos desde el catálogo.
- `tests/integration/routes.guard.test.ts`: recorre `app/(app)` y verifica que cada página use `definePage`.
- E2E Playwright: URL directa por rol; ID de otro espacio.
