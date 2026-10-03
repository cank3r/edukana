---
inclusion: always
---
# Edukana — Tecnología y reglas de arquitectura

## Stack (no cambiar)
Next.js 16 App Router (Server Components, Server Actions, `src/proxy.ts`), React 19, TypeScript estricto, Prisma 5 + PostgreSQL (Supabase), Auth.js v5 (JWT), Supabase Storage privado, Zod 4, Tailwind 4, react-hook-form, lucide-react. Pruebas: `node:test` + Playwright.

## Reglas obligatorias
1. **Resolución de tenant por host.** `src/proxy.ts` resuelve el espacio por `Host` (subdominio o dominio propio verificado) y lo pasa por cabecera interna `x-tenant-id`. `app.edukana.com` es la consola de plataforma. Un host desconocido responde 404.
2. **Contexto de petición.** `getRequestContext()` devuelve `{ tenant, user, membership, permissions, settings, terminology }`, memoizado por petición con `cache()`.
3. **Denegar por defecto.** Cada ruta, acción y función de datos declara el permiso que exige. Sin declaración: 404 o error.
4. **Autorización única:** `can(ctx, permission, resource?) → { allowed, reason }`. La misma función alimenta navegación, páginas, acciones, API y componentes.
5. **Capa de datos (DAL)** en `src/server/data/**`. Solo el DAL importa Prisma. Devuelve view models mínimos por rol. Las páginas y acciones nunca llaman a `db` directamente.
6. **Aislamiento de datos:** todo modelo de negocio tiene `tenantId`. Cliente Prisma extendido que inyecta `tenantId` en lecturas y escrituras. Row Level Security en Postgres como segunda barrera (`SET LOCAL app.tenant_id`). Cliente de plataforma separado y explícito para consultas entre espacios.
7. **Server Actions:** `"use server"` → `getRequestContext` → `can` → Zod → verificar propiedad de cada ID → transacción → auditoría → `revalidatePath` → `{ ok, message, fieldErrors? }`. Prohibido `catch {}` vacío; registrar con ID de correlación.
8. **Configuración tipada:** todo parámetro vive en el registro de `src/server/settings/registry.ts` con clave, tipo Zod, valor por defecto por tipo de espacio, permiso de edición y si el plan lo permite. Nada de constantes de negocio en el código.
9. **Módulos y límites:** `hasModule(ctx, 'finance')` y `checkLimit(ctx, 'students')` antes de mostrar o ejecutar.
10. **Trabajo en segundo plano:** tabla `Job` + worker por cron (correo, WhatsApp, PDF, importaciones, recordatorios, webhooks, cierre de intentos). Idempotente y con reintentos.
11. **Dinero** en enteros (centavos) + moneda. **Fechas** en UTC; mostrar en zona horaria del espacio.
12. **Archivos:** bucket privado, ruta `{tenantId}/...`, URL firmada de 5 minutos emitida solo tras `can()`.
13. **Secretos del espacio** (pasarela, SMTP, WhatsApp, OAuth) cifrados con AES-256-GCM y clave de entorno; nunca se devuelven al cliente.
14. **Tema:** variables CSS generadas desde `tenant.branding`; ningún color de marca fijo en componentes.
15. **Texto:** toda cadena visible pasa por `t()` con terminología del espacio. Español por defecto, inglés opcional.
16. **Sesión:** JWT con `userId` y `sessionVersion`; rol y permisos se cargan por petición desde la membresía, no del token.
17. **Accesibilidad:** WCAG 2.1 AA. Móvil primero.

## Definición de terminado
- Matriz automatizada permiso × rol × tipo de espacio para la feature.
- Pruebas de URL directa, ID de otro espacio e ID de otro usuario.
- Estados vacío, cargando, error y solo lectura.
- Parámetros nuevos registrados en el registro de configuración con su pantalla.
- Auditoría de las acciones sensibles.
- Sin lectura de archivos fuente con expresiones regulares como "prueba".

## Deuda actual que debe eliminarse (commit 3bfa7c7)
- `access.ts` permite rutas no listadas.
- `aula/[courseId]/page.tsx` carga todo para todos los roles.
- `markLessonComplete` cambia la matrícula a COMPLETED y bloquea entregas y exámenes.
- `User.institutionId` y `User.role` fijos; login falla con correo en dos instituciones.
- Sin creación de usuarios, cursos, matrículas, períodos ni eventos en la interfaz.
- Examen sin inicio ni temporizador en servidor; nota del último intento.
- `AuditLog` sin uso; errores silenciados; totales de pagos mezclan monedas.
- `CourseModule` duplicado de `CourseSection`/`Lesson`; `Assignment` sin tenant.
