---
inclusion: always
---
# Edukana — Tecnología y reglas de arquitectura

`current-state.md` describe el estado real y prevalece ante contradicciones. Este archivo define el patrón para código nuevo y la migración gradual de lo existente.

## Stack

Next.js 16.4 App Router, React 19, TypeScript estricto, Prisma 5, PostgreSQL/Supabase, Auth.js v5, Supabase Storage privado, Zod 4, Tailwind 4, react-hook-form, lucide-react, `node:test` y Playwright Test.

## Arquitectura existente

- `src/proxy.ts` redirige por autenticación; no resuelve tenants ni autoriza recursos.
- El tenant actual es `Institution`/`institutionId` y procede de la sesión.
- Capabilities: `src/lib/capabilities.ts` y `authorization.ts`.
- Alcance de curso: `src/lib/course-scope.ts`.
- Páginas y acciones todavía importan Prisma directamente.
- No existen aún `getRequestContext`, `src/server/data`, RLS ni resolución por dominio.

## Reglas obligatorias para código nuevo

1. **Denegar por defecto.** Cada página, acción, API y función de datos declara capability y alcance.
2. **Tenant físico.** Todo modelo de negocio nuevo lleva `institutionId` e índice que comienza por él.
3. **Contexto vivo.** Construir `getRequestContext()` memoizado por petición con usuario, membresía activa, capabilities y `sessionVersion`.
4. **Autorización central.** Evolucionar hacia `can(ctx, permission, resource?)`; mientras tanto reutilizar las políticas centrales existentes.
5. **DAL gradual.** Código nuevo consulta Prisma desde `src/server/data/**`; acciones nuevas viven en `src/server/actions/**`.
6. **Server Action:** contexto → permiso → Zod → propiedad/tenant de cada ID → transacción → auditoría → revalidación → resultado tipado.
7. **Pruebas reales.** Toda acción nueva incluye Postgres con: sin permiso, ID de otro usuario e ID de otra institución.
8. **Dinero.** Centavos enteros más moneda; migrar `Float` con backfill.
9. **Fechas.** UTC en persistencia y zona de la institución al presentar; fechas civiles usan tipo `DATE`.
10. **Archivos.** Privados, prefijo `{institutionId}/`, confirmación de MIME/tamaño y URL firmada tras autorización.
11. **Integraciones.** Interfaces `MeetingProvider`, `VideoProvider`, `EmailProvider` y `AiProvider`; secretos solo en servidor.
12. **Jobs.** Operaciones masivas, correo, imports y webhooks serán idempotentes, reintentables y observables.
13. **Tema e idioma.** Migrar gradualmente colores y cadenas hacia branding/terminología configurables.
14. **Accesibilidad y simplicidad.** Seguir `simplicity.md`; objetivo WCAG 2.2 AA y móvil primero.
15. **Tamaño.** Código nuevo evita archivos >300 líneas y líneas >140 caracteres; dividir por agregado y pantalla.

## Objetivos posteriores, no supuestos actuales

- Resolución de institución por subdominio o dominio verificado.
- Consola separada del operador.
- Registro tipado de settings y módulos.
- RLS como segunda barrera después de diseñar pool y contexto transaccional.
- Cifrado de secretos por institución.
- Marca blanca y traducción integral.

## Deuda verificada en `cff38c6`

- JWT conserva rol/institución y no revalida suspensión por petición.
- Login sin rate limit ni recuperación.
- CI no levanta PostgreSQL; muchas pruebas inspeccionan texto fuente.
- Examen almacena duración pero no aplica `expiresAt` autoritativo.
- Modelos académicos carecen de `institutionId` físico en varios agregados.
- Dinero usa `Float`; `PaymentConcept.studentId` no tiene FK.
- Una asistencia por curso/día, una entrega por tarea/estudiante y un docente por curso.
- Página del curso y acciones académicas demasiado concentradas.
- No existe alta de múltiples instituciones ni identidad global.
- Sin importación masiva ni correo.
- Video MP4/WebM directo sin streaming adaptable.
- Restos Alpha documentados en `docs/legacy-cleanup.md`.

## Definición de terminado

- Comportamiento probado contra Postgres, no por regex de código.
- Matriz permiso × rol × tenant × estado.
- Estados vacío, cargando, error, sin permiso y solo lectura.
- Auditoría sensible y observabilidad.
- Simplicidad móvil verificada.
- Recorrido E2E en Preview desplegado.
