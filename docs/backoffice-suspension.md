# Pieza B: suspender y reactivar instituciones

Issue #101. Base de implementación: `b0fd0e75f7605825f24f971632a20d153f1a2b18`.

## Contrato e integración

- Migración aditiva `20261010100000_backoffice_suspension`: enum `InstitutionStatus` ACTIVE/SUSPENDED y columnas `status` (default ACTIVE), `suspendedAt`, `suspendedReason` en la tabla física `institutions`. No escribe datos de negocio ni modifica personas. Schema ensamblado por el integrador, único escritor.
- Ficha: importar `SuspensionSection` de `./SuspensionSection` y montar `<SuspensionSection institutionId={institutionId} />`. La sección revalida `getOperatorEmail()` por sí misma y hace 404 sin permiso. La acción vuelve a validar el operador; jamás acepta su correo desde el formulario.
- Lista compartida: agregar `status` al select y a `OperatorInstitutionRow`. Extender `listInstitutionsForOperator` con un parámetro de estado opcional y combinar su búsqueda existente con `institutionStatusFilter(status)` de `suspension-policy.ts`. Usar AND o spread del objeto, preservando el OR de búsqueda. Renderizar etiqueta «Suspendida» cuando status sea SUSPENDED. Formulario GET con select: todos (vacío), activas (ACTIVE), suspendidas (SUSPENDED). Conservar búsqueda y filtro de independientes al enviar. Esta pieza no edita el listado compartido.
- D: `getInstitutionAccessState(institutionId): Promise<{status: 'ACTIVE'|'SUSPENDED'; name: string}|null>` en `src/server/platform/suspension.ts`. Catálogo y compra deben rechazar null/SUSPENDED. El lector no expone el motivo privado. El integrador conecta y prueba esos guards con D.
- Smoke: `exerciseInstitutionSuspension` en `tests/e2e/smoke/fragments/backoffice-suspension.ts`. El integrador lo llama desde el recorrido con dos páginas ya autenticadas. La institución suspendida debe ser distinta de la del operador. El job/seed debe permitir al operador mediante `PLATFORM_OPERATOR_EMAILS`. Requiere un catálogo disponible (200) antes de suspender. Incluye confirmación incorrecta, suspensión, sesión viva cortada, login rechazado con mensaje, catálogo 404 y reactivación; restaura en finally. Se integra después de B+D. La prueba no se registra de forma autónoma mientras la ficha compartida no está ensamblada.

## Decisiones de seguridad

- No se incrementa `Identity.sessionVersion`: invalidaría también las sesiones legítimas en otras instituciones. `auth()` ya revalida la base por petición; `resolveLiveIdentity()` ahora rechaza además instituciones suspendidas. Se conservan roles, membresías, contraseñas y datos. Una sesión previa vuelve a servir tras reactivar mientras su identidad, membresía y versión sigan vigentes.
- `listActiveMemberships` y `findOwnMembership` excluyen instituciones suspendidas. La entrada global elige una membresía institucional activa; entrar con slug suspendido no salta silenciosamente a otra.
- El nombre y estado de suspensión solo se devuelven tras verificar la contraseña y pertenencia. Contraseña errónea, identidad suspendida, institución ajena y token vencido mantienen respuesta genérica. La razón administrativa nunca se envía al login.
- Un intento con contraseña válida dirigido a una institución pausada no se registra como fallo del limitador, para que varios reintentos no bloqueen la otra membresía.
- La página de login consulta el token firmado y `resolveSessionAccess` para explicar la suspensión al expulsar una sesión existente. El token por sí solo no autoriza acceso.
- Suspender y reactivar requieren escribir el nombre vigente. El motivo es obligatorio al suspender, con máximo 1000 caracteres. El formulario pide no incluir información sensible.
- La transición bloquea la fila de institución y crea AuditLog en la misma transacción. Repetir exactamente el estado actual no duplica auditoría. `changes.operator` usa el correo verificado; antes/después conserva estado/fecha/motivo. Acciones: `PLATFORM_INSTITUTION_SUSPENDED` y `PLATFORM_INSTITUTION_REACTIVATED`.
- Para la métrica A, cada login exitoso registra `LOGIN_SUCCEEDED` con institutionId/userId/entity User/entityId y changes vacío, sin correo/IP/contraseña. La falta de ese evento histórico no prueba que un administrador nunca entró antes de este despliegue.
- Un operador cuya única institución sea suspendida también pierde esa sesión. Probar con un operador de otra institución; no existe un bypass de suspensión para operadores.

## Comprobaciones propias

- `node --require ./tests/integration/stub-server-only.cjs --import tsx --test tests/backoffice-suspension*.test.ts`: 13 casos, validación, filtro, mensajes Unicode, página/acción no operador, correo forjado, confirmación, auditoría, idempotencia y reactivación.
- `tests/integration/backoffice-suspension-boundaries.test.ts` incorpora esos casos al glob CI sin cambiar package.json.
- `tests/integration/backoffice-suspension.test.ts`: 14 casos PostgreSQL reales con instituciones exclusivas de la suite; permisos, datos preservados, login, sesión viva, otra membresía, no filtración, selector, restauración y doble envío concurrente. Requiere la base desechable y guardia `ensureSeed`; no ejecutarlo en Supabase/staging/producción.

## Verificación local (2026-10-09)

Node 22: 137/137 pruebas base + 13/13 propias (también su entrypoint CI), Prisma validate/generate, TypeScript, ESLint completo, build Next y audit producción (0 vulnerabilidades) PASS. Las 14 pruebas PostgreSQL y el recorrido ensamblado están pendientes de CI. No se contactó base externa ni se ejecutó migración en staging/producción.
