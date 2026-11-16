# 00 · Límite institucional confiable y autorización de petición — Diseño

**Estado:** DRAFT-CANDIDATE
**Base autoritativa auditada:** `21b6b71ab166d7bfbad23d9c43a829f7afc17354` (`origin/todo/tanda-4`)
**Fecha de evidencia:** 2026-11-15
**Implementación:** prohibida hasta una transición humana y separada a READY.

## 1. Objetivo arquitectónico

Una petición solo alcanza datos institucionales cuando todas las capas derivan la misma decisión de una autoridad
confiable. La autenticación establece prerrequisitos; la autorización funcional sigue el orden vinculante:

```text
HostAuthority → GlobalUser vivo → Membership viva
  → Institution activa → módulo/plan → capability → scope → relación → estado → política de operación
```

La misma decisión se aplica a navegación, página, action, API, job, DAL, constraint y RLS. RLS es una segunda barrera;
no sustituye minimización, relación con el recurso ni autorización funcional.

Se conserva `Institution`/`institutionId`. Course/Offering, ClassSession y ciclos de aula quedan fuera. Las specs 01, 02,
03 y 15 continúan DRAFT y deben reconciliarse con la tabla de `requirements.md` §5 antes de READY.

## 2. Evidencia y límites de certeza

### 2.1 Hechos verificados en la base

- `resolveInstitutionHost()` representa plataforma y desconocido con `null`.
- `institutionMatchesHost()` acepta cualquier Institution cuando recibe `null`.
- Credentials acepta `institutionSlug` del cliente cuando no hay host resuelto.
- `/api/auth/session` exporta handlers de Auth.js; `auth()` llama `resolveLiveIdentity()` por otra ruta.
- `canAccessDashboardPath()` permite rutas sin entrada.
- `src/lib/db.ts` contiene un único `PrismaClient` sin tenant context.
- No existen `src/server/context.ts`, `src/server/authz/permissions.ts` ni `src/server/data/**`.
- Varias tablas permiten `institutionId` nulo y `CourseModule` no tiene la columna.
- `User` representa pertenencia legacy con un rol y unicidad `(institutionId, identityId)`.
- No existe RLS ni `SET LOCAL app.institution_id` versionado.
- `20261008160000_s1_security` anuncia una migración `s1_security_enforce` inexistente.
- Los runners inspeccionados prueban bases limpias; `assertEmpty()` rechaza una base poblada.
- PR #129 no cambia schema, migraciones, auth ni `src/server`.

### 2.2 Inferencias y desconocidos

- La compatibilidad de Prisma con el pooler desplegado requiere prueba en la configuración exacta.
- Roles, ownership, grants y policies fuera del repositorio requieren inventario read-only autorizado.
- Nulls, huérfanos y grafos cross-tenant de datos desplegados no se asumen ausentes.
- El ID histórico de adjunto en PR #129 sigue siendo una hipótesis hasta reproducirlo contra backend real.
- La topología de proxy y el hop que posee la autoridad de host no están demostrados en el repositorio.

## 3. Estado de coordinación

- La fila `SPEC00-TRUSTED-BOUNDARY-20261115` fue publicada primero en la rama de propuesta mediante
  `fa060c57aba48ca9668f617af1751a823bd1cfc4`.
- Ese commit **no** es ancestro de `origin/todo/tanda-4`; un escritor que consulte solo la rama autoritativa no ve la
  reserva. Por ello G0 está **PENDIENTE**, no satisfecho.
- La asignación del 2026-11-15 autoriza la revisión documental y un PR DRAFT en esta rama aislada, pero no autoriza
  modificar la rama base, implementar ni promover a READY.
- Antes de READY, un coordinador debe publicar la reserva por el mecanismo autoritativo o documentar una excepción
  trazable que haga visible el alcance a escritores competidores.

## 4. Registro de decisiones

### 4.1 Decisiones aprobadas por steering

| ID | Decisión | Autoridad | Compatibilidad / rollback |
|---|---|---|---|
| AD-01 | Conservar `Institution`/`institutionId`. | `current-state.md`. | Evita rename; no requiere rollback. |
| AD-02 | Identidad global y Membership separada. | `current-state.md`; detalle físico aún abierto. | Expand/backfill/dual contract antes de retirar legacy. |
| AD-03 | Sesión viva con `sessionVersion` y relectura por petición. | `current-state.md`. | Adaptador temporal; no se vuelve a claims stale como autoridad. |
| AD-04 | Deny-by-default y DAL gradual para código nuevo. | `tech.md`. | Activación por dominio con paridad y evidencia. |
| AD-05 | Todo modelo de negocio nuevo tiene `institutionId` y acceso tenant-first. | `current-state.md`. | Constraints staged; excepciones solo por allowlist. |
| AD-06 | PostgreSQL real y negativas de permiso/propiedad/tenant. | `tech.md`, `spec-governance.md`. | El harness no cambia datos desplegados. |
| AD-07 | Archivar y retener antes que borrar evidencia académica. | `current-state.md`. | Purge requiere contrato y aprobación separados. |
| AD-08 | WCAG 2.2 AA y simplicidad móvil. | `tech.md`, `simplicity.md`. | Specs DRAFT vecinas deben reconciliarse. |

### 4.2 Propuestas CANDIDATE, no decisiones aprobadas

| ID | Propuesta candidata | Alternativas | Decisión humana | Efecto si se rechaza |
|---|---|---|---|---|
| CD-01 | Host authority `PLATFORM/TENANT/UNKNOWN`. | Ambigüedad `null`; slug cliente. | `HD-02/HD-26`. | Regenerar contrato y pruebas; no implementar fallback abierto. |
| CD-02 | Resolver preauth mediante función estrecha `SECURITY DEFINER`. | Vista redactada; servicio de control-plane. | `HD-09/HD-11`. | Elegir otro bootstrap con grants y oráculos equivalentes. |
| CD-03 | Una Membership y varias asignaciones tenant. | Varias Membership por rol. | `HD-05`. | Sustituir modelo, fixtures y FKs antes de READY. |
| CD-04 | Plantillas globales separadas de roles tenant instanciados. | Tabla única con partial indexes/XOR. | `HD-05/HD-07`. | Elegir diseño único y actualizarlos en todo el paquete. |
| CD-05 | Scope canónico con targets tipados y FK explícitas. | Tablas por tipo; columnas tipadas directas en assignment. | `HD-06`. | Conservar integridad equivalente; no usar FK polimórfica. |
| CD-06 | Rol app no-owner/NOBYPASSRLS y `app.institution_id` local. | Otro nombre/patrón probado. | `HD-09/HD-10/HD-11`. | No activar RLS hasta demostrar alternativa. |
| CD-07 | Signup independiente default-off. | Habilitación futura con controles. | `HD-03`. | Solo contrato futuro revisado puede habilitar. |
| CD-08 | Revocación en primera petición fresca. | Ventana stale medida. | `HD-04`. | Tests usan el valor aprobado, nunca uno inferido. |
| CD-09 | Suspensión: writes bloqueadas; mínimo provisional cerrado. | Matriz read/export distinta. | `HD-25`. | Regenerar matriz, UI y RLS antes de READY. |
| CD-10 | Cookies host-only y ticket one-use ≤ 60 s. | Sesión cross-subdomain. | `HD-01/HD-26`. | Rehacer threat model de CSRF/fixation antes de implementar. |

Una propuesta CANDIDATE no puede aparecer como decisión “resuelta”. Al cerrar un `HD-*`, se registra opción, autoridad,
fecha, compatibilidad y rollback; después se actualizan los tres documentos y los revisores evalúan esos valores.

## 5. Decisiones humanas abiertas que bloquean READY

| ID | Decisión requerida | Evidencia/resultado que debe registrarse |
|---|---|---|
| HD-01 | ¿La raíz de plataforma acepta sesión tenant y qué datos mínimos muestra? | Campos permitidos, cookie/ticket, UX y negativas. |
| HD-02 | ¿Todo host no asignado/revocado devuelve 404 antes de auth/data? | Casos routed-obsolete, cache y canonicalización. |
| HD-03 | ¿Se autoriza signup independiente? | Feature/plan, verificación, antiabuso, cuota y default-off. |
| HD-04 | ¿Cuál es el plazo de revocación, incluido `/api/auth/session`? | Valor medido y riesgo aceptado si no es primera petición. |
| HD-05 | ¿Cuál es el modelo físico Membership/roles? | Una representación enforceable, migración y selección activa. |
| HD-06 | ¿Qué scopes exige el piloto y qué roles son institution-wide? | Lista cerrada y matriz por rol. |
| HD-07 | ¿Qué tablas son globales y qué hijos reciben `institutionId`? | Allowlist cerrada con justificación y grants. |
| HD-08 | ¿Toda relación tenant exige FK compuesta? | Excepciones con integridad equivalente y pruebas. |
| HD-09 | ¿Cuáles roles, grants, ownership e inheritance existen? | Inventario por entorno, incluido `rolbypassrls`. |
| HD-10 | ¿Prisma/pooler soportan el patrón transaction-local? | Prueba concurrente exacta sin fuga. |
| HD-11 | ¿Qué tablas usan FORCE RLS y qué paths excepcionales existen? | Manifest y autoridad de cada excepción. |
| HD-12 | ¿Cuál es la normalización/unicidad de email? | Unicode, colisiones y mecanismo DB. |
| HD-13 | ¿Qué predecesores poblados se soportan? | SHAs/migrations y fixture por estado. |
| HD-14 | ¿Qué budgets de lock/timeout/lote/write-pause aplican? | Valores por entorno. |
| HD-15 | ¿Qué versiones coexisten y cuándo termina rollback? | Matriz N/N-1, duración y evento de cutover. |
| HD-16 | ¿Qué retención, cancelación, purge y legal hold aplican? | Política por clase de datos y archivos. |
| HD-17 | ¿Cómo se autoriza plataforma e impersonación? | Roles/allowlist, TTL, motivo, banner y operaciones. |
| HD-18 | ¿RLS completo es obligatorio antes del piloto? | Cualquier excepción con risk owner y vencimiento. |
| HD-19 | ¿Qué protección, checks, approvals y bypass se exigen? | Mecanismo enforceable y auditoría. |
| HD-20 | ¿Qué SLO/alertas/retención/redacción gatean aceptación? | Umbrales sobre semántica de SLI definida. |
| HD-21 | ¿Qué RPO/RTO y autoridad de restore/rollback se aceptan? | Umbrales y aprobador. |
| HD-22 | ¿Qué preproducción, bucket, tenant y operador están autorizados? | Identidades exactas sin secretos. |
| HD-23 | ¿Qué browser/OS/AT exige aceptación? | Matriz humana además de automatización. |
| HD-24 | ¿Quién autoriza READY, implementación, merge, migración, deploy y release? | Una autoridad por transición. |
| HD-25 | ¿Qué actores/operaciones leen o exportan en SUSPENDED/CANCELLED? | Matriz separada de archive y de retención `HD-16`. |
| HD-26 | ¿Cuál es la topología proxy/host confiable? | Header exacto, hop count, allowlist, contradicción y entorno. |

## 6. Dependencias y gate READY

```text
G0 claim visible en coordinación autoritativa o excepción trazable
  → F0 paquete DRAFT-CANDIDATE
      → E0 inventario read-only autorizado y pruebas de viabilidad sin mutación
          → H0 HD-01..HD-26 cerradas
              → F1 revisiones independientes sobre decisiones cerradas
                  → READY transición humana separada
                      → I0 frontera app y harness
                      → O0 evidencia/operaciones
I0 → D0 expand/backfill/roles/RLS
I0 + D0 → A0 spec S3 Course/Offering
A0 → C0 spec S4 ClassSession
A0 + C0 → L0 ciclos de aula
D0 + L0 + O0 → Q0 release evidence
Q0 → P0 aceptación preproducción exact-SHA
P0 → R0 revisión/release humana
```

- F0 puede iterarse en la rama documental autorizada, pero no puede superar G0.
- E0 solo contiene lectura autorizada y evidencia redactada. Puede resolver `HD-09/10/13/14/21/22` sin escribir datos.
- F1 sucede después de H0 para que los revisores evalúen elecciones reales, no placeholders.
- READY es un nodo explícito y prerrequisito de todo harness, código, DDL, migración o configuración.

## 7. Modelo de datos candidato y enforceable

El modelo es CANDIDATE hasta cerrar `HD-05..HD-08`. Su propósito es demostrar que existe una opción físicamente
implementable; no autoriza schema ni migración.

### 7.1 Identidad, membership y roles

```text
GlobalUser
  id PK
  canonicalEmail UNIQUE (mecanismo HD-12)
  passwordHash nullable
  sessionVersion integer NOT NULL
  status ACTIVE|SUSPENDED|DELETED
  createdAt, updatedAt

Membership
  id PK
  institutionId NOT NULL FK Institution
  globalUserId NOT NULL FK GlobalUser
  status INVITED|ACTIVE|SUSPENDED|LEFT
  version integer NOT NULL
  createdAt, updatedAt, endedAt nullable
  UNIQUE (institutionId, globalUserId)
  UNIQUE (institutionId, id)
  INDEX (institutionId, status, globalUserId)

SystemRoleTemplate
  id PK
  key UNIQUE
  institutionType
  status ACTIVE|ARCHIVED
  -- no assignment FK points directly here

InstitutionRole
  id PK
  institutionId NOT NULL
  key NOT NULL
  name
  sourceTemplateId nullable FK SystemRoleTemplate
  status ACTIVE|ARCHIVED
  UNIQUE (institutionId, id)
  UNIQUE (institutionId, key)
  INDEX (institutionId, status, key)

PermissionDefinition
  key PK
  module nullable
  sensitivity

InstitutionRolePermission
  institutionId NOT NULL
  institutionRoleId NOT NULL
  permissionKey NOT NULL FK PermissionDefinition
  PRIMARY KEY (institutionId, institutionRoleId, permissionKey)
  FK (institutionId, institutionRoleId) → InstitutionRole(institutionId, id)
```

Separar plantillas evita la ambigüedad de `UNIQUE(NULL,key)` y evita asignar una plantilla global como si fuera rol tenant.
Una alternativa de tabla única tendría que usar partial unique indexes separados y XOR constraints, pero no puede mezclarse
con esta opción en un contrato READY.

### 7.2 Scope tipado

```text
AuthorizationScope
  id PK
  institutionId NOT NULL
  type INSTITUTION|CAMPUS|UNIT|PROGRAM|GROUP|OFFERING
  institutionTargetId nullable
  campusId nullable
  unitId nullable
  programId nullable
  groupId nullable
  offeringId nullable
  UNIQUE (institutionId, id)
  CHECK exactamente un target no nulo
  CHECK type coincide con la columna target
  CHECK type=INSTITUTION implica institutionTargetId=institutionId
  FK (institutionId, campusId) → Campus(institutionId,id)
  FK (institutionId, unitId) → OrganizationalUnit(institutionId,id)
  FK (institutionId, programId) → Program(institutionId,id)
  FK (institutionId, groupId) → StudentGroup(institutionId,id)
  FK (institutionId, offeringId) → Offering(institutionId,id)

MembershipRoleAssignment
  id PK
  institutionId NOT NULL
  membershipId NOT NULL
  institutionRoleId NOT NULL
  authorizationScopeId NOT NULL
  status ACTIVE|SUSPENDED|ENDED
  version integer NOT NULL
  validFrom, validUntil nullable
  UNIQUE (membershipId, institutionRoleId, authorizationScopeId)
  UNIQUE (institutionId, id)
  FK (institutionId,membershipId) → Membership(institutionId,id)
  FK (institutionId,institutionRoleId) → InstitutionRole(institutionId,id)
  FK (institutionId,authorizationScopeId) → AuthorizationScope(institutionId,id)
  INDEX (institutionId,membershipId,status)
  INDEX (institutionId,institutionRoleId,status)
```

No existe `scopeId` polimórfico sin FK. Si `HD-06` elige tablas de assignment por scope, deben ofrecer las mismas pruebas
cross-tenant y exactly-one.

### 7.3 Dominio, plataforma y auditoría

```text
InstitutionDomain
  id PK
  institutionId NOT NULL
  hostCanonical UNIQUE NOT NULL
  canonicalDomainId nullable
  kind SUBDOMAIN|CUSTOM
  status PENDING|VERIFIED|REVOKED
  verifiedAt, revokedAt nullable
  UNIQUE (institutionId,id)
  INDEX (institutionId,status,hostCanonical)

PlatformPrincipal
  globalUserId
  platformRoleId
  status
  validUntil nullable

ImpersonationSession
  id PK
  operatorGlobalUserId
  targetInstitutionId
  targetMembershipId
  reason
  startedAt, expiresAt, endedAt
  correlationId

AuditEvent
  id PK
  eventClass TENANT|PLATFORM|SERVICE|SECURITY
  targetInstitutionId nullable
  realActorGlobalUserId nullable
  platformPrincipalId nullable
  effectiveMembershipId nullable
  impersonationSessionId nullable
  serviceActorKey nullable
  correlationId NOT NULL
  action, entityType, entityId, beforeRedacted, afterRedacted, reason, createdAt
  CHECK existe exactamente una identidad de actor válida para eventClass
  -- targetInstitutionId es independiente del actor; no hay XOR actor/target
```

Una acción de soporte sobre una Institution conserva ambos: principal real y target. Grants runtime permiten INSERT por
helper, no UPDATE/DELETE. Outbox registra efectos externos luego del commit local.

### 7.4 Relaciones tenant-aware e índices

Cada entidad tenant expone `UNIQUE(institutionId,id)`. Relaciones como Assignment→Course, Enrollment→Course/Membership,
Submission→Assignment/Enrollment y OrganizationalUnitMembership→Unit/Membership usan FK compuestas. El patrón se aplica
a ExamQuestion, ExamAnswer, assets, guardianship, targets, programa/grupo y revisiones.

Cada tabla tenant tiene al menos un índice útil que comienza por `institutionId`, y todo patrón tenant-scoped usa ese
prefijo. Excepciones documentadas: PK global, `InstitutionDomain.hostCanonical`, canonical email, token hashes y lookup de
plataforma/preauth. Cada excepción incluye consulta, cardinalidad, plan y grants; no existe la regla falsa de que todo
índice de cualquier tipo deba iniciar con `institutionId`.

### 7.5 Excepciones globales candidatas y límite auth

Allowlist sujeta a `HD-07`: `Institution`, GlobalUser/Identity, Auth.js estrictamente global, SystemRoleTemplate,
PermissionDefinition, Plan, roles de plataforma, metadata de migración y LoginAttempt con hashes/retención.
`InstitutionDomain` sigue siendo tenant-owned, pero expone solo la función bootstrap estrecha descrita abajo.

El rol tenant no tiene grants sobre identidad/Auth.js. Un repositorio auth usa proyecciones dedicadas; la función de login
puede obtener el hash solo dentro del proceso de verificación y nunca lo devuelve a features, logs o DTO.

## 8. Bootstrap de dominio preautenticación

### 8.1 Función y grants candidatos

```sql
REVOKE ALL ON TABLE "InstitutionDomain", "Institution" FROM PUBLIC, edukana_app;
REVOKE ALL ON FUNCTION resolve_verified_institution_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_verified_institution_host(text) TO edukana_host_resolver;
```

La función candidata:

- es `SECURITY DEFINER`, propiedad de `edukana_host_resolution_owner`, un rol `NOLOGIN` y `NOBYPASSRLS` que posee
  únicamente la tabla de mapeo de dominios y esta función, no otras tablas tenant;
- en esta opción `InstitutionDomain` tiene RLS habilitado pero no FORCE RLS, de modo que solo el owner-definer puede leer
  para resolver; `HD-11` debe ratificar esta excepción o elegir una tabla/vista de control-plane equivalente;
- el caller `edukana_host_resolver` es no-owner/NOBYPASSRLS, carece de SELECT directo y solo recibe EXECUTE;
- fija `search_path` explícito a `pg_catalog` y schema de la función;
- usa SQL estático, igualdad exacta sobre `hostCanonical` y solo estados `VERIFIED`/Institution permitidos;
- devuelve `institutionId`, `canonicalHost`, `domainStatus`, `institutionStatus`;
- devuelve cero filas ante unknown/revoked y error cerrado ante duplicado;
- no acepta Institution ID, slug, query o body como fallback;
- no devuelve branding, membership o PII ni habilita un cliente general de plataforma.

Cambios de dominio se auditan. Requests unknown producen métricas rate-limited/agregadas, no un evento con PII por intento.
La invalidez de caché se confirma dentro de la operación de revocación. Se prueban caller grants y `search_path` hostile.

### 8.2 Algoritmo de autoridad de host

```ts
type HostAuthority =
  | { kind: "PLATFORM"; canonicalHost: string }
  | { kind: "TENANT"; institutionId: string; canonicalHost: string; source: "SUBDOMAIN" | "CUSTOM" }
  | { kind: "UNKNOWN"; reason: "INVALID" | "UNASSIGNED" | "REVOKED" | "AMBIGUOUS" | "UNTRUSTED_PROXY" };
```

1. El adapter de runtime obtiene una sola autoridad de host según `HD-26`.
2. Si el request no proviene del proxy allowlisted, solo se acepta `Host`; cualquier forwarded header contradictorio niega.
3. Si proviene de proxy allowlisted, se toma el hop exacto de `HD-26`; longitud o valores contradictorios niegan.
4. Se normaliza minúsculas, trailing dot, puerto permitido e IDN con una política única; esquema/ruta/userinfo niega.
5. Se compara con allowlist PLATFORM exacta.
6. Se invoca el resolver mínimo para tenant.
7. Todo lo demás es UNKNOWN y termina en 404 antes de marca, auth, cookies tenant o lookup de datos.

No se define el header/hop final por inferencia. Ese valor bloquea READY mediante `HD-26`.

## 9. Sesión, cookies y transición de host

- JWT contiene solo IDs estables, `sessionVersion`, timestamps, audience y session identifier.
- Por petición se releen GlobalUser, Membership, RoleAssignment, Institution, roles, permissions, scopes, modules y plan.
- `/api/auth/session`, páginas, actions y APIs llaman la misma revalidación y aplican `HD-04`.
- Cookie tenant candidata: `__Host-edukana.session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`.
- CSRF valida Origin contra host canónico. Return target solo acepta path relativo o host exacto allowlisted.
- La transición PLATFORM→TENANT emite secreto aleatorio; persiste solo hash, issuer session, GlobalUser, Membership destino,
  host destino, nonce, `issuedAt`, `expiresAt≤60s`, `consumedAt`.
- Redemption bloquea/actualiza una sola fila atómicamente, revalida todo, rota session ID y rechaza replay/concurrencia.
- UNKNOWN nunca redirige ni consume sesión tenant.

## 10. Request context, autorización y TOCTOU

```ts
type RequestContext = {
  authority: HostAuthority;
  correlationId: string;
  globalUser: { id: string; sessionVersion: number; status: "ACTIVE" } | null;
  institution: { id: string; status: string; plan: string } | null;
  membership: { id: string; status: "ACTIVE"; version: number } | null;
  activeRole: { assignmentId: string; roleId: string; version: number; scopeId: string } | null;
  capabilities: ReadonlySet<Permission>;
  modules: ReadonlySet<string>;
  impersonation: { id: string; operatorId: string; expiresAt: Date } | null;
  databaseMode: "TENANT" | "AUTH" | "PLATFORM" | "NONE";
};
```

`cache()` memoiza solo dentro del request. `withTenantData(ctx, fn)` abre la interactive transaction, fija
`app.institution_id`, verifica su valor y entrega un transaction client que no escapa.

`can()` evalúa Institution → module/plan → capability → scope → relationship → resource state → operation policy. El DAL
carga una proyección mínima para la decisión. Navigation y transport comparten `policyId`.

Para una escritura sensible, el callback transaccional vuelve a leer y condiciona por versiones/estado de identidad,
Membership, assignment y recurso. El diseño físico aprobado elige:

- locks `FOR UPDATE` en filas de autoridad y recurso;
- serializable con retry acotado; o
- optimistic update con todos los version predicates y `affectedRows=1`.

Cualquier cambio concurrente retorna `CONFLICT`/denied, modifica cero filas y no emite outbox. La auditoría local se
inserta en la misma transacción. Esto cierra la ventana entre contexto memoizado y mutación.

## 11. Registro declarativo y navegación

Cada entrada contiene:

```text
surfaceId, surfaceKind, route/export, policyId, capability, module, plan,
scope, relationship, resourceStates, institutionStates, readOnlyWhen,
navigationParents, prefetchPolicy, denialOracle
```

Superficies: layouts, pages, tabs, menus, breadcrumbs, contextual links, search destinations, Server Actions, Route
Handlers, DAL, jobs y platform operations. Un generador desde filesystem/exports comprueba cobertura, pero requests reales
prueban seguridad. Una entrada ausente falla build y runtime.

Al cambiar Institution/role/capability, el shell elimina cache/view state anterior y resuelve el primer destino permitido.
No renderiza, prefetch ni consulta un destino denegado. La navegación móvil muestra hasta cinco destinos primarios.

## 12. Límites de datos

```text
src/server/context.ts
src/server/authz/{permissions,policies,registry}.ts
src/server/data/<domain>/{read,write,view-models}.ts
src/server/db/{tenant,auth,platform,migration-boundary}.ts
src/server/storage/broker.ts
```

- DAL tenant recibe RequestContext, nunca `institutionId` suelto.
- Auth boundary expone operaciones cerradas y sin enumeración; tenant/support/reporting no lee tablas auth.
- Platform boundary requiere principal/capability y proyección registrada.
- Storage broker deriva objeto desde metadata confiable, autoriza inmediatamente antes de firmar y usa `no-store`.
- SQL raw requiere parámetros, helper tipado, policy ID y revisión específica.
- `src/lib/db.ts` es adaptador legacy temporal y no recibe imports nuevos.

### 12.1 Counseling

Counseling tiene capability y DAL separados. Solo COUNSELOR asignado obtiene la proyección. Un break-glass distinto de
impersonación exige razón, TTL, aprobaciones de `HD-17`, banner y evento. OWNER/ADMIN/platform support/export normal no
pueden leer notas, incluso si ven metadata del caso.

## 13. Roles PostgreSQL y RLS candidatos

### 13.1 Roles

- `edukana_migrator`: DDL/ownership, nunca runtime.
- `edukana_app`: runtime tenant, no-owner, `NOBYPASSRLS`, grants DML mínimos.
- `edukana_auth`: funciones/proyecciones auth mínimas, sin acceso tenant general.
- `edukana_host_resolution_owner`: `NOLOGIN`, `NOBYPASSRLS`, owner solo de mapping/function bootstrap; no uso runtime.
- `edukana_host_resolver`: caller runtime con EXECUTE de la función bootstrap y sin SELECT general.
- `edukana_platform_app`: operaciones/vistas de plataforma registradas.
- `edukana_readonly_support`: opcional, vistas redactadas.

Nombres y grants finales dependen de `HD-09`; propiedades de mínimo privilegio son obligatorias.

### 13.2 Transacción tenant

```sql
BEGIN;
SELECT set_config('app.institution_id', :institution_id, true);
SELECT current_setting('app.institution_id', true);
-- revalidación de autoridad, consultas/mutación y AuditEvent
COMMIT;
```

La forma del ID se valida antes de comparar. No se usa setting persistente ni afinidad de conexión.

### 13.3 Policy y test generation

```sql
USING (
  "institutionId" = nullif(current_setting('app.institution_id', true), '')
)
WITH CHECK (
  "institutionId" = nullif(current_setting('app.institution_id', true), '')
)
```

El policy manifest lista tabla, operation, grant, using/check, FORCE, exception y test IDs. Por cada operación concedida se
generan same-tenant positive, other-tenant, missing, empty, invalid context y changed-tenant-key negatives. Owner/migrator
se ejecutan en suite separada. El resolver preauth se prueba con su rol, no con `edukana_platform_app` general.

## 14. Migración, backfill y rollback

### 14.1 Fases

- **M0 evidence:** read-only, entorno/SHA/roles/pooler/counts/sizes/anomalies/backups/budgets.
- **M1 expand:** columnas/tablas/keys/indexes/constraints staged sin retirar legacy.
- **M2 backfill:** lotes deterministas, quarantine, checkpoints y checksum.
- **M3 compatibility:** origen autoritativo explícito, dual-write atómico, shadow-read y stop threshold.
- **M4 validate:** cero nulls/orphans/mixed tuples, validate constraints y query plans.
- **M5 role/RLS:** rol app seguro, policy batches, exhaustive policy suite y go/no-go.
- **M6 contract:** NOT NULL/retiro legacy solo con restore, retención y autorización irreversible.

### 14.2 Manifiesto por tabla inicial

La lista se amplía desde el schema inventariado. Ninguna fila puede omitirse por ser “derivada”.

| Tabla destino | Fuentes autoritativas candidatas | Igualdades obligatorias | Categoría de anomalía |
|---|---|---|---|
| `Membership` | `Identity` + cada `User` legacy | email/global identity reconciliada; un Institution por User | missing_identity, email_collision, duplicate_membership |
| `CourseModule` | `Course` | module.courseId→course.id; tenant=course.institutionId | missing_course, duplicate_parent |
| `Enrollment` | `Course` + student/User | course.tenant=student.tenant=target tenant | missing_course, missing_student, mixed_tenant |
| `Assignment` | `Course` | assignment.courseId→course.id | missing_course, existing_tenant_mismatch |
| `Submission` | `Assignment` + `Enrollment` + student/User | assignment.tenant=enrollment.tenant=student.tenant | missing_path, mixed_tenant, duplicate_attempt |
| `ExamQuestion` | `Exam` + `QuestionBankItem` | exam.tenant=item.tenant | missing_exam, missing_item, mixed_tenant |
| `ExamAnswer` | `ExamAttempt` + `QuestionBankItem` | attempt.tenant=item.tenant | missing_attempt, missing_item, mixed_tenant |
| `OrganizationalUnitMembership` | explicit Institution + Unit + User/Membership | row.tenant=unit.tenant=membership.tenant | missing_unit, missing_membership, mixed_tenant |

Cada entry declara:

```text
migrationId, table, sourcePaths, equalityPredicates, sourcePk,
batchOrder, batchSize, checkpointKey, idempotencyKey=(migrationId,table,sourcePk),
checksumColumns, quarantineCategory, expectedCounts, restartRule
```

Checksum candidato: SHA-256 de JSON canónico UTF-8, null explícito, timestamp UTC ISO-8601, filas ordenadas por PK. El
fixture fija conteos/hashes esperados. Interrupción forzada ocurre después de un checkpoint identificado; reejecución no
duplica ni omite.

### 14.3 Compatibilidad y cutover

Por tabla se documentan `legacy_authoritative`, `dual_write`, `new_authoritative_shadow_legacy` y `contracted`.
Dual-write ocurre en una transacción; fallo revierte ambas representaciones. Shadow divergence no corrige automáticamente:
si excede el umbral de `HD-15`, se detiene. El cutover es un evento firmado con SHA/versiones y termina rollback app.

### 14.4 Rollback de RLS

Antes de M5 se provisiona y prueba el rol rollback no-owner/NOBYPASSRLS con policies compatibles. Nunca se vuelve a una
credencial owner/BYPASSRLS/desconocida. Si ese rollback no existe, M5 se clasifica forward-fix-only antes del go/no-go;
la activación no puede comenzar hasta aprobación humana. Contract M6 es irreversible por defecto y requiere restore
probado y decisión separada.

## 15. Fixtures, capas y oráculos

### 15.1 Fixture manifest

Cada predecesor aprobado fija: SHA/migration state, IDs, UTC clock, timezone/locale, random seed, Institutions, usuarios,
roles/scopes, relaciones/estados, row counts, anomalías, bytes y SHA-256 de archivos, checksum esperado y teardown. Cada run
usa namespace propio y termina con cero filas/objetos residuales.

### 15.2 Capas

| Capa | Responsabilidad | Dependencia real / mocks prohibidos | Evidencia |
|---|---|---|---|
| Unit | normalización host, pure `can()`, state reducers, checksum canonicalization | Sin DB; no prueba authz end-to-end. | reporte por policy/test ID |
| Integración HTTP | página/action/API/session, cookies, redirects, TOCTOU/outbox | PostgreSQL real; no mock de authz, DAL ni session live. | requests y side-effect ledger |
| DB policy | constraints, grants, RLS y resolver | Rol app/resolver real; nunca owner para suite app. | table-operation matrix + SQLSTATE |
| E2E exact-SHA | cuatro journeys, navigation, browser, Storage autorizado y revocation | Deployment aislado `HD-22`; no fixture manual oculto. | trace, screenshot acotado, artifact hashes |

Los comandos y versiones se fijan en release-evidence manifest antes de ejecución; este DRAFT no inventa nombres de
scripts ausentes.

### 15.3 Oracle de denegación

Cada test ID declara status/result, response schema, redirect/cookie, concealment, AuditEvent requerido/prohibido, DB row
delta, outbox, Storage, email, notification, job y cache invalidation. Un 404 con side effect no pasa.

## 16. UI, recorridos y accesibilidad

`AccessViewState` candidato:

```ts
type AccessViewState =
  | { kind: "LOADING" }
  | { kind: "EMPTY"; reason: "NO_MEMBERSHIP" | "NO_ROLE" | "NO_CLASS" | "NO_ENROLLMENT" | "NO_CHILD"; action?: SafeAction }
  | { kind: "READY"; mode: "WRITE" | "READ_ONLY"; reason?: string }
  | { kind: "SUCCESS"; message: string }
  | { kind: "CONFLICT"; correlationId: string; preserveSafeInput: boolean }
  | { kind: "ARCHIVED_READ_ONLY" }
  | { kind: "OFFLINE"; preserveSafeInput: boolean }
  | { kind: "REVOKED" }
  | { kind: "SUSPENDED_INSTITUTION" }
  | { kind: "CANCELLED_INSTITUTION" }
  | { kind: "MODULE_OR_PLAN_DENIED"; fallback: SafeAction }
  | { kind: "NOT_FOUND" }
  | { kind: "RETRYABLE_ERROR"; correlationId: string };
```

- OFFLINE nunca encola una mutación sensible ni muestra éxito.
- CONFLICT nunca auto-merge; conserva solo input que no pertenece a contexto anterior.
- SUCCESS sigue a commit confirmado y se verifica tras reload/sesión fresca.
- ERROR muestra “Código de referencia: {correlationId}” y control accesible para copiar.
- Guardian sin vínculo conserva perfil propio y avisos generales; no consulta hijos.
- Archive, suspended y cancelled son estados distintos; `HD-25` define la matriz no resuelta.
- Los recorridos de ADMIN, TEACHER, STUDENT y GUARDIAN usan las rutas acotadas de `requirements.md` §8.

WCAG 2.2 AA se verifica con landmarks/headings, names/descriptions, error association, keyboard/focus restore, live regions,
contrast/non-color, text spacing, 320 CSS px reflow, 360 px y 200 %. `HD-23` elige browser/OS/AT.

## 17. Storage privado

El broker server-only es el único que usa el service credential. Para upload/download:

1. Obtiene metadata con `(institutionId,assetId)` desde contexto tenant.
2. Revalida owner, role, relationship, resource state y operation dentro de transacción.
3. Construye bucket/key desde metadata; ignora path/bucket cliente.
4. Para confirmación de upload comprueba existencia, prefix, bytes, MIME permitido y hash.
5. Emite URL con TTL aprobado, `no-store`, sin loguearla, y AuditEvent redactado.
6. Mide acceso residual después de revocation y lo compara con el límite aprobado.

Pruebas cubren path traversal/tampering, metadata mismatch, cross-user/role/tenant, expired/stale URLs y ausencia de service
key en bundles, responses, logs y artifacts.

## 18. Observabilidad, recovery y release evidence

### 18.1 SLI semantics

Cada SLI define event source, eligible population, numerator, denominator, exclusions, time window, percentile y dimensions.
El error budget es `1 - successful_eligible / eligible` sobre la ventana aprobada. `HD-20` fija números. Synthetic alert
injection registra timestamps de generación, detección y notificación, route, correlation ID y redacción.

### 18.2 Restore drill

El drill aislado registra backup IDs/times, source/destination fingerprints, DB rows y Storage object counts/hashes,
auth/authz smoke, achieved RPO/RTO, start/end, source read-only proof, cleanup y approver. No escribe el origen. `HD-21`
fija umbrales; `HD-22` identifica destino.

### 18.3 Release manifest

El manifest versionado enumera exact commit/deployment, commands, Node/Postgres/Prisma/Playwright/browser/runner versions,
required check names, terminal status, zero-skip policy, retries/flaky policy, dependency severity threshold/exceptions,
artifact paths/hashes/provenance/retention y reviewer identity. No se considera verde un check pendiente, omitido o de otro SHA.

## 19. Threat model

| Amenaza | Control | Evidencia |
|---|---|---|
| Unknown/stale domain | Triestado y resolver mínimo. | unknown/revoked/duplicate/cache tests. |
| Header/proxy forgery | Topología/hop exactos; contradiction deny. | Host/Forwarded/XFH matrix. |
| Client tenant hint | Ignore slug/ID outside trusted context. | login/action/API tampering. |
| Preauth privilege | SECURITY DEFINER estrecha, grants/search_path. | caller cannot SELECT; hostile search_path. |
| Cross-tenant graph | Composite FK, typed scope, RLS. | INSERT/UPDATE/SELECT/DELETE negatives. |
| Stale/replayed session | Live versions, audience, one-use ticket. | next request, replay/concurrent redeem. |
| Authorization TOCTOU | Transactional revalidation/version predicate. | concurrent revoke causes zero mutation. |
| Platform privilege | Separate role/capability/impersonation. | no/expired impersonation. |
| Global identity exposure | Auth-only grants/projections. | tenant/support/reporting enumeration denied. |
| Owner/BYPASSRLS | App non-owner; FORCE decision; safe rollback. | catalog/role comparison. |
| Pool leakage | Transaction-local setting, small-pool concurrency. | tenant alternation and invalid context. |
| Raw Prisma | Allowlist/lint/inventory and review. | zero imports outside boundaries. |
| Job confused deputy | Explicit service actor, tenant and operation. | altered/missing job context. |
| Storage service role | Exclusive broker, metadata-derived path. | bundle scan and cross-tenant tests. |
| Counseling disclosure | Dedicated policy; break-glass only. | owner/support/export denied. |
| Audit tampering | Append-only grants, real/effective actors. | update/delete denied. |
| PII/minor data | Minimal DTO and field redaction. | artifact/error scanner. |
| Expensive backfill | Budgets, batches, checkpoints, cancel. | scaled fixture and forced interruption. |
| Unsafe rollback | Safe role/policy or forward-fix-only. | role properties and post-rollback proof. |

## 20. Review and promotion

The package of evidence separates:

- **verified facts:** file, symbol, migration, test or SHA;
- **inferences:** runtime/data hypotheses awaiting evidence;
- **candidate choices:** proposed but not approved;
- **human decisions:** `HD-01..HD-26` with owner, evidence, value and date;
- **review resolutions:** each objective finding mapped to a clause and check.

Promotion order is G0 → F0 → E0 → H0 → F1 → READY. Approving this design or opening a draft PR does not authorize
implementation, migration, merge, deployment, database access or production release.
