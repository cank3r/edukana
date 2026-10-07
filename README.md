# Edukana

> La educación evoluciona. Tú también.

MVP académico multiinstitución de Cerkana, construido en español con la identidad visual oficial de Edukana. Replica el flujo de aprendizaje por secciones y lecciones, no el diseño ni código de otras plataformas.

## Capacidades del MVP real

1. **Asistencia:** captura por curso y fecha, estados por estudiante y reportes acumulados.
2. **Libro de calificaciones:** períodos, categorías ponderadas, descarte de notas bajas, elementos publicables y vista del estudiante.
3. **Asignaciones:** instrucciones, vencimiento, entrega, archivos privados, revisión, retroalimentación y puntuación.
4. **Exámenes:** banco reutilizable, selección múltiple, verdadero/falso, respuesta corta, intentos, autocalificación y revisión manual.
5. **Horarios:** vista institucional y por curso con docente, aula y hora; bloquea solapamientos de docente o aula.
6. **Certificados:** emisión al completar el curso, código público, hash firmado, revocación soportada y verificación HTML/JSON.
7. **Documentos:** carga validada a bucket privado y recuperación con autorización más URL firmada de 5 minutos.
8. **Video:** carga MP4/WebM privada y reproducción HTML5 autorizada.
9. **Ruta de aprendizaje:** curso > secciones > lecciones ordenadas (texto, video, documento, actividad), con progreso individual.

Todas las entidades sensibles conservan `institutionId`. Las consultas y mutaciones vuelven a comprobar institución, rol, docencia, matrícula o propiedad del recurso; una página visible no se considera autorización suficiente.

## Stack e infraestructura sin costo obligatorio

- Next.js 16.3 (App Router), React 19, TypeScript y Tailwind CSS 4.
- Auth.js v5 con credenciales, JWT, tenant y RBAC.
- Prisma 5 y PostgreSQL en Supabase Free.
- Supabase Storage Free con bucket **privado**. La aplicación usa su API REST desde el servidor, sin SDK adicional.
- Vercel Hobby o cualquier host Node.js compatible.

No se guardan archivos en el filesystem efímero del host y ninguna clave se expone con `NEXT_PUBLIC_`.

## Instalación local

Requisitos: Node.js 22, npm y un proyecto Supabase/PostgreSQL.

```powershell
npm ci
Copy-Item .env.example .env
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Completa el archivo local de entorno sin confirmarlo en Git. En una base vacía, abre `/setup` y crea la primera institución y su administrador desde la interfaz; la ruta se cierra automáticamente después. Continúa con **Configuración → Puesta en marcha del piloto**. El recorrido completo y sus resultados esperados están en `docs/canonical-mvp-pilot.md`.

El seed queda disponible únicamente para desarrollo opcional; no forma parte del caso canónico ni de su definición de terminado.

## Base de datos

- `DATABASE_URL`: Transaction Pooler de Supabase (`pgbouncer=true&connection_limit=1`) para runtime.
- `DIRECT_URL`: conexión directa o Session Pooler para migraciones.
- La migración versionada está en `C:\Users\crami\workspace\edukana\prisma\migrations\20261001193000_real_edukana_mvp\migration.sql`.
- Producción usa `npx prisma migrate deploy`; nunca `db push` con pérdida de datos.

## Storage privado

1. Ejecuta `npx prisma migrate deploy`: en Supabase, la migración crea o endurece automáticamente el bucket privado `edukana` con los MIME y límites del MVP.
2. Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` solo en el servidor.
3. No hagas público el bucket. `POST /api/assets` autoriza usuario, tenant, curso y recurso; luego emite una URL firmada específica.
4. El navegador sube directamente a Supabase, evitando el límite de 4.5 MB de Vercel Functions. `PATCH /api/assets/:id` confirma tamaño y MIME en Storage.
5. `GET /api/assets/:id` autoriza de nuevo y redirige a una URL firmada de lectura por 5 minutos.

Límites MVP: documentos PDF/DOCX/PPTX/TXT hasta 20 MB; videos MP4/WebM hasta 100 MB. El registro conserva MIME, tamaño, SHA-256, cargador, tenant y ruta con prefijo de tenant.

## Demo sembrada opcional

Esta demo acelera desarrollo, pero no valida el caso canónico desde cero. Define `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD` y `SEED_STUDENT_PASSWORD`, ejecuta `npm run db:seed` y usa:

- `admin@demo.edukana`: administración y emisión de certificados.
- `docente@demo.edukana`: asistencia, contenidos, asignaciones, notas, banco, exámenes y horario.
- `estudiante@demo.edukana`: ruta, progreso, entregas, intentos, notas publicadas y certificado.

Las contraseñas son exclusivamente las que configuraste. Curso demo: **MAT-101 Matemática I**. Certificado demo (si existe `CERTIFICATE_SECRET` o `AUTH_SECRET`): `/certificados/EDU-DEMO2026A`; registro de máquina: `/api/certificados/EDU-DEMO2026A`.

## Validación

```powershell
npx prisma validate
npx prisma generate
npm test
npm run test:auth
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
git diff --check origin/master...HEAD
```

CircleCI ejecuta la misma puerta de calidad. Los tests cubren RBAC/rutas, ponderación, conflictos, respuestas objetivas, progreso, certificados, cargas y presencia de todas las entidades multi-tenant.

## Variables

Consulta `C:\Users\crami\workspace\edukana\.env.example`. Son secretas: conexiones, `AUTH_SECRET`, `CERTIFICATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` y contraseñas de seed. No confirmes archivos `.env*`.

## Roles y permisos institucionales

La fuente única de capacidades está en `src/lib/capabilities.ts`: catálogo tipado, defaults, límites por rol y cálculo efectivo. Los overrides se guardan por `(institutionId, role, capability)`; nunca hay configuración global. Cada fila conserva `updatedById`, `createdAt` y `updatedAt`, y cada guardado agrega un `AuditLog` con el antes/después.

Matriz de protección:

| Regla | Garantía |
| --- | --- |
| Denegación por defecto | Capacidades desconocidas o no permitidas para el rol no se conceden. |
| SUPER_ADMIN | Es inmutable y conserva todo el catálogo del sistema. |
| ADMIN | Solo SUPER_ADMIN puede editarlo; `tenant.settings.manage` y `roles.permissions.manage` no se pueden retirar. |
| No escalamiento | El actor solo puede conceder o revocar capacidades que posee y que el rol objetivo admite; cada petición contiene deltas explícitos y el servidor preserva intactas las capacidades fuera de su autoridad. |
| Límites de rol | Los límites de `ROLE_ALLOWED_CAPABILITIES` son reglas de producto no ampliables desde el backoffice. COORDINATOR puede recibir `analytics.view`, pero `finance.manage` está prohibido incluso ante overrides antiguos o manipulados. |
| PARENT | Solo admite capacidades `child.*`; cada dato exige además vínculo ACTIVE del mismo tenant y bandera específica. No obtiene catálogo, roster, personas ni administración institucional. |
| Multi-tenant | La institución se deriva de la sesión y todas las lecturas/escrituras filtran por `institutionId`. |
| Self-lockout | La política rechaza retirar al actor su capacidad de administrar permisos. |

`src/proxy.ts` solo hace la comprobación optimista de autenticación. Next.js 16 no recomienda Proxy como autorización completa y ese runtime no consulta Prisma: los overrides pueden cambiar sin renovar el JWT. La validación autoritativa se ejecuta en páginas, Route Handlers y Server Actions mediante `src/lib/authorization.ts`. La UI recibe únicamente la lista efectiva ya resuelta para navegación; nunca se considera una frontera de seguridad.

La migración local `prisma/migrations/20261003231500_role_capability_overrides/migration.sql` crea la tabla, índices y claves foráneas. Debe revisarse y aplicarse por el flujo normal de migraciones; este cambio no la aplica a ninguna base remota.

## Guardianship y portal de tutores

`Guardianship` es una relación institucional explícita entre un usuario `PARENT` y uno `STUDENT`. Nace siempre en `PENDING`; el esquema inicia todas las banderas en `false` y un administrador puede prepararlas sin conceder acceso. Solo una acción administrativa separada puede pasarla a `ACTIVE`. Activación, cambios de banderas y revocación generan `AuditLog` con estado anterior/posterior y actor. Revocar cambia el estado a `REVOKED`, registra `revokedAt` y corta inmediatamente las consultas del portal. La revocación es terminal en este MVP: la restricción única impide recrear el mismo vínculo y no existe reactivación automática; una reautorización futura requiere un flujo explícito y auditado.

Cada bandera se mapea centralmente a su capability `child.*.view`. El manager solo puede crear, conceder, revocar o activar banderas cuyas capabilities posee; los cambios usan deltas explícitos para preservar áreas fuera de su autoridad. Revocar el vínculo completo sigue permitido con `guardianship.manage` porque reduce acceso. Actualización, activación y revocación usan compare-and-set con tenant, estado, `updatedAt` y una versión monotónica; si otra transacción ganó la carrera, no sobrescriben y solicitan recargar.

La base de datos mantiene claves foráneas individuales e índices por tenant/padre/estudiante, pero PostgreSQL no expresa aquí que ambos usuarios compartan el `institutionId` de la relación. Por eso cada acción vuelve a leer dentro de la misma transacción al tutor con rol `PARENT` y al estudiante con rol `STUDENT`, ambos activos y filtrados por el tenant derivado de la sesión. El cliente nunca decide `institutionId`, `parentId` de la sesión ni identidad por nombre/correo.

Las capacidades institucionales `child.*.view` solo habilitan módulos. Cada consulta exige además vínculo `ACTIVE`, padre de sesión, estudiante solicitado, mismo tenant y la bandera equivalente del vínculo. Finanzas requiere simultáneamente `child.finance.view` y `canViewFinance`; ambos valores son `false` por defecto. Sin vínculos activos, “Mis hijos” devuelve un estado vacío y no consulta datos institucionales del estudiante.

Las migraciones aditivas deben aplicarse en este orden: primero `prisma/migrations/20261003231500_role_capability_overrides/migration.sql` y después `prisma/migrations/20261003234000_guardianship/migration.sql`. Deben probarse en una base local o staging antes de cualquier despliegue.

El alcance de cursos se resuelve centralmente en `src/lib/course-scope.ts`. `course.view` conserva el alcance natural: STUDENT solo matrículas propias, TEACHER solo cursos asignados y PARENT ninguno. `course.view.all` amplía la lectura a todos los cursos del tenant, excepto STUDENT y PARENT. Para otros roles sin alcance natural seguro, `course.view` sin `course.view.all` devuelve cero cursos y deniega detalles. La escritura se calcula por separado: TEACHER solo gestiona cursos asignados aunque tenga lectura global; conceder únicamente lectura nunca amplía mutaciones ni acceso a archivos privados.
