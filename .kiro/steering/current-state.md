---
inclusion: always
---
# Edukana — Estado real y decisiones vigentes

Este archivo prevalece sobre cualquier steering o spec que contradiga el código actual o las decisiones aprobadas aquí. El código real es evidencia; las specs DRAFT son objetivos, no implementación existente.


## Coordinación obligatoria

Antes de analizar, editar, migrar, probar o revisar, leer `TEAM-COORDINATION.md` y respetar sus claims activos. Registrar allí el alcance antes de escribir y actualizar estado, evidencia, bloqueos y siguiente paso al terminar.

## Estado del código

- Rama de trabajo: `fix/role-access-hardening`.
- Último commit publicado de la rama: `cff38c6`.
- El código usa `Institution` e `institutionId`; no renombrar a `Tenant`/`tenantId`.
- El usuario actual pertenece directamente a una institución y lleva rol; esto es estado legacy que migrará de forma aditiva.
- Autorización actual: `src/lib/capabilities.ts`, `authorization.ts`, `access.ts`, `course-scope.ts`, `guardian-portal.ts` y políticas de dominio.
- Las páginas y acciones todavía consultan Prisma directamente. Es deuda técnica, no patrón para código nuevo.
- Curso y ejecución concreta son hoy una sola entidad `Course`.
- `ScheduleSlot` solo representa día, hora, docente y aula; no es todavía una sesión pedagógica.
- Storage usa Supabase privado en entornos desplegados y backend local firmado en pruebas aisladas.
- Existen seis migraciones versionadas y un piloto local E2E completo.
- Hay cambios locales aún sin commit: runner E2E Preview, Next.js 16.4 y documentación rectora.

## Decisiones aprobadas

1. **Nombre del tenant:** conservar `Institution`/`institutionId`.
2. **Identidad global:** migrar a `User` global con correo único y `Membership(institutionId, userId, role, status, scope...)`.
3. **Sesión viva:** el JWT llevará identidad y `sessionVersion`; estado, membresía, rol y permisos se releen por petición.
4. **Curso y oferta:** `Course` conserva contenido reusable; `Offering` representa ejecución `COHORT` o `SELF_PACED`, fechas, grupo y precio opcional.
5. **Varios docentes:** `OfferingStaff` asigna titular, asistente o sustituto.
6. **Sesión de clase:** `ClassSession` se materializa desde `MeetingPattern`. Se separan forma de participación (`PRESENTIAL|VIRTUAL|HYBRID`), temporalidad (`SYNCHRONOUS|ASYNCHRONOUS`) y tipo pedagógico (`CLASS|PRACTICE|ASSESSMENT|EVENT`). Guarda ubicación/sala, contenido, cambios, asistencia y grabación.
7. **Clases en vivo:** interfaz `MeetingProvider`; primera implementación `ExternalLink`. BigBlueButton se evalúa según concurrencia y presupuesto. No construir videoconferencia propia.
8. **Video grabado:** interfaz `VideoProvider` con streaming adaptable. Supabase Storage queda para documentos e imágenes; el backend actual se mantiene hasta migrar.
9. **Dinero:** nuevos modelos usan centavos enteros más moneda. Los `Float` actuales se migran con backfill.
10. **Tenant físico:** todo modelo de negocio nuevo lleva `institutionId` e índice que comienza por él.
11. **Capa de datos gradual:** código nuevo en `src/server/data/**` y acciones nuevas en `src/server/actions/**`; lo existente se migra solo al tocar su dominio.
12. **Cobros:** el piloto registra obligaciones, estados, referencias y vías externas. Pasarelas, webhooks y conciliación quedan junto al marketplace.
13. **IA:** se diseña detrás de `AiProvider`; asistente docente primero, revisión humana obligatoria y presupuesto por institución. Se implementa después del núcleo operativo.
14. **Simplicidad:** cada pantalla debe superar el steering `simplicity.md`.
15. **Terminado:** una capacidad requiere recorrido E2E desplegado; pantalla, modelo o prueba por regex no bastan.
16. **Bootstrap:** `/setup` migrará a un token de un solo uso y el runner validará identidad allowlisted de DB/Storage, no solo hostname.
17. **URLs firmadas:** revocar acceso bloquea nuevas autorizaciones; la ventana residual de URLs ya emitidas debe medirse, documentarse y reducirse según sensibilidad.
18. **Historia académica:** preguntas usadas se versionan o inmovilizan; reenvíos, revisiones y cambios de nota conservan actor, motivo y fecha.
19. **Borrado:** archivar es la operación normal; eliminación respeta retención y no destruye evidencia académica sin proceso explícito.

## Bloqueadores antes de 1,600 cuentas

- Revalidación de sesión y suspensión inmediata.
- Rate limiting y recuperación de contraseña.
- PostgreSQL real con dos instituciones en CI.
- Identidad global y membresías.
- Importación CSV idempotente.
- Course/Offering y matrícula masiva.
- Video por streaming.
- Infraestructura comercial con backups, staging y producción separados.

## Reglas de implementación

- Migraciones aditivas con backfill y compatibilidad temporal.
- Nada destructivo, merge o producción sin autorización explícita.
- Toda acción nueva incluye casos: sin permiso, ID de otro usuario e ID de otra institución.
- Las pruebas nuevas ejercitan comportamiento; no leen archivos fuente para afirmar corrección.
- Ningún secreto entra al repositorio, logs o fixtures.
- Un solo escritor por agregado y migración.
- Código nuevo evita archivos mayores de 300 líneas y líneas mayores de 140 caracteres salvo datos inevitables.
- Cada spec se implementa solo después de pasar de DRAFT a READY.

## Puerta de calidad

- Prisma validate y generate.
- Pruebas unitarias e integración real.
- TypeScript y ESLint.
- Build.
- Auditoría de dependencias de producción.
- `git diff --check`.
- Recorrido E2E en Preview limpio.
