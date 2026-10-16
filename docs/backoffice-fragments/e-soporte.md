# Pieza E: soporte y bitácora

Base: `b0fd0e75f7605825f24f971632a20d153f1a2b18`. Rama `bo/e-soporte`. Issue #101.

## Decisión de seguridad

Se usa la alternativa explícita del issue: `/operador/[institutionId]/vista`. No se suplanta a un administrador ni se cambia el JWT, la membresía, Auth.js, `capabilities` o la sesión del dashboard. La vista muestra las mismas cifras y alertas que el inicio administrador, reutilizando `getAdminHome` y un componente de presentación `ReadOnlyHome` sin enlaces de gestión, formularios de negocio ni callbacks de mutación. No es una reproducción interactiva del dashboard completo.

Cada página y acción consulta `getOperatorEmail()`; cada servicio vuelve a comprobar el allowlist. El formulario exige el nombre completo de la institución. Un ticket aleatorio de 256 bits viaja en cookie HttpOnly, SameSite strict, Secure en producción, limitada a `/operador`. Solo se guarda su SHA-256 como clave primaria de un registro `PLATFORM_SUPPORT_ENTERED`. El ticket no aparece en la bitácora. Cada lectura comprueba la institución, el correo actual, el allowlist actual, el vencimiento y la ausencia de una revocación auditada. El ticket concede únicamente esta lectura; jamás crea un actor aceptable para las acciones del dashboard. Las acciones existentes conservan sus permisos de la sesión original: esta vista no convierte la cuenta del operador en administrador de la institución visitada.

`assertSupportReadOnly` se ejecuta en el único acceso de datos de soporte y rechaza operaciones distintas de lectura. No hay endpoint de escritura de datos institucionales en esta vista. Entrada y salida solo escriben auditoría. Un usuario con permiso propio para editar su institución en otra pestaña conserva ese permiso original; no se crea un modo global que pretenda bloquear toda su sesión. Esta distinción es parte de la alternativa aislada autorizada.

El servidor vence el permiso exactamente a los 30 minutos. La franja persiste arriba, ofrece Salir y oculta el contenido al vencer en un navegador abierto. El servidor registra `PLATFORM_SUPPORT_EXITED` al salir o al comprobar por primera vez un ticket vencido; un cierre de navegador sin otra petición no puede generar un evento posterior, pero el evento de entrada ya conserva la fecha límite. La cookie de sesión puede sobrevivir a los 30 minutos para permitir esa auditoría de vencimiento; nunca amplía el permiso. La revocación usa una clave primaria determinista y una inserción atómica PostgreSQL con conflicto ignorado (`createMany`/`skipDuplicates`); conserva el primer evento incluso ante salidas concurrentes. Un `upsert` Prisma con actualización vacía no garantizaba esto y falló en el CI de ef7c1fb1. Abrir otra vista cierra la anterior.

## Bitácora

`/operador/bitacora` ofrece institución, acción (PLATFORM_* por defecto, todas o exacta), correo de operador y rango inclusivo de fechas UTC. Devuelve 30 registros, solicita 31 para detectar la siguiente página y usa cursor keyset compuesto `(createdAt, id)` descendente. No usa OFFSET, COUNT total ni carga ilimitada. Los nombres de instituciones se resuelven en una sola consulta por página; el filtro ofrece hasta 250 instituciones.

No hay migración. Lecturas del ticket y revocación usan el índice primario existente; la consulta por institución/fecha aprovecha el índice existente `(institutionId, createdAt)`. Filtros globales, JSON/operator y acción no cuentan con índices dedicados existentes: pueden requerir scan/sort, aunque la respuesta siempre es acotada. No se promete que esos filtros sean indexados. Si el volumen real exige índices nuevos, deben aprobarse separadamente.

La UI solo expone operador y metadatos, nunca `changes` completo, IP o agente del navegador. Los enlaces permanecen en el backoffice: institución para entidades institucionales, planes y avisos en sus pantallas. No se generan enlaces al dashboard que accidentalmente usen la institución de la sesión original.

## Ensamblaje reservado al integrador

1. Importar `SupportSection` desde `./SupportSection` en la ficha y renderizar `<SupportSection institutionId={institution.id} />`.
2. Enlazar `/operador/bitacora` en el menú del operador.
3. Añadir una sola entrada `bitacora: "Bitácora"` y `vista: "Soporte de solo lectura"` a `BREADCRUMB_LABELS` si no existen.
4. Incorporar `tests/platform-support.test.ts`, `tests/platform-audit-log.test.ts` y `tests/platform-support-boundaries.test.ts` al script unitario. Los tests PostgreSQL y de fronteras se incluyen automáticamente en el glob de integración.
5. Invocar `supportSmoke(page, institutionId, institutionName, operatorEmail)` de `tests/e2e/smoke/fragments/support.ts` después de login como el operador sembrado. El integrador establece `PLATFORM_OPERATOR_EMAILS` del job y captura la vista/bitácora a 360px y escritorio mediante el harness existente.
6. Mantener el smoke principal y la semilla como escritores únicos del integrador. Esta rama no los modifica.

## Verificación

- 15 pruebas DB-free: ciclo de vida real con repositorio simulado, bloqueo de escritura, token manipulado, otro operador, revocación del allowlist, expiración exacta, cursor/ties, filtros, límites y fronteras de páginas/acciones.
- 5 pruebas PostgreSQL escritas en `tests/integration/platform-support.test.ts`: permisos/confirmación, lectura/aislamiento/salida, expiración, salida concurrente y paginación con fechas idénticas. Se ejecutan solo en la base efímera autorizada del CI; no se han ejecutado localmente ni contra Supabase.
- Tipos y lint focal pasan con Node 22. Build nativo Turbopack PASS. `next build --webpack` compila correctamente y falla después en el chequeo de tipos heredado: `src/app/dashboard/comunidad/page.tsx` exporta `AnnouncementCard`, export no permitido para una página Next 16. La misma exportación existe en la base b0fd0e7; no se modificó por pertenecer a M1. Tras reemplazar el symlink de dependencias por una copia física y limpiar únicamente `.next` de webpack, el build nativo Turbopack pasa completo. El fallo anterior es específico del camino webpack no utilizado por el script del proyecto. No hay migración, cambios de esquema, producción ni merge de base.
- Los 15 casos DB-free también se ejecutan automáticamente desde wrappers propios del glob de integración; el fragmento smoke requiere ensamblaje de la ficha por el integrador.
