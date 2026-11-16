# 00 · Límite institucional confiable y autorización de petición — Diseño

**Estado:** DRAFT-CANDIDATE
**Base autoritativa auditada:** `d16502906aaba04f7fdad2323a1152f3efeb1794` (`origin/todo/tanda-4`)
**Baseline documental pre-Phase B:** PR #130 en `bdb1a9d8844af7bc2e2817903d9dd37492a79523`
**Candidato actual:** bytes de la rama de PR #130; cada revisión reusable debe registrar el SHA exacto observado en GitHub.
**Fecha de evidencia:** 2026-11-16
**Implementación:** prohibida hasta una transición humana y separada a READY.

## 1. Objetivo arquitectónico

Una petición solo alcanza datos institucionales cuando todas las capas derivan la misma decisión de una autoridad
confiable. La autenticación establece prerrequisitos; la autorización funcional sigue el orden vinculante:

```text
HostAuthority → User vivo → Membership viva
  → policy de lifecycle por operación
      (negocio: ACTIVE; recovery: allowlist explícita para SUSPENDED/CANCELLED)
  → módulo/plan → capability → scope → relación → estado → política de operación
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
- La base autoritativa contiene 16 migraciones. Una base PostgreSQL 16.16 local limpia aplicó las 16, pero el upgrade
  desde alpha poblado con asistencia falló en la segunda migración por columnas obligatorias sin backfill.
- El seed local actual dejó tres usuarios sin Identity y claves `institutionId` nulas en productores activos.
- El catálogo local mostró 54 tablas tenant, cero FK tenant compuestas y cero padres `UNIQUE(institutionId,id)`; cuatro
  probes de INSERT aceptaron grafos cross-Institution.
- No existen `Offering`, `MeetingPattern`, `ClassSession`, `ReportRegistry`, `ReportJob`, `ReportArtifact`,
  `SavedReportView`, `ReportSchedule`, `Conversation`, `Message`, `TermGrade` ni `ReportCard`.
- Reportería actual es síncrona, no versionada, con permisos legacy y sin snapshot, freshness, lineage, reconciliation,
  saved views, schedules ni artefactos privados; el resumen financiero puede sumar monedas distintas.

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
  reserva.
- El propietario del workspace autorizó **“Autoriza excepción G0 y dependencias”** el 2026-11-16; la cuenta GitHub que
  publica dejó identidad, fecha, texto y alcance en [PR #130, comentario 6927885328](https://github.com/cank3r/edukana/pull/130#issuecomment-6927885328).
  La excepción satisface G0 solo para la fila SPEC00 existente, esta iteración documental y un handoff limitado `S0-GOV`.
- La excepción no publica el claim en la rama base y no autoriza READY, implementación, harness, merge, deploy, Preview,
  producción, Supabase, Storage, migraciones, protección de ramas, debilitamiento de auditoría ni el checkout principal.
- El paquete continúa **DRAFT-CANDIDATE**. Las decisiones humanas aprobadas fijan inputs, pero la evidencia técnica,
  decisiones restantes y revisiones independientes continúan bloqueando READY.

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
| AD-09 / HD-04 | Revocación en la primera petición nueva mediante relectura viva; JWT nunca es autoridad. | `current-state.md` aprueba la semántica, no el adaptador físico. `HD-04` OPEN_BLOCKING hasta cerrar `HD-05/HD-15`. | N/N-1 requiere matriz del token legacy `sub/idn/sv/role/institutionId`, mapping único, reissue, drain y cutover; falla cerrada si falta. |

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
| CD-09 | Suspensión: writes bloqueadas; mínimo provisional cerrado. | Matriz read/export distinta. | `HD-25`. | Regenerar matriz, UI y RLS antes de READY. |
| CD-10 | Cookies host-only y ticket one-use ≤ 60 s. | Sesión cross-subdomain. | `HD-01/HD-26`. | Rehacer threat model de CSRF/fixation antes de implementar. |

Una propuesta CANDIDATE no puede aparecer como decisión “resuelta”. Al cerrar un `HD-*`, se registra opción, autoridad,
fecha, compatibilidad y rollback; después se actualizan los tres documentos y los revisores evalúan esos valores.

### 4.3 Decisiones humanas aprobadas el 2026-11-16

Estos valores fueron aprobados por el propietario del workspace como inputs humanos vinculantes y quedaron publicados
con identidad, fecha y valores en [PR #130, comentario 6928063312](https://github.com/cank3r/edukana/pull/130#issuecomment-6928063312).
Permanecen separados de la clausura técnica: no demuestran viabilidad, no aportan evidencia de entorno y no convierten
ningún `HD-*` completo ni la spec en READY.

| ID | Valor humano aprobado | Gate relacionado | Evidencia técnica todavía requerida |
|---|---|---|---|
| AHD-01 | RPO 1 h y RTO 4 h. | `HD-21` | Restore drill DB+Storage, autoridad y medición. |
| AHD-02 | Exportaciones se retienen 30 días; datos operacionales, 90 días y luego purge. | `HD-16` | Clasificación, legal hold, cascadas, cancelación y prueba auditada de purge. |
| AHD-03 | Impersonación por máximo 30 minutos. | `HD-17` | Roles, motivo, operations allowlist, revocación, banner y auditoría. |
| AHD-04 | Cada transición exige owner y revisor independiente. | `HD-24` | Identidades, separación de funciones y mecanismo enforceable. |
| AHD-05 | Staging dedicado de pago en US East. | `HD-22` | Proyecto/tenant/bucket/operadores exactos y aislamiento probado. |
| AHD-06 | Dominio `edukana.com`; consola `app.edukana.com`; selector sin datos tenant. | `HD-01/HD-26` | DNS, host/proxy, cookies/ticket y proyección control-plane. |
| AHD-07 | Registro institucional solo por invitación; marketplace público. | `HD-03` | Flujos, antiabuso, cuotas, privacidad y separación de autoridad. |
| AHD-08 | Matriz completa responsive web/PWA móvil. | `HD-23` | Browsers, OS, dispositivos, AT y evidencia humana. |
| AHD-09 | SLO de disponibilidad 99,9 % mensual. | `HD-20` | SLI, exclusiones, error budget, fuentes y alertas. |
| AHD-10 | Autenticación con contraseña, Google y Microsoft. | `HD-12/HD-04` + identity/auth | Normalización/linking/colisiones, recovery, revocación y configuración segura. |

## 5. Decisiones técnicas: HD-01..HD-26 bloquean READY fundacional; HD-27..HD-41 gobiernan nodos posteriores

La puerta de esta spec solo posee `HD-01..HD-26`. `HD-27..HD-41` se conservan aquí como contratos de handoff y stop
conditions para Course/Offering, aula, recorridos, PWA y reportería; deben cerrarse en sus specs dueñas antes de ejecutar
cada nodo y antes de producción, pero no son prerrequisitos de la transición READY fundacional.

La decisión semántica de revalidar en la primera petición está aprobada por `current-state.md`, pero `HD-04` permanece
**OPEN_BLOCKING**: la base emite/consume claims legacy `sub`, `idn`, `sv`, `role` e `institutionId`, mientras el target
requiere Membership y asignación aún abiertas en `HD-05`; `HD-15` tampoco fija coexistencia, drain ni cutover. No existe
cierre implementable hasta una matriz claim-by-claim y sus pruebas mixtas. La tabla conserva todas las decisiones abiertas.

| ID | Decisión requerida | Evidencia/resultado que debe registrarse |
|---|---|---|
| HD-01 | ¿Cómo opera la consola `app.edukana.com` y la transición al espacio, sin exponer datos tenant en el selector? | Campos control-plane permitidos, cookie/ticket, UX y negativas; el dominio y la prohibición de datos tenant ya están aprobados en AHD-06. |
| HD-02 | ¿Todo host no asignado/revocado devuelve 404 antes de auth/data? | Casos routed-obsolete, cache y canonicalización. |
| HD-03 | ¿Cómo se implementan registro institucional invite-only y marketplace público sin confundir sus autoridades? | Invitación, antiabuso, cuota, privacidad y default-off; AHD-07 ya prohíbe signup institucional anónimo. |
| HD-04 | ¿Cómo se adapta la sesión viva entre N y N-1 sin confiar en claims legacy? | Shape emitido/consumido por versión; mapping único `sub/idn`→identidad/Membership/asignación; missing/ambiguous deny; version triggers; reissue; pruebas HTTP concurrentes; drain/cutover/rollback de HD-15. |
| HD-05 | ¿Cuál es el modelo físico Membership/roles? | Una representación enforceable, migración y selección activa; spec de identidad es el productor físico según S2. |
| HD-06 | ¿Qué scopes exige el piloto y qué roles son institution-wide? | Lista cerrada y matriz por rol. |
| HD-07 | ¿Qué tablas son globales y qué hijos reciben `institutionId`? | Allowlist cerrada con justificación y grants. |
| HD-08 | ¿Toda relación tenant exige FK compuesta? | Excepciones con integridad equivalente y pruebas. |
| HD-09 | ¿Cuáles roles, grants, ownership e inheritance existen? | Inventario por entorno, incluido `rolbypassrls`. |
| HD-10 | ¿Prisma/pooler soportan el patrón transaction-local? | Prueba concurrente exacta sin fuga. |
| HD-11 | ¿Qué tablas usan FORCE RLS y qué paths excepcionales existen? | Manifest y autoridad de cada excepción. |
| HD-12 | ¿Cuál es la normalización/unicidad de email y linking Google/Microsoft? | Unicode/local-part/IDNA; ProviderAccount global; verified claims; collision sin auto-link; reauth; email change; unlink/last-method; token revoke; takeover recovery; sessionVersion/audit; migración N/N-1 y feature rollback. |
| HD-13 | ¿Qué disposition tiene cada uno de los 16 estados post-migración y el demo actual? | Matriz SUPPORTED/EXCLUDED, fixtures/postflight; exclusión con prueba o de-support humano; reconciliación alpha inmutable si supported. |
| HD-14 | ¿Qué budgets operativos aplican por entorno? | Lock/statement por DDL/index/validate; lote min/initial/max y target; SQLSTATE/backoff/retries; write-pause/window/abort; medidas que justifican cada valor. |
| HD-15 | ¿Qué versiones coexisten y cuándo termina rollback? | Legacy authoritative con N-1; N dual-write/shadow; catch-up recurrente; drain N-1; stable window; cutover exacto; rollback pre-cutover y forward-fix post-cutover. |
| HD-16 | ¿Cómo se aplican, exceptúan y prueban la retención y el purge aprobados? | Export 30 d; operacional 90 d y purge; clasificación, legal hold, cancelación, cascadas y prueba auditada pendientes. |
| HD-17 | ¿Cómo se autoriza plataforma e impersonación dentro del máximo aprobado de 30 min? | OWNER_CONSENT/BREAK_GLASS, approvers, target assignment, permission intersection, allow/deny lists, DB max, one-active, revocation, terminal states, audit y concurrency oracles. |
| HD-18 | ¿RLS completo es obligatorio antes del piloto? | Cualquier excepción con risk owner y vencimiento. |
| HD-19 | ¿Qué protección, checks, approvals y bypass se exigen? | Mecanismo enforceable y auditoría. |
| HD-20 | ¿Se aprueba SLI-1 para demostrar 99,9 % mensual? | Rutas/eventos, N/D, 10 s, 429, exclusiones, UNKNOWN sin tráfico, probes, burn windows/thresholds, destino, retención y redacción; instrumentación externa pendiente. |
| HD-21 | ¿Se aprueba REC-1 y quién autoriza restore/rollback? | T0, markers DB/object, peor RPO≤1h, RTO declaration→full acceptance≤4h, restore provider-native+objetos, purge replay, source unchanged, approvers y cleanup. |
| HD-22 | ¿Cuáles son las identidades exactas del staging dedicado de pago en US East? | Proyecto, bucket, tenant, operadores y aislamiento exactos, sin secretos; gasto/provisioning siguen abiertos. |
| HD-23 | ¿Se aprueba la matriz WEB-1 responsive/PWA? | Windows Chrome/Edge/Firefox+NVDA; macOS/iOS Safari+VoiceOver; Android Chrome+TalkBack; Playwright Chromium/Firefox/WebKit; versiones, modos y evidencia humana. |
| HD-24 | ¿Quiénes son owner y revisor independiente y cómo autorizan cada transición? | Matriz REL-1 para READY/implementation/merge/migration/deploy/release/restore/purge/rollback; separación writer/reviewer/executor/release/data/security y ledger same-commit. |
| HD-25 | ¿Se aprueba la matriz INST-1 SUSPENDED/CANCELLED/ARCHIVED? | Login/session, reads/writes, jobs, delivery, export/download, retention/hold, reauth/restore/purge y AuditEvent; producto/privacy/security/billing/retention. |
| HD-26 | ¿Cuál es la topología proxy/host confiable? | Header exacto, hop count, allowlist, contradicción y entorno. |
| HD-27 | ¿Cómo se separan y versionan Course y Offering? | Ownership único de contenido/ejecución, propagación, historia, backfill, N/N-1 y rollback. |
| HD-28 | ¿Cuál es la máquina de matrícula y finalización de Offering? | Waitlist, retiro, reinstalación, expiración, capacidad concurrente, evidencia y correcciones. |
| HD-29 | ¿Cómo se materializan MeetingPattern/ClassSession y sus excepciones? | DST, holidays, horizonte, idempotencia, conflictos, reprogramación, cancelación y recording. |
| HD-30 | ¿Cómo funcionan políticas e intentos de Assignment/Submission? | Intentos inmutables, late policy, overrides, rubric version, grupos, retry y stale form. |
| HD-31 | ¿Cómo funcionan ExamAttempt, autosave, reconnect y retención? | Snapshot/orden por intento, versionado, idempotencia, grace, accommodations y archive. |
| HD-32 | ¿Cómo se calcula, publica, recalcula, cierra y reabre gradebook? | Inputs/fórmula versionados, snapshot, TermGrade, authority, audit y reconciliación. |
| HD-33 | ¿Qué modos y evidencia gobiernan Attendance? | Daily vs ClassSession, estados, roster stale, edit window, correcciones, justificación y reportes. |
| HD-34 | ¿Qué políticas rigen Announcement, Conversation, Message y delivery? | Participantes, privacidad, moderación, archivo, quiet hours, outbox y retry. |
| HD-35 | ¿Cuál es la fuente de verdad de calendario? | Identidad/versiones, audiencia, recurrencia, deduplicación, repair e iCal revocable. |
| HD-36 | ¿Cuál es la frontera PWA/offline/reconnect? | Cache partition/purge, exclusiones sensibles, drafts, writes no queued y unknown-commit recovery. |
| HD-37 | ¿Cuáles son los cuatro recorridos acotados de aceptación? | Estado inicial, rutas, outputs, negativas, fixtures, matriz cliente y owner humano. |
| HD-38 | ¿Cuál es el inventario versionado de las nueve familias de reportes? | `reportId`, versión, productor, campos, granularidad, dimensiones, owner y reconciliación. |
| HD-39 | ¿Cómo se autorizan operaciones y campos de reportes? | View/request/download/schedule/delivery/cancel/retry, proyección, scope, relación e inferencia. |
| HD-40 | ¿Cuál es la semántica temporal, financiera y de calidad? | Filtros, snapshot, timezone/asOf, freshness, lineage, currency y discrepancy policy. |
| HD-41 | ¿Cómo funcionan jobs, artefactos, vistas, schedules y delivery? | Idempotencia, lease, retry/cancel, formatos, checksum, privacidad, expiry, hold y reautorización. |

## 6. Dependencias y gate READY

```text
G0 claim visible en coordinación autoritativa o excepción trazable
  → F0 paquete DRAFT-CANDIDATE
      → E0 evidencia fundacional read-only autorizada
          → H0 HD-01..HD-26 fundacionales cerradas, incluida compatibilidad contractual HD-04
              → F1 cinco revisiones independientes del contrato fundacional
                  → G-READY transición humana separada
                      → I0 frontera S1 transicional y harness
                          → S2 identidad/Membership productora
                              → I1 integración de sesión post-S2
                                  → O0 evidencia/operaciones fundacionales
I1 + O0 → D0 expand/backfill/roles/RLS de frontera
I1 + D0 → A0 spec S3 Course/Offering
A0 → C0 spec S4 ClassSession
A0 + C0 → L0 ciclos de aula y recorridos
D0 + L0 + O0 → Q0 release evidence
Q0 → P0 aceptación preproducción exact-SHA
P0 → R0 revisión/release humana
Productores DONE + manifest de dependencias → REP14 handoff a spec 14 dedicada
```

- G0 tiene una excepción trazable del 2026-11-16 limitada a la fila SPEC00 y al handoff `S0-GOV`; no equivale a READY.
- F0 puede iterarse en la rama documental autorizada sin ampliar la excepción G0.
- E0 solo contiene lectura autorizada y evidencia redactada requerida para decisiones `HD-01..HD-26`. Puede resolver
  partes de `HD-09/10/13/14/21/22` sin escribir datos; la evidencia externa todavía no disponible mantiene el HD afectado
  abierto, pero no arrastra decisiones de productores posteriores a la fundación.
- F1 sucede después de H0 para que los revisores evalúen elecciones fundacionales reales, no placeholders.
- `HD-27..HD-41` se cierran después de G-READY en las specs dueñas indicadas por el DAG. Cada uno bloquea su nodo,
  sus consumidores y producción, no H0.
- REP14 no habilita implementación: requiere que todas las specs que producen datos consumidos por reportes estén `DONE`,
  un manifest cerrado y el claim/revisión/READY propios de la spec 14.
- G-READY es un nodo explícito y prerrequisito de todo harness, código, DDL, migración o configuración fundacional.

## 7. Modelo de datos candidato y enforceable

El modelo es CANDIDATE hasta cerrar `HD-05..HD-08`. Su propósito es demostrar que existe una opción físicamente
implementable; no autoriza schema ni migración.

### 7.1 Identidad, membership y roles

```text
User
  -- única raíz de identidad; evoluciona in-place desde User legacy y conserva sus IDs
  id PK
  emailOriginal
  emailCanonical UNIQUE (mecanismo/version HD-12)
  passwordHash nullable
  sessionVersion integer NOT NULL
  status ACTIVE|SUSPENDED|DELETED
  createdAt, updatedAt

ProviderAccount
  id PK
  userId NOT NULL FK User
  provider GOOGLE|MICROSOFT
  providerAccountId NOT NULL
  providerEmailObserved nullable
  createdAt, updatedAt, revokedAt nullable
  UNIQUE (provider, providerAccountId)
  INDEX (userId, provider, revokedAt)
  -- tokens cifrados/revocables en límite auth; nunca tenant/reporting

AuthSession
  id PK
  userId NOT NULL FK User
  sessionVersionAtIssue NOT NULL
  expiresAt, revokedAt nullable
  -- adaptación aditiva de Account/Session hacia el mismo User evolucionado; sin segunda raíz ni contract hasta paridad

Membership
  id PK
  institutionId NOT NULL FK Institution
  userId NOT NULL FK User
  status INVITED|ACTIVE|SUSPENDED|LEFT
  version integer NOT NULL
  createdAt, updatedAt, endedAt nullable
  UNIQUE (institutionId, userId)
  UNIQUE (institutionId, id)
  INDEX (institutionId, status, userId)

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

### 7.1.1 Provider linking y recuperación

`HD-12` debe elegir una canonicalización versionada idéntica en app/DB (whitespace, Unicode, local-part, IDNA y límites).
Google/Microsoft solo crean identidad con claims verificados aprobados y `emailCanonical` libre. Una colisión nunca enlaza:
requiere autenticación del método existente y reautenticación reciente. Provider email change no rekeyea ni fusiona.
Unlink conserva un método usable, revoca tokens, incrementa `sessionVersion` y audita. La tabla `User` existente es la
única raíz: conserva IDs, se expande in-place y deja `institutionId/role` como campos legacy durante N/N-1. Membership se
backfillea con `(institutionId,userId,...)`; `ProviderAccount`, `AuthSession` y recovery se adaptan aditivamente desde
`Account`/`Session`/tokens hacia ese mismo `User`, con shadow parity. No se crea otra tabla raíz de usuario. Rollback
apaga proveedores/linking sin borrar vínculos; takeover recovery y last-method tienen oráculos.

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
  UNIQUE (institutionId, membershipId, institutionRoleId, authorizationScopeId)
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
  institutionRoutingStatus ACTIVE|SUSPENDED|CANCELLED
  routingVersion integer NOT NULL
  verifiedAt, revokedAt nullable
  UNIQUE (institutionId,id)
  INDEX (institutionId,status,institutionRoutingStatus,hostCanonical)
  -- lifecycle source y proyección se actualizan atómicamente; authority cache queda deshabilitada hasta HD-11/26

PlatformPrincipal
  userId
  platformRoleId
  status
  validUntil nullable

ImpersonationSession
  id PK
  operatorUserId
  targetInstitutionId
  targetMembershipId
  targetRoleAssignmentId
  authorityMode OWNER_CONSENT|BREAK_GLASS
  operationAllowlistVersion
  reason, ticketId
  status REQUESTED|APPROVED|ACTIVE|REVOKED|EXPIRED|ENDED
  createdAt, startedAt, expiresAt, revokedAt, endedAt
  revocationReason nullable
  correlationId
  CHECK expiresAt <= createdAt + interval '1800 seconds'
  UNIQUE (targetInstitutionId, id)
  UNIQUE active row per operator (partial index)
  FK (targetInstitutionId,targetMembershipId) → Membership(institutionId,id)
  FK (targetInstitutionId,targetRoleAssignmentId) → MembershipRoleAssignment(institutionId,id)

ImpersonationApproval
  id PK
  targetInstitutionId NOT NULL
  impersonationSessionId NOT NULL
  approverUserId NOT NULL FK User
  approverKind INSTITUTION_OWNER|PLATFORM
  decision APPROVED|REJECTED
  approvedScopeHash, createdAt, expiresAt
  correlationId
  UNIQUE (targetInstitutionId, id)
  UNIQUE (targetInstitutionId, impersonationSessionId, approverUserId, approverKind)
  FK (targetInstitutionId, impersonationSessionId) → ImpersonationSession(targetInstitutionId,id)
  -- append-only; policy exige 1 OWNER_CONSENT o 2 PLATFORM distintos antes de ACTIVE

ImpersonationApprovalRevocation
  id PK
  targetInstitutionId NOT NULL
  impersonationApprovalId NOT NULL
  revokedByUserId NOT NULL FK User
  reason, createdAt, correlationId
  UNIQUE (targetInstitutionId, impersonationApprovalId)
  FK (targetInstitutionId, impersonationApprovalId) → ImpersonationApproval(targetInstitutionId,id)
  -- append-only; revocar inserta esta fila y nunca modifica la aprobación
  -- constraint trigger/policy exige decision=APPROVED y misma Institution
  -- policy relee approval+expiry+revocation por request; revocation gana ante concurrencia

AuditEvent
  id PK
  eventClass TENANT|PLATFORM|SERVICE|SECURITY
  targetInstitutionId nullable
  realActorUserId nullable
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
helper, no UPDATE/DELETE. La mutación, AuditEvent y **fila de outbox** se insertan y confirman dentro de una misma
transacción; solo el dispatcher ejecuta el efecto externo después del commit, con claim e idempotencia propios.

### 7.4 Relaciones tenant-aware e índices

Cada entidad tenant expone `UNIQUE(institutionId,id)`. Relaciones como Assignment→Course, Enrollment→Course/Membership,
Submission→Assignment/Enrollment y OrganizationalUnitMembership→Unit/Membership usan FK compuestas. El patrón se aplica
a ExamQuestion, ExamAnswer, assets, guardianship, targets, programa/grupo y revisiones.

Cada tabla tenant tiene al menos un índice útil que comienza por `institutionId`, y todo patrón tenant-scoped usa ese
prefijo. Excepciones documentadas: PK global, `InstitutionDomain.hostCanonical`, canonical email, token hashes y lookup de
plataforma/preauth. Cada excepción incluye consulta, cardinalidad, plan y grants; no existe la regla falsa de que todo
índice de cualquier tipo deba iniciar con `institutionId`.

### 7.5 Excepciones globales candidatas y límite auth

Allowlist sujeta a `HD-07`: `Institution`, User/Identity, Auth.js estrictamente global, SystemRoleTemplate,
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
  únicamente la tabla de mapeo/proyección y esta función, no otras tablas tenant;
- `InstitutionDomain` contiene `institutionRoutingStatus` y `routingVersion`, sincronizados en la misma transacción que
  cada cambio de lifecycle de Institution y su AuditEvent/outbox. Mientras `HD-11/HD-26` no aprueben invalidación
  distribuida, el resolver consulta DB en cada request y no usa cache de autoridad positiva/negativa;
- una cache futura requiere key/version canónicas y acknowledgement de todas las réplicas antes de confirmar el cambio;
  cualquier versión stale niega. `HD-11/HD-25/HD-26` ratifican estados, excepción y mecanismo;
- en esta opción `InstitutionDomain` tiene RLS habilitado pero no FORCE RLS, de modo que solo el owner-definer puede leer;
- el caller `edukana_host_resolver` es no-owner/NOBYPASSRLS, carece de SELECT directo y solo recibe EXECUTE;
- fija `search_path` explícito a `pg_catalog` y schema de la función;
- usa SQL estático, igualdad exacta sobre `hostCanonical`, dominio `VERIFIED` y routing state permitido;
- devuelve siempre el DTO interno único `ResolvedInstitutionRoute` con `institutionId`, `canonicalHost`,
  `domainStatus`, `institutionRoutingStatus` y `routingVersion`; la autoridad pública derivada no expone los tres últimos
  campos ni otros datos;
- devuelve cero filas ante unknown/revoked/no-routable y error cerrado ante duplicado o versión contradictoria;
- no acepta Institution ID, slug, query o body como fallback;
- no devuelve branding, membership o PII ni habilita un cliente general de plataforma.

Cambios de dominio/lifecycle se auditan. Requests unknown producen métricas rate-limited/agregadas, no un evento con PII
por intento. Se prueban sync transaccional de la proyección, ausencia de cache hasta aprobación, caller grants,
`search_path` hostile y, si se habilita cache, invalidación distribuida con request post-commit.

### 8.2 Algoritmo de autoridad de host

```ts
type ResolvedInstitutionRoute = Readonly<{
  institutionId: string;
  canonicalHost: string;
  domainStatus: "VERIFIED";
  institutionRoutingStatus: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  routingVersion: number;
}>;

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
- Por petición se releen User, Membership, RoleAssignment, Institution, roles, permissions, scopes, modules y plan.
- `/api/auth/session`, páginas, actions, APIs y jobs que actúan por una persona aplican la misma revalidación viva; la
  primera petición nueva después de una revocación falla cerrada según `HD-04`.
- Cookie tenant candidata: `__Host-edukana.session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`.
- CSRF valida Origin contra host canónico. Return target solo acepta path relativo o host exacto allowlisted.
- La transición PLATFORM→TENANT emite secreto aleatorio; persiste solo hash, issuer session, User, Membership destino,
  host destino, nonce, `issuedAt`, `expiresAt≤60s`, `consumedAt`.
- Redemption bloquea/actualiza una sola fila atómicamente, revalida todo, rota session ID y rechaza replay/concurrencia.
- UNKNOWN nunca redirige ni consume sesión tenant.

### 9.1 Adaptador legacy N/N-1 aún bloqueante

La forma observada de N-1 usa `sub` (User/membership legacy), `idn` opcional, `sv` opcional, `role` e `institutionId`.
`role` e `institutionId` solo son hints para comparar y nunca autoridad. `HD-04` no cierra hasta que `HD-05/HD-15`
produzcan una matriz con una fila por claim y versión:

| Caso | Lookup obligatorio | Resultado cerrado |
|---|---|---|
| `sub` + `idn` + `sv` | `sub`→`User` existente/evolucionado; `idn`→`Identity` transitoria si esa versión la emite; ambos deben mapear al mismo `User` y a una Membership/asignación activa única | missing, mismatch, duplicado, estado/version stale o assignment ambiguo niega. |
| `sub` sin `idn` | Solo durante ventana aprobada y únicamente si backfill demuestra mapping global único | ausencia/colisión o ventana vencida niega; no infiere por email del token. |
| `sv` ausente | Puede tratarse como 0 solo si la entidad viva elegida por HD-05 tiene versión 0 y mapping único | live≠0, entidad sin versión o shape desconocido niega. |
| Token objetivo consumido por N-1 | HD-15 decide si hay dual-issue compatible o si N-1 se drena antes de emitirlo | nunca se presupone que N-1 entiende Membership/assignment locators. |

La matriz final fija issuance/consumption, reissue, triggers de identity/Membership/assignment versions, coexistencia,
drain, stable window, cutover y rollback. Cada forma se prueba en `/api/auth/session`, pages, actions, APIs y jobs bajo
revocación concurrente e identity-store failure. Hasta entonces, el diseño es fail-closed y `HD-04` OPEN_BLOCKING.

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
  impersonation: {
    id: string;
    operatorId: string;
    targetRoleAssignmentId: string;
    authorityMode: "OWNER_CONSENT" | "BREAK_GLASS";
    allowlistVersion: string;
    status: "ACTIVE";
    expiresAt: Date;
  } | null;
  databaseMode: "TENANT" | "AUTH" | "PLATFORM" | "NONE";
};
```

`cache()` memoiza solo dentro del request. `withTenantData(ctx, fn)` abre la interactive transaction, fija
`app.institution_id`, verifica su valor y entrega un transaction client que no escapa.

`can()` evalúa primero la policy de lifecycle registrada para la operación: negocio exige `ACTIVE`; recovery en
`SUSPENDED`/`CANCELLED` solo procede por la allowlist mínima de `HD-25`, con capability y auditoría separadas. Después
evalúa module/plan → capability → scope → relationship → resource state → operation policy. El DAL carga una proyección
mínima para la decisión. Navigation y transport comparten `policyId`.

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
| `Membership` | cada `User` existente; `Identity` solo como evidencia transitoria de reconciliación cuando exista | conservar `User.id`; `(institutionId,userId)` deriva de pertenencia legacy única y colisiones de email se resuelven por la política aprobada | missing_identity_mapping, email_collision, duplicate_membership |
| `CourseModule` | `Course` | module.courseId→course.id; tenant=course.institutionId | missing_course, duplicate_parent |
| `Enrollment` | `Course` + student/User | course.tenant=student.tenant=target tenant | missing_course, missing_student, mixed_tenant |
| `Assignment` | `Course` | assignment.courseId→course.id | missing_course, existing_tenant_mismatch |
| `Submission` | `Assignment` + `Enrollment` + student/User | assignment.tenant=enrollment.tenant=student.tenant | missing_path, mixed_tenant, duplicate_attempt |
| `ExamQuestion` | `Exam` + `QuestionBankItem` | exam.tenant=item.tenant | missing_exam, missing_item, mixed_tenant |
| `ExamAnswer` | `ExamAttempt` + `QuestionBankItem` | attempt.tenant=item.tenant | missing_attempt, missing_item, mixed_tenant |
| `OrganizationalUnitMembership` | explicit Institution + Unit + User/Membership | row.tenant=unit.tenant=membership.tenant | missing_unit, missing_membership, mixed_tenant |
| `AuditEvent` desde `AuditLog` legacy | AuditLog + actor/User + entity/operación + control-plane registry | derivar target tenant solo con una fuente única; null solo para clase platform/global aprobada | missing_actor, ambiguous_target, invalid_global_class, retention_unknown |

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

Mientras N-1 sirve tráfico, `legacy_authoritative` gobierna. N dual-writea atómicamente y usa shadow-read sin cambiar
responses; un catch-up idempotente recurrente absorbe filas creadas por N-1 después de cualquier backfill. Antes de
cutover se drena N-1 y se cumple una stable window **CANDIDATE de 24 h** con cero divergencia de seguridad/tenant;
`HD-15` aprueba o reemplaza la duración y el criterio. El cutover firmado registra SHA, versiones, última ejecución
catch-up y oráculos. Antes de ese evento, rollback despliega N-1 con reads legacy y conserva schema aditivo; después, el
incidente es forward-fix salvo rollback compatible aprobado.

### 14.4 Rollout lock-safe de keys y FKs

Por cada edge: (1) crear/verificar índice padre UNIQUE `(institutionId,id)` por método low-lock aprobado; (2) crear índice
hijo `(institutionId,parentId,...)`; (3) adjuntar candidate key; (4) añadir FK compuesta `NOT VALID` cuando se soporte;
(5) validar solo tras cero nulls tenant-required, orphan y mixed tuples. Se conservan FK simples y acciones ON DELETE/ON
UPDATE durante N/N-1. Solo se retiran duplicados después de cutover, clasificación de retención/cascade y EXPLAIN.

### 14.5 Matriz exhaustiva de predecesores y budgets

El manifest enumera los 16 estados post-migración y demo actual, cada uno `SUPPORTED|EXCLUDED`, con supuestos de
población, fixture, postflight y evidencia. Excluir exige prueba de imposibilidad de datos o de-support humano. Alpha
supported exige reconciliación separada sin cambiar la migración histórica. Hasta decisión `HD-13`, `OPEN` no equivale a
`SUPPORTED` ni `EXCLUDED` y bloquea READY:

| Estado representado | Disposition | Evidencia local conocida / fixture-postflight pendiente |
|---|---|---|
| 01 `20260930000000_alpha_baseline` | OPEN | Fixture poblado con Attendance falla al aplicar migration 02; decidir support+reconciliation o de-support explícito. |
| 02 `20261001193000_real_edukana_mvp` | OPEN | Fixture bounded llegó a current; registrar fixture/postflight definitivo. |
| 03 `20261003231500_role_capability_overrides` | OPEN | Fixture bounded llegó a current; registrar fixture/postflight definitivo. |
| 04 `20261003234000_guardianship` | OPEN | Fixture bounded llegó a current; registrar fixture/postflight definitivo. |
| 05 `20261004111500_advanced_announcements` | OPEN | Fixture bounded llegó a current; registrar fixture/postflight definitivo. |
| 06 `20261004223000_announcement_image_mimes` | OPEN | Fixture bounded llegó a current; registrar fixture/postflight definitivo. |
| 07 `20261008160000_s1_security` | OPEN | Postflight local retuvo cinco tenant keys null tras writes posteriores al backfill. |
| 08 `20261008190000_s1_grade_autograded` | OPEN | Postflight local retuvo cinco tenant keys null. |
| 09 `20261008220000_s2_identity` | OPEN | Postflight local retuvo cinco tenant keys null y tres Users sin Identity. |
| 10 `20261009040000_curso_completo` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 11 `20261009120000_tanda_3` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 12 `20261009180000_video_leccion` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 13 `20261009182000_preferencias_notificacion` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 14 `20261010100000_backoffice_suspension` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 15 `20261010110000_backoffice_planes` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| 16 `20261010120000_backoffice_avisos` | OPEN | Mismos gaps del estado 09 en fixture bounded. |
| Demo/seed actual sobre 16 | OPEN | Seed local terminó, pero dejó 3 Users sin Identity y nulls en Enrollment/Assignment/Submission/ExamQuestion. |

Ninguna fila puede omitirse. Para cambiar `OPEN` a `SUPPORTED` se exige fixture/postflight/checksum/rollback aprobado;
para `EXCLUDED`, prueba de no población o decisión humana de desoporte con fecha/autoridad.

`HD-14` no se cierra con “valores por entorno”: registra lock/statement timeout separados para metadata DDL, concurrent
index y validation; batch min/initial/max y transaction target; retryable SQLSTATE, backoff/caps; write-pause, maintenance
window y abort thresholds; además de tamaños/tráfico/planes que justifican cada valor. Phase A propuso, sin evidencia de
capacidad remota, este baseline **CANDIDATE** para validar o reemplazar por entorno:

| Campo | Valor candidato no aprobado |
|---|---|
| metadata DDL lock/statement | 2 s / 30 s |
| concurrent index lock/statement | 2 s / 30 min |
| constraint validation lock/statement | 2 s / 15 min |
| backfill batch min/initial/max | 100 / 500 / 2000 rows |
| backfill transaction target; statement/lock | 250 ms; 5 s / 500 ms |
| retryable SQLSTATE/backoff/cap | `55P03`, `40001`, `40P01`; jittered 0.5/1/2/4/8 s; 5 batch retries |
| DDL retry | 3 attempts, 30/60/120 s |
| write pause | máximo candidato 60 s |
| maintenance window | OPEN por entorno |
| abort | cualquier otro SQLSTATE, anomalía inexplicada, 10 lock timeouts consecutivos, índice inválido o ventana excedida |

Aprobar exige medidas autorizadas de tamaño, cardinalidad, tráfico, pooler y plan. Estos valores no acreditan capacidad ni
autorizan ejecución.

### 14.6 Rollback de RLS

Antes de M5 se provisiona y prueba el rol rollback no-owner/NOBYPASSRLS con policies compatibles. Nunca se vuelve a una
credencial owner/BYPASSRLS/desconocida. Si ese rollback no existe, M5 se clasifica forward-fix-only antes del go/no-go;
la activación no puede comenzar hasta aprobación humana. Contract M6 es irreversible por defecto y requiere restore
probado y decisión separada.

## 15. Fixtures, capas y oráculos

### 15.1 Fixture manifest

Cada uno de los 16 estados post-migración y el demo actual fija: disposition `SUPPORTED|EXCLUDED`, fundamento/evidencia,
SHA/migration state, IDs, UTC clock, timezone/locale, random seed, Institutions, usuarios, roles/scopes,
relaciones/estados, row counts, anomalías, bytes y SHA-256 de archivos, checksum esperado, fixture/postflight IDs y
teardown. `EXCLUDED` requiere prueba de que el estado no pudo contener datos o decisión humana de desoporte. Cada run usa
namespace propio y termina con cero filas/objetos residuales; alpha supported incluye la reconciliación inmutable.

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

### 15.4 Manifest de trazabilidad pre-READY

La tabla siguiente **es el manifest inicial en forma compacta**. Cada ID contenido en un rango representa una fila lógica
independiente, no una obligación agrupada; la expansión determinista enumera todos los enteros del rango, conserva el
perfil enlazado y falla ante huecos/duplicados. Para cada fila lógica, `owner=UNASSIGNED`,
`commandOrNOT_YET_IMPLEMENTED=NOT_YET_IMPLEMENTED`, `artifactOrPending=PENDING` y `status=BLOCKED`. El perfil aporta
`policyIds/evidenceLayer`, fixture, oráculos/deltas y externalDependencies/stopCondition. Esos valores abiertos son
bloqueos honestos, no ausencia de trazabilidad ni evidencia inventada. El schema expandido es:

```text
requirementId, testId=TR-<requirementId>, profileId, policyIds, evidenceLayer, fixtureId,
positiveOracle, negativeOracle, expectedDbAuditOutboxStorageDeliveryDeltas,
owner=UNASSIGNED, commandOrNOT_YET_IMPLEMENTED=NOT_YET_IMPLEMENTED,
artifactOrPending=PENDING, status=BLOCKED, externalDependencies, stopCondition
```

| Obligaciones que deben expandirse una por fila | Perfil mínimo | Estado actual / gate |
|---|---|---|
| R-01.1..R-01.11 | HOST: unit+HTTP+DB resolver; fixtures platform/tenant/unknown/revoked/duplicate/lifecycle race; authority y cache deltas | `NOT_YET_IMPLEMENTED`; HD-02/11/25/26 |
| R-02.1..R-02.4 | SIGNUP: HTTP; config absent/unknown/invite/marketplace; cero Institution/Membership/subscription/audit en deny | `NOT_YET_IMPLEMENTED`; HD-03 |
| R-03.1..R-03.16 | IDENTITY: HTTP+DB; legacy/global/linking/collision/unlink/takeover; version/FK/audit deltas | `NOT_YET_IMPLEMENTED`; HD-05/06/12/15 |
| R-04.1..R-04.12 | MUTATION: HTTP+DB; mutationId/payload/revoke/response-loss/retry; exact row/audit/outbox/object/delivery deltas | `NOT_YET_IMPLEMENTED`; producer HDs+HD-14/15 |
| R-05.1..R-05.17 | AUTHZ: HTTP+DB; role/scope/relation/state/impersonation; allow/deny and concurrency oracles | `NOT_YET_IMPLEMENTED`; HD-05/06/17/25 |
| R-06.1..R-06.5 | NAV: integration+E2E; route/menu/tab/search/prefetch; cero loader/count disclosure | `NOT_YET_IMPLEMENTED`; surface registry |
| R-07.1..R-07.9 | BOUNDARIES: lint+HTTP+DB+Storage; imports/projections/path/URL revoke; secret scan and object deltas | `NOT_YET_IMPLEMENTED`; HD-07/09/22 |
| R-08.1..R-08.7 | INTEGRITY: DB; table/edge manifest; insert/update mixed-tenant negatives and EXPLAIN artifacts | `NOT_YET_IMPLEMENTED`; HD-07/08/14/16 |
| R-09.1..R-09.7 | RLS: DB as app/resolver; role catalog/context/policy operation matrix; row/SQLSTATE oracles | `NOT_YET_IMPLEMENTED`; HD-09/10/11 |
| R-10.1..R-10.15 | MIGRATION: DB; all 16 states+demo, quarantine/checksum/restart/N-N-1/locks; exact count/hash/rollback | `NOT_YET_IMPLEMENTED`; HD-13/14/15/16/21 |
| R-11.1..R-11.9 | SESSION: HTTP+DB; every token shape/surface/revoke/ticket/proxy; cookie/redirect/audit deltas | `NOT_YET_IMPLEMENTED`; HD-01/04/05/15/26 |
| R-12.1..R-12.7 | AUDIT: DB+HTTP; actor/target/class/redaction/append-only/counseling; event/no-event oracle | `NOT_YET_IMPLEMENTED`; HD-16/17 |
| R-13.1..R-13.10 | UX/PWA: E2E+manual AT; state/lifecycle/client matrices; cache/network/focus/audit evidence | `NOT_YET_IMPLEMENTED`; HD-23/25/36/37 |
| R-14.1..R-14.15 | EVIDENCE/SLI/REC/REL: manifest validation+drills; event arithmetic/timers/approvals/source counters | `NOT_YET_IMPLEMENTED`; HD-19/20/21/22/24 |
| R-15.1..R-15.17 | REPORT: DB+HTTP+job+E2E; nine families/capabilities/snapshot/jobs/artifacts/hold; all side effects | `NOT_YET_IMPLEMENTED`; HD-16/38/39/40/41 |
| R-16.1..R-16.8 | DAG: document+manifest validation; producer state/ownership/dependencies/exact SHA | `NOT_YET_IMPLEMENTED`; HD-27..41 |

T03 valida la expansión determinista contra los números reales de requirements, cero IDs ausentes/duplicados y que ningún
owner, comando o artefacto inexistente se presente como real. Para G-READY, las filas fundacionales ligadas a
`HD-01..HD-26` sustituyen perfiles por fixtures/oráculos/deltas específicos. Las filas cuyo cierre depende exclusivamente
de `HD-27..HD-41` permanecen explícitamente `DEFERRED_TO_OWNER_SPEC`, con nodo dueño y stop condition, y no se cuentan
como evidencia fundacional ni como PASS; deberán cerrarse antes de ejecutar su nodo y antes de producción. T04 implementa
harnesses fundacionales solo después de G-READY y no elimina la cobertura contractual posterior.

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
  | { kind: "PLAN_LIMIT_REACHED"; contact?: SafeAction }
  | { kind: "NOT_FOUND" }
  | { kind: "RETRYABLE_ERROR"; correlationId: string };
```

- OFFLINE nunca encola una mutación sensible ni muestra éxito.
- **Authorization lease CANDIDATE (`HD-36`):** solo shell y lecciones de texto ya autorizadas pueden almacenarse cifradas
  para offline. Cada entrada queda ligada a User, session ID/version, Institution, resource ID/version y device ID,
  con `issuedAt`/`expiresAt`; la duración permanece abierta hasta decisión aprobada y no se inventa aquí.
- La apertura offline verifica integridad, binding, versión y tiempo confiable. Reloj atrasado, rollback de reloj o falta de
  una señal temporal confiable invalida la lease. Logout y cambios de sesión/rol/relación/tenant/lifecycle observados
  localmente purgan o inutilizan criptográficamente cache, índices y previews. Una revocación remota durante desconexión
  impide renovar y se aplica en el próximo check online confiable; el acceso residual queda acotado por `expiresAt`.
  Cambiar la versión del recurso tampoco extiende la lease existente. Login, exports, notas, pagos, archivos no cacheados
  y writes sensibles requieren red; jamás usan background sync.
- CONFLICT nunca auto-merge; conserva solo input que no pertenece a contexto anterior.
- SUCCESS sigue a commit confirmado y se verifica tras reload/sesión fresca.
- ERROR muestra “Código de referencia: {correlationId}” y control accesible para copiar.
- Guardian sin vínculo conserva perfil propio y avisos generales; no consulta hijos.
- `PLAN_LIMIT_REACHED` muestra una banda distinta de módulo/plan deshabilitado, no reintenta el alta y ofrece contacto
  solo cuando la persona tiene acceso a un canal autorizado.
- Archive, suspended y cancelled son estados distintos; `HD-25` define la matriz no resuelta.
- Los recorridos de ADMIN, TEACHER, STUDENT y GUARDIAN usan las rutas acotadas de `requirements.md` §8.

WCAG 2.2 AA se verifica con landmarks/headings, names/descriptions, error association, keyboard/focus restore, live regions,
contrast/non-color, text spacing, 320 CSS px reflow, 360 px y 200 %. La matriz WEB-1 de requirements R-13 fija Windows
Chrome/Edge/Firefox+NVDA, macOS/iOS Safari+VoiceOver, Android Chrome+TalkBack y Playwright Chromium/Firefox/WebKit,
con orientación, reduced motion, contraste, install/standalone, offline y versiones exactas. `HD-23` permanece abierto
hasta aprobación de dispositivos/capacidad y evidencia humana.

La matriz INST-1 de requirements R-13 separa SUSPENDED, CANCELLED y ARCHIVED_READ_ONLY por login/session, reads/writes,
jobs/delivery, export/download, retention/hold, reauth/restore/purge y auditoría. Suspensión no inicia purge; cancelación
inicia el reloj operacional candidato; archive es estado de recurso, no lifecycle institucional. Legal hold preserva pero
no concede acceso. `HD-25` permanece abierto hasta aprobación de producto/privacy/security/billing/retention.

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

### 18.1 SLI-1 CANDIDATE

Mes calendario UTC. Si no hay requests elegibles, resultado `UNKNOWN`. D cuenta outcomes del edge confiable de rutas
registradas core HTML, auth/session, Server Action, API y assets críticos para tráfico humano; excluye health/operator,
probes, abuso verificado y abandono pre-header con reason code retenido. N cuenta outcomes ≤10 s normalizados success,
redirect, validation rejection o policy denial sin server error. 5xx, edge 502/503/504, timeout, unclassified y 429 de
capacidad para usuario legítimo fallan. Deploy/maintenance/provider/overload/bug/operator no se excluyen. Availability=N/D
≥0.999; error=(D-N)/D; burn=error/0.001.

Probes: 60 s login HTML+asset desde dos ubicaciones independientes (una US East); 5 min password auth, session, dashboard,
DB tenant read y logout; 15 min private object read sin URL retenida. Page si 5m+1h burn≥14.4 o 30m+6h≥6; warning si
6h+3d≥1; dos fallos consecutivos de ambas ubicaciones page. Evidence registra signal/detect/notify, route, burn,
correlation, redaction, destination, ack y resolution. `HD-20` sigue abierto por aprobación, destino, retención e
instrumentación externas.

### 18.2 REC-1 CANDIDATE

Para cutoff declarado T0: DB RPO=T0 menos último commit marker restaurado≤T0; object RPO=T0 menos último object-manifest
event restaurado≤T0; achieved RPO es el peor y debe ser ≤3600 s. RTO empieza al declarar drill/incidente y tratar origen
como unavailable. Termina solo después de startup, password auth, live-session revocation, cross-tenant denials,
representative reads/writes, job safety, private-object retrieval, purge/hold/expiry/revocation replay y release-owner
acceptance; debe ser ≤14400 s.

El drill usa DB restore provider-native y object restore independiente hacia destino aislado, nunca producción. Registra
backup/PITR IDs, fingerprints, migration SHA, counts/checksums, object hashes/missing, timestamps, RPO/RTO, auth/authz,
source read-only/write counters, recovery owner, independent data/security reviewer, release authority y cleanup.
`HD-21/HD-22` siguen abiertos hasta recursos autorizados, gasto/provisioning y drill medido.

### 18.3 REL-1 CANDIDATE

READY, implementation start, merge, migration, deploy, release, restore, purge y rollback son approvals separados sobre
el mismo commit/evidence manifest. Writer no es independent reviewer; deployment executor no aprueba su deploy; release
owner decide al final. Migration requiere data owner, independent migration reviewer, restore evidence, compatibility y
release manager. Purge/contract requiere approval irreversible adicional.

Incident Commander solo puede application rollback a last-known-good compatible. DB restore, policy rollback, purge
reversal o rollback que debilita isolation requiere data+security authority; si no existe opción segura, forward-fix.
Ledger: actor, role, transition, environment, commit/deployment, scope, timestamp, evidence hash, decision, expiry y
correlation. `HD-19/HD-24` siguen abiertos hasta identidades y enforcement externo.

### 18.4 Frontera de reportería para handoff a spec 14

Esta sección diseña el límite; no implementa reportes ni modifica la spec 14.

**Registro y autorización.** Un `ReportRegistry` versionado define por `reportId` el owner, familia, dominios
productores, permisos vigentes, parámetros, estados, formatos, proyecciones de salida y sensibilidad por campo. El
catálogo mínimo no puede omitir académico, asistencia, evaluación, progreso/finalización, carga docente, admisiones,
finanzas por moneda, uso/límites ni auditoría/seguridad; para cada familia fija productor, campos, granularidad,
dimensiones, owner y reconciliación. Cada versión allowlista filtros, ordenamientos y agrupaciones con tipo, operador,
límite, default, normalización y sensibilidad para impedir inferencias por campos ocultos.

El policy path es único:

```text
RequestContext o ServiceContext registrado
  → capability de familia explícita:
      report.academic (académico/asistencia/evaluación/progreso/carga docente)
      report.sales (admisiones)
      report.finance (finanzas por moneda)
      report.usage (uso/límites)
      report.audit (auditoría/seguridad)
  → report.export adicional para export; policy restrictiva para schedule/delivery
  → operación view|request|download|schedule|delivery|cancel|retry
  → field projection + filters allowlisted + scope y relación
  → DAL tenant con proyección allowlisted
  → RLS por Institution
```

Ningún ID, URL, filtro, vista guardada, schedule o parámetro cliente crea autoridad. El permiso de dominio no concede
exportación, y el permiso de exportación no concede entrega posterior.

**Exactitud temporal y financiera.** Cada ejecución fija versión del reporte y agregado, parámetros canónicos, timezone,
semántica `asOf` e intervalos, y un snapshot/watermark común para todas sus secciones. Los agregados son deterministas.
Importes de monedas distintas nunca se suman; se separan por moneda o se convierten mediante una tabla versionada con
fuente y timestamp explícitos. Freshness, linaje y reconciliación publican fuentes, transformaciones, conteos, sumas,
excepciones y diferencias; una diferencia no aprobada bloquea el estado publicable.

**Jobs y artefactos.** Exportar crea un job asíncrono, auditado e idempotente. Su clave usa serialización canónica
versionada de Institution, actor, `reportId`/versión, parámetros, snapshot y formato; se guarda con payload hash y
`UNIQUE(institutionId,idempotencyKey)`. El claim transaccional produce a lo sumo un job/artefacto y la misma key con otro
payload da `CONFLICT`.

La máquina válida es `QUEUED→RUNNING|CANCELLED`, `RUNNING→SUCCEEDED|FAILED|CANCELLED`, `FAILED→QUEUED` bajo retry
acotado y `SUCCEEDED→EXPIRED`; `CANCELLED`/`EXPIRED` son terminales. El worker mantiene lease/heartbeat y recupera un
`RUNNING` abandonado sin duplicar; una cancelación confirmada impide éxito tardío. El progreso es monotónico. Solo
`SUCCEEDED` produce un artefacto privado completo con checksum, tamaño, owner, Institution, sensibilidad y expiración;
no se registra URL firmada. La disponibilidad del artefacto termina exactamente a 30 días incluso bajo legal hold. El
hold conserva bytes contra purge físico pero no amplía download/delivery/login/impersonación ni cambia `expiresAt`; una
retrieval legal futura requiere superficie, capability, doble aprobación, TTL y auditoría separados. Los 90 días solo
aplican a datos operacionales de matriz aprobada; evidencia académica y clases no clasificadas se excluyen del purge.
Restore aplica hold/tombstones antes de abrir acceso.

Cada download y delivery reautoriza actor/sesión, Institution, capabilities, scope, estado, clasificación y expiración.
Los formatos mínimos son CSV con encoding/esquema versionado y PDF accesible con estructura, lectura, tablas, etiquetas,
contraste y metadata verificadas. Saved views y schedules guardan owner, versión, parámetros validados, timezone y
recipients autorizados. Bajo el contrato **CANDIDATE `HD-41`**, una ocurrencia tiene identidad única
`(scheduleId,scheduleVersion,occurrenceAtUtc)`: retries y recovery reutilizan esa identidad. La versión congela timezone y
regla civil; `HD-41` debe escoger explícitamente semántica para gaps/folds DST, missed runs durante downtime, catch-up,
overlap y concurrencia. Editar crea una versión nueva con `effectiveAtUtc`, sin reasignar ocurrencias anteriores; cancelar
impide claims nuevos. La ocurrencia conserva un recipient snapshot para trazabilidad, pero generación y delivery
reautorizan a cada destinatario. Cada envío tiene idempotency key
`(scheduleId,scheduleVersion,occurrenceAtUtc,recipientId,channel,reportArtifactVersion)`. Ninguna opción concreta de
DST/missed-run/overlap/edit-cutover/cancelación se presume antes del cierre de `HD-41`.

REP14 define una matriz `operación × resultado × AuditEvent` para lectura sensible, solicitud, generación, descarga,
delivery, cancelación, retry, expiración, saved views, schedules y denegaciones. Cada evento aplicable registra actor
real/efectivo, impersonación/motivo, Institution, reporte/versión, snapshot, parámetros canónicos redactados, destino,
resultado y correlation ID; cada oracle también declara cuándo no debe emitirse evento.

**Pruebas negativas.** La suite altera URL, `reportId`, job/artifact/saved-view/schedule IDs, user, role, Institution,
fields, filters, states y expiración. Verifica 404/denial, cero rows/objects/delivery, retry no duplicado, artefacto parcial
no descargable y AuditEvent requerido o prohibido. Las pruebas corren como rol app con DAL/RLS, nunca owner.

**Gate de dependencia.** El handoff `REP14` solo se prepara cuando un manifest enumera todos los campos y agregados y
cada spec productora correspondiente está `DONE`. La spec 14 necesita claim, revisiones y transición READY propios antes
de implementar registro, queries, jobs, artifacts, saved views o schedules. Este gate es bloqueante para producción.

### 18.5 DAG de aula y reportería

Este DAG solo registra dependencias en spec 00. No modifica ni promueve specs 05–10, 14 o 15.

| Nodo | Requiere | Contrato de salida y gate | Stop condition |
|---|---|---|---|
| D00 scope/evidence lock | PR #130 baseline `bdb1a9d`; base `d165029`; claim SPEC00 | Base exacta, baseline pre-edit etiquetada, diff local limitado; commit candidato futuro y hashes requeridos antes de rerun reusable | Base/claim cambia, no hay revision inmutable o aparece archivo ajeno |
| D01 trusted foundation | D00; identidad/Membership y estructura productoras | Contexto, authz, DAL/RLS, tenant integrity, audit/outbox, Storage, migration y restore DONE | Cualquier HD fundacional o rollback abierto |
| D02 Course/Offering | D01; `HD-27` | Course reusable/versionado; Offering posee ejecución, staff, participantes, fechas, precio y resultados | Ownership solapado o backfill ambiguo |
| D03 enrollment/staff | D02; `HD-28` | OfferingStaff y Enrollment con roles, capacidad, estados e historia | Oversubscription, duplicado o pérdida de evidencia |
| D04 ClassSession | D03; `HD-29` | MeetingPattern materializa ClassSession idempotente con participación, tiempo y tipo separados | Excepción/DST ambiguo o cambio destructivo |
| D05 content/calendar/files | D02+D04; `HD-35`; foundation Storage | Contenido versionado; archivos privados; calendario proyectado y deduplicado | Path cliente, audiencia ausente o URL tras revocación |
| D06 assignments | D03+D05; `HD-30` | Assignment de Offering e intentos inmutables con retry/reconnect definidos | Única fila mutable o resultado de retry ambiguo |
| D07 exams | D03+D05; `HD-31` | ExamAttempt congela versión/orden; answer save idempotente y evidencia retenida | Orden no congelado, save sin versión o delete destructivo |
| D08 gradebook | D06+D07; `HD-32` | Cálculo versionado, publicación snapshot, close/reopen y reconciliación | Resultado publicado cambia sin recalculation auditada |
| D09 attendance | D03+D04; `HD-33` | Attendance sobre ClassSession/daily mode aprobado con correcciones inmutables | Course/date ambiguo o borrado de evidencia |
| D10 communication | D04+D05+D06+D07+D08+D09; `HD-34` | Announcement/Message/Notification con files/calendar context, recipient policy, mutationId/status lookup y outbox atómico | Best-effort post-commit, política ausente o exposición de file/calendar |
| D11 four journeys | D03..D10; `HD-37`; requirements §8 | Cuatro contratos base sin reportería: ADMIN crea Course/Offering→staff/enrollment→hybrid week→attendance/grade close→communication; TEACHER session→content/files→assignment/exam→attendance→grade/correction→message; STUDENT Today→content→submission/exam reconnect→calendar/messages/published results; GUARDIAN child→schedule/attendance/assessment/grades/files/comms→justification. Todos con persistencia/fresh session y negativas. Las extensiones de reporte pertenecen a D17 después de D14/D15. | Ruta/fixture/client/owner no congelados, SQL manual, datos ocultos o SHA distinto |
| D12 resilience/AT/PWA | D11; `HD-23/HD-36` | Estados degradados, 320/360 px, 200 %, keyboard/AT y offline seguro | Write queued offline, cache stale o AT humano faltante |
| D13 producer manifest | D01..D10; admissions/finance/usage/audit productores DONE; `HD-38` | Nueve familias con report IDs, sources, fields, sensitivity, freshness, lineage y reconciliation | Productor no DONE o familia/campo omitido |
| D14 spec14 READY | D13 | Claim, cinco revisiones y transición READY propios de spec 14 | Editar spec 14 bajo SPEC00 o implementar desde DRAFT |
| D15 registry/query/security | D14+D01; `HD-39/HD-40` | Registry, filtros, field projection, DAL/RLS, snapshot, currency y publish gate | Permiso legacy único, bypass DAL o mixed currency |
| D16 export/schedule/delivery | D15+D10; `HD-41/HD-16` | Job idempotente, artefacto privado, CSV/PDF, saved views, schedules y reautorización | HTTP sync grande, artifact público o stale authorization |
| D17 reporting acceptance | D16+D12 | Nueve familias, roles/scopes, dos Institutions, reconciliación, freshness y negativas | Owner DB, oracle incompleto o semántica screen/export distinta |
| D18 preproduction block | D17; recovery/SLO/release gates | Manifest exact-SHA y aprobación owner+independent reviewer | Falta familia, lineage, reconciliation, field gate o tenant negative |

Las nueve familias obligatorias en D13 son: académico, asistencia, evaluación, progreso/finalización, carga docente,
admisiones, finanzas por moneda, uso/límites y auditoría/seguridad. Cada una declara productor y estado `DONE`,
`reportId`/versión, campos, granularidad, dimensiones, sensibilidad, owner, aggregate version, snapshot, freshness SLO,
lineage y reconciliation oracle. Seguridad de D15 cubre filtros ocultos y field-level inference. D16 cubre exportación,
scheduling y delivery. D17 corre como rol app y prueba el límite multi-tenant con row/object/delivery/audit oracles.

## 19. Threat model

| Amenaza | Control | Evidencia |
|---|---|---|
| Unknown/stale domain | Triestado y resolver mínimo. | unknown/revoked/duplicate/cache tests. |
| Header/proxy forgery | Topología/hop exactos; contradiction deny. | Host/Forwarded/XFH matrix. |
| Client tenant hint | Ignore slug/ID outside trusted context. | login/action/API tampering. |
| Preauth privilege | SECURITY DEFINER estrecha, grants/search_path. | caller cannot SELECT; hostile search_path. |
| Cross-tenant graph | Composite FK, typed scope, RLS. | INSERT/UPDATE/SELECT/DELETE negatives. |
| Stale/replayed session | Live versions, audience, one-use ticket; legacy adapter fail-closed. | token-shape matrix, next request, replay/concurrent redeem. |
| OAuth collision/takeover | ProviderAccount global; verified claims; no auto-link; recent reauth; last-method; token revoke/sessionVersion. | collision, provider email change, unlink, compromise y N/N-1 negatives. |
| Authorization TOCTOU | Transactional revalidation/version predicate. | concurrent revoke causes zero mutation. |
| Duplicate/unknown mutation outcome | mutationId+payloadHash, original-result replay, status lookup, bounded retry y atomic audit/outbox. | duplicate/conflicting payload, lost response, concurrent retry y exact side-effect deltas. |
| Platform privilege | Separate role/capability/impersonation, target assignment, authority approval y immutable allowlist. | no/expired/revoked impersonation, denylist y concurrent revoke/read. |
| Global identity exposure | Auth-only grants/projections. | tenant/support/reporting enumeration denied. |
| Owner/BYPASSRLS | App non-owner; FORCE decision; safe rollback. | catalog/role comparison. |
| Pool leakage | Transaction-local setting, small-pool concurrency. | tenant alternation and invalid context. |
| Raw Prisma | Allowlist/lint/inventory and review. | zero imports outside boundaries. |
| Job confused deputy | Explicit service actor, tenant and operation. | altered/missing job context. |
| Storage service role | Exclusive broker, metadata-derived path. | bundle scan and cross-tenant tests. |
| Counseling disclosure | Dedicated policy; break-glass only. | owner/support/export denied. |
| Audit tampering | Append-only grants, real/effective actors. | update/delete denied. |
| PII/minor data | Minimal DTO and field redaction. | artifact/error scanner. |
| Report cross-tenant/field disclosure | Registry, output projection, capabilities y DAL/RLS. | URL/ID/user/role/tenant/field negatives. |
| Inconsistent or false aggregate | Versioned deterministic aggregate, common watermark, currency separation, lineage y reconciliation. | fixed-fixture totals, as-of/timezone and producer reconciliation. |
| Export replay or stale authorization | Async idempotent job, private checksummed artifact y reauthorization per download/delivery. | concurrent retry, revoke, expire, cancel and partial-artifact negatives. |
| Expensive backfill | Budgets, batches, checkpoints, cancel. | scaled fixture and forced interruption. |
| Unsafe rollback | Safe role/policy or forward-fix-only. | role properties and post-rollback proof. |

## 20. Review and promotion

The package of evidence separates:

- **verified facts:** file, symbol, migration, test or SHA;
- **inferences:** runtime/data hypotheses awaiting evidence;
- **candidate choices:** proposed but not approved;
- **human inputs approved:** `AHD-01..AHD-10`, con aprobador, evidencia durable, valor y fecha;
- **technical decisions:** la revalidación viva está aprobada; `HD-01..HD-26`, incluido `HD-04` por compatibilidad,
  bloquean G-READY hasta owner, evidence, compatibility y rollback. `HD-27..HD-41` permanecen abiertos en sus specs
  dueñas y bloquean sus nodos y producción, no la promoción fundacional;
- **review resolutions:** each objective finding mapped to a clause and check. Las cinco revisiones iniciales sobre el diff
  local dieron NEEDS_FIX; después de un commit candidato autorizado deben repetirse todas las lanes afectadas sobre ese
  mismo SHA. `bdb1a9d` es baseline pre-edit, no identidad de los bytes locales actuales.

Promotion order is G0 → F0 → E0 → H0 (`HD-01..HD-26`) → F1 → G-READY. La excepción G0 del 2026-11-16 permite únicamente F0 y
el handoff `S0-GOV`; no salta E0, H0, F1 ni READY. Approving this design or opening a draft PR does not authorize
implementation, migration, merge, deployment, database access or production release. Reporting además permanece
bloqueado hasta el handoff `REP14`, todos sus productores `DONE` y la aprobación independiente de la spec 14.
