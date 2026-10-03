# 01 · Plataforma y marca blanca — Diseño

## Resolución de tenant
`src/proxy.ts`: normaliza `Host` → busca en caché en memoria (TTL 60 s) `TenantDomain.host` → inyecta `x-tenant-id`. `app.edukana.com` y `www` son hosts de plataforma. En desarrollo: `{slug}.localhost`.

## Aislamiento
- Renombrar `Institution` → `Tenant` y `institutionId` → `tenantId` (migración con `RENAME`).
- `db` = cliente extendido que exige `tenantId` del contexto; lanza error si falta.
- RLS: política `tenant_id = current_setting('app.tenant_id')::text` en todas las tablas de negocio; el DAL abre transacción y ejecuta `SET LOCAL`. Rol de base de datos de la app sin `BYPASSRLS`.
- `dbPlatform` solo importable desde `src/server/platform/**` (regla ESLint).

## Aprovisionamiento
`provisionTenant(input)` en `src/server/platform/provision.ts`:
1. Crea `Tenant` con preset `presets/{type}.ts` (módulos, terminología, ajustes, roles, estructura base, plantillas).
2. Estructura base — SCHOOL: año escolar actual, 4 períodos, niveles y grados estándar; UNIVERSITY: año, 2 semestres; INSTITUTE: programa de ejemplo vacío; MARKETPLACE: categorías sugeridas.
3. Crea invitación `OWNER` y encola correo.
Los presets son datos, no código condicional: agregar un tipo nuevo es agregar un archivo.

## Tema
`buildTheme(branding)` genera variables CSS (incluye escala 50–900 del color primario y color de texto con contraste AA) e inyecta `<style>` en el layout raíz. Correos y PDFs reciben el mismo objeto de tema.

## Dominio propio
Verificación por registro TXT `_edukana.{dominio}`; activación tras CNAME correcto. Job reintenta cada 10 min por 48 h. El certificado TLS lo gestiona el proveedor de alojamiento vía API (interfaz `DomainProvider`).

## Límites y módulos
`checkLimit(ctx, key)` consulta contadores en vivo para altas; `UsageSnapshot` diario para facturación. `hasModule` integrado en `can()` y en la construcción del menú.

## Rutas de plataforma
`/platform`, `/platform/espacios`, `/platform/espacios/nuevo`, `/platform/espacios/[id]/{resumen,plan,modulos,dominio,uso,facturacion,usuarios,auditoria}`, `/platform/planes`, `/platform/facturacion`, `/platform/operadores`, `/platform/sistema`.

## Pruebas
Aislamiento entre dos espacios en cada modelo (prueba generada); host desconocido; cookie de un espacio no válida en otro; preset de cada tipo produce menú y roles esperados; suspensión bloquea escrituras.
