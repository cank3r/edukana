# 00 · Límite institucional confiable y autorización de petición — Requisitos

**Estado:** DRAFT-CANDIDATE
**Base autoritativa auditada:** `origin/todo/tanda-4` en `21b6b71ab166d7bfbad23d9c43a829f7afc17354`
**Fecha de evidencia:** 2026-11-15
**Claim:** `SPEC00-TRUSTED-BOUNDARY-20261115`
**Autoridad:** propuesta documental; no autoriza implementación, migración, merge ni despliegue.

## 1. Precedencia, coordinación y puerta de aprobación

1. El código y las migraciones de la base indicada describen lo construido. Las decisiones aprobadas de
   `.kiro/steering/current-state.md` prevalecen sobre steering o specs DRAFT incompatibles.
2. `.kiro/steering/spec-governance.md`, `tech.md`, `roles-permissions.md`, `simplicity.md` y este paquete deben
   reconciliarse antes de una transición de estado.
3. El claim de este trabajo existe en la rama de propuesta, pero no es ancestro de `origin/todo/tanda-4`. Por tanto,
   el gate de coordinación G0 sigue **PENDIENTE** hasta que la reserva sea visible mediante el mecanismo autoritativo de
   `TEAM-COORDINATION.md` o exista una excepción del coordinador documentada y trazable.
4. La asignación del 2026-11-15 autoriza continuar la revisión documental en esta rama aislada y abrir un PR DRAFT;
   no convierte el claim de rama en claim autoritativo ni satisface G0 para READY o implementación.
5. Las únicas actividades permitidas antes de READY son: edición/revisión de estos tres documentos, actualización de
   la fila propia de coordinación, inspección de repositorio y PR, y recolección **read-only** expresamente autorizada de
   roles, pooler, conteos, anomalías, tamaños, backups y límites operativos. Ninguna actividad pre-READY puede escribir
   código, schema, migraciones, datos, Storage, configuración o infraestructura.
6. El paquete permanece **DRAFT-CANDIDATE** mientras G0 esté pendiente, exista una decisión `HD-*` abierta o falte una
   aprobación humana independiente de arquitectura, seguridad, migraciones, producto y UX sobre los valores ya
   resueltos.
7. READY exige un cambio posterior, separado y autorizado. READY será prerrequisito explícito de todo harness nuevo,
   código de producto, DDL, migración o cambio operacional.
8. PR #129 es evidencia acotada de presentación de tareas. No acredita ni modifica este contrato fundacional.

## 2. Alcance

Esta spec define una sola frontera coherente para determinar y aplicar:

- autoridad de host `PLATFORM`, `TENANT` o `UNKNOWN`;
- identidad global, membresía institucional activa y selección de rol;
- disponibilidad de módulo/plan, capability, ámbito, relación con el recurso y estado;
- contexto único de petición para páginas, Server Actions, APIs y jobs;
- acceso a datos mediante límites DAL institucional, autenticación, plataforma y Storage;
- claves físicas `institutionId`, relaciones coherentes, roles PostgreSQL y RLS;
- migración aditiva, compatibilidad, backfill, validación, rollback y evidencia;
- navegación, estados de interfaz, recorridos esenciales y pruebas negativas.

## 3. No objetivos

Quedan fuera de esta spec:

- diseñar Course/Offering, ClassSession o ciclos académicos;
- rediseñar tareas, exámenes, calificaciones, asistencia o mensajería;
- habilitar marketplace, pagos en línea o alta de docentes independientes;
- implementar observabilidad general, backups o protección de ramas, salvo fijar evidencia y gates requeridos;
- cambiar Preview, producción, Supabase, bases de datos, Storage o configuración remota;
- implementar o corregir PR #129;
- renombrar `Institution`/`institutionId` a Tenant/tenantId;
- eliminar datos o contratos legacy durante una fase expansiva.

## 4. Inventario as-built y mapa de brechas

| Clasificación | Evidencia concreta en la base | Consecuencia normativa |
|---|---|---|
| Hecho verificado | `src/server/platform/domains.ts::resolveInstitutionHost()` devuelve `null` para plataforma y host desconocido. | La autoridad objetivo debe ser triestado. |
| Hecho verificado | `src/server/platform/domain-policy.ts::institutionMatchesHost()` acepta cualquier institución cuando el host resuelto es `null`. | `UNKNOWN` debe negar antes de autenticación o datos tenant. |
| Hecho verificado | `src/lib/auth.ts::authorize()` usa `institutionSlug` del cliente cuando no resolvió host. | Ningún hint del cliente puede crear autoridad TENANT. |
| Hecho verificado | `src/server/platform/independent-kind.ts::isIndependentSignupEnabled()` habilita por omisión. | El alta anónima debe quedar cerrada por omisión hasta decisión. |
| Hecho verificado | `src/lib/db.ts` exporta un `PrismaClient` sin contexto institucional. | El acceso institucional futuro debe pasar por DAL transaccional y RLS. |
| Hecho verificado | `src/lib/access.ts::canAccessDashboardPath()` permite rutas no declaradas. | Toda superficie no declarada debe denegar. |
| Hecho verificado | `src/app/dashboard/layout.tsx` exige sesión, pero no capability de ruta. | El layout no sustituye la guarda de recurso. |
| Hecho verificado | `src/app/api/auth/[...nextauth]/route.ts` exporta handlers; `auth()` revalida vida fuera de esos handlers. | `/api/auth/session` debe compartir la frontera de revocación. |
| Hecho verificado | `Enrollment`, `Assignment`, `Submission`, `ExamQuestion` y `ExamAnswer` permiten `institutionId` nulo. | No puede activarse el contrato final con nulls o grafos mixtos. |
| Hecho verificado | `CourseModule` no tiene `institutionId` físico. | Requiere clave física o excepción global aprobada. |
| Hecho verificado | `User` tiene un rol y unicidad `(institutionId, identityId)`. | El modelo legacy no expresa roles/ámbitos simultáneos. |
| Hecho verificado | `OrganizationalUnitMembership` referencia institución, unidad y usuario por separado. | La base no prueba que la tupla pertenezca a una sola Institution. |
| Hecho verificado | `20261008160000_s1_security` difiere `NOT NULL` a una migración `s1_security_enforce` inexistente. | La contracción necesita migración nueva y prueba de upgrade poblado. |
| Hecho verificado | `scripts/canonical-mvp-run.mjs::assertEmpty()` rechaza bases inicializadas. | El runner actual no prueba upgrades poblados ni rollback. |
| Control positivo | `src/server/session.ts::resolveSessionAccess()` relee estado, identidad y `sessionVersion`. | Debe conservarse y ampliarse a todas las superficies. |
| Control positivo | `src/server/courses/submission-files.ts` valida tenant, matrícula, entrega, asset y estado. | Sus negativas siguen como regresión al migrar DAL/RLS. |
| Control positivo | `src/server/family/guardian-portal.ts::authorizeChildren()` combina capability, vínculo, tenant y estado. | El vínculo sigue siendo requisito para datos del hijo. |
| Hecho verificado | PR #129 cambia 19 archivos, ninguno de schema, migraciones, auth o `src/server`. | No constituye evidencia de readiness fundacional. |
| Inferencia pendiente | El flujo de PR #129 que excluye un adjunto y edita de inmediato podría reutilizar un ID histórico. | Requiere reproducción con backend real; no se declara defecto confirmado. |
| Desconocido | Roles, grants, ownership, BYPASSRLS, pooler y políticas fuera del repositorio. | Exigen inventario read-only autorizado; no se asumen. |

## 5. Reconciliación de contratos DRAFT vecinos

Estos documentos tienen menor autoridad que steering y continúan DRAFT. El paquete no puede pasar a READY mientras una
cláusula incompatible pueda dirigir una implementación distinta.

| Documento y cláusula observada | Autoridad actual | Reemplazo candidato en spec 00 | Reconciliación posterior requerida |
|---|---|---|---|
| `01-platform-tenancy/design.md`, “Resolución de tenant” y rename a `Tenant/tenantId`. | DRAFT; contradice `current-state.md`. | Conservar `Institution/institutionId`; resolver host triestado y bootstrap mínimo. | Spec 01 debe eliminar rename, caché ambigua e inyección de `x-tenant-id` como autoridad. |
| `02-identity-auth/requirements.md`, Requisito 5 permite hasta cinco minutos al suspender cuenta. | DRAFT; `HD-04` sigue abierto. | Una sola semántica viva para página, action, API y `/api/auth/session`, con plazo aprobado. | Spec 02 debe adoptar el valor final de `HD-04`. |
| `03-roles-settings/design.md`, unión de roles y `tenantId`, scope en Membership. | DRAFT; modelo físico no aprobado. | Selección explícita de una asignación activa; roles tenant y scope con FK enforceable. | Spec 03 debe adoptar `HD-05/HD-06` y `Institution`. |
| `15-ops-privacy-quality/requirements.md`, WCAG 2.1 AA. | DRAFT; steering `tech.md` exige WCAG 2.2 AA. | WCAG 2.2 AA es el objetivo normativo de esta frontera. | Spec 15 debe elevar su cláusula y conservar evidencia humana. |

## 6. Requisitos normativos

Las opciones aún sujetas a una decisión humana se marcan **CANDIDATE**. No forman un contrato READY hasta registrar
opción, autoridad y fecha en `design.md` y regenerar requisitos, diseño, tareas y oráculos coherentes.

### R-01 · Autoridad de host y bootstrap cerrado

1. Toda petición HTTP debe resolverse exactamente a `PLATFORM`, `TENANT(institutionId, canonicalHost)` o `UNKNOWN`.
2. **CANDIDATE `HD-02`:** `UNKNOWN` responde 404 antes de login, sesión, contenido público o consulta tenant.
3. `PLATFORM` no infiere Institution desde slug, cookie, query, body, ruta ni cabecera del cliente.
4. `TENANT` solo procede de un subdominio asignado o dominio propio `VERIFIED` y vigente.
5. Host inválido, dominio revocado/obsoleto, alias no asignado, duplicado o autoridad reenviada no confiable produce
   `UNKNOWN`. Nunca se elige “la primera” fila duplicada.
6. La búsqueda preautenticación usa exclusivamente `resolve_verified_institution_host(normalized_host)`, una función
   `SECURITY DEFINER` revisada, propiedad de `edukana_host_resolution_owner` (`NOLOGIN`, `NOBYPASSRLS`), con
   `search_path` fijo, SQL estático y EXECUTE concedido solo al caller `edukana_host_resolver`.
7. En este candidato, `InstitutionDomain` tiene RLS habilitado pero no FORCE RLS: el owner-definer posee únicamente la
   tabla de mapeo y la función, y ningún otro dato tenant. Todos los roles runtime carecen de acceso directo. Esta única
   excepción debe ratificarse en `HD-11`; si se rechaza, READY exige una vista/tabla de control-plane equivalente.
8. La función solo devuelve `institutionId`, `canonicalHost`, `domainStatus` e `institutionStatus`; no devuelve marca,
   identidad, membership, plan, correo ni datos académicos. Cero o más de una coincidencia produce resultado cerrado.
9. El caller resolver es no-owner y `NOBYPASSRLS`; solo puede ejecutar la función. La función no expone un cliente general
   de plataforma y registra métricas agregadas sin PII; cambios/revocaciones de dominio sí generan auditoría.
10. Normalización, caché y revocación usan una clave canónica única. Una revocación invalida la caché antes de confirmar el
    cambio; el TTL positivo y negativo queda medido y aprobado.
11. La topología de proxy, header aceptado y hop count se cierra en `HD-26`. Hasta entonces, headers forwarded
    contradictorios o no verificables se tratan como `UNKNOWN`.

### R-02 · Alta anónima cerrada

1. El alta de docente independiente queda deshabilitada si falta configuración o contiene un valor desconocido.
2. Mientras `HD-03` siga abierto, ninguna ruta anónima crea Institution, suscripción, membership, período ni auditoría.
3. Una habilitación futura exige feature/plan, verificación, rate limit, antiabuso, cuotas y default-off aprobados.
4. Texto exacto: **“Por ahora no se pueden crear espacios nuevos.”**

### R-03 · Identidad, membresía, rol y scope

1. La identidad global representa autenticación; Membership representa pertenencia a una Institution.
2. **CANDIDATE `HD-05`:** una Membership por `(institutionId, globalUserId)` y una o más asignaciones de rol.
3. La selección activa identifica una sola asignación viva, se valida por petición y se audita al cambiar.
4. Una plantilla global nunca se asigna directamente. Se instancia como rol institucional antes de asignarse.
5. Cada rol institucional y scope tiene `institutionId`; las asignaciones usan FK compuestas tenant-aware.
6. El scope se representa con un modelo físico tipado y enforceable, no con un `scopeType/scopeId` polimórfico sin FK.
7. **CANDIDATE `HD-06`:** tipos de scope y roles institution-wide permanecen cerrados hasta aprobación; no hay wildcard.
8. El servidor nunca autoriza con Institution, rol, capabilities o scope tomados solo del JWT.
9. Estado y versión de identidad, membership, asignación, Institution y `sessionVersion` se releen por petición.
10. La base impide asignar un rol o scope de otra Institution y prueba INSERT/UPDATE negativos.

### R-04 · Contexto único y atomicidad de mutación

1. `getRequestContext()` es la única fuente memoizada por petición para host, Institution, identidad, membership,
   asignación activa, capabilities, scopes, módulos, plan, estado, suplantación y correlation ID.
2. Ningún campo ausente se completa con datos del cliente. La caché nunca cruza requests, hosts, roles o Institutions.
3. Un job construye contexto explícito de servicio con Institution y operación registrada; no simula petición humana.
4. Toda escritura sensible revalida **dentro de la misma transacción** identidad y `sessionVersion`, versión/estado de
   Membership, asignación/rol/scope, relación, estado del recurso, módulos, plan e Institution.
5. La implementación aprobada debe usar lock de filas, aislamiento serializable u optimistic concurrency con predicados de
   versión. Un cambio concurrente causa cero filas mutadas, cero efectos externos y resultado tipado `CONFLICT`/denegado.
6. La mutación y su evento de auditoría se confirman atómicamente; los efectos externos usan outbox idempotente después
   del commit. No se envía correo, archivo, notificación o job si la autorización transaccional falla.

### R-05 · Autorización central y orden vinculante

1. Los prerrequisitos de autenticación se evalúan primero: autoridad de host, identidad viva y Membership viva.
2. `can()` sigue exactamente: **Institution activa → módulo/plan disponible → capability → scope → relación → estado del
   recurso → política de operación**.
3. Cada página, acción, API, job, función DAL y destino de navegación declara esas dimensiones; cualquier superficie o
   dimensión ausente deniega.
4. Una URL/ID ajeno devuelve 404 sin revelar existencia. UI oculta no sustituye la decisión del servidor.
5. `FINANCE` no lee académico; `TEACHER` y `ACADEMIC_LEAD` no leen finanzas por rutas indirectas.
6. `GUARDIAN` sin vínculo activo puede leer solo su propio perfil y avisos generales autorizados. Todo dato de un hijo
   exige vínculo activo, permiso por área y misma Institution.
7. `STUDENT` no recibe pares salvo la excepción aprobada `privacy.classmatesVisible`, que solo permite nombre.
8. Nadie cambia su propio rol ni sus propias notas; siempre existe al menos un OWNER activo.
9. Las notas de orientación solo son visibles a `COUNSELOR`. OWNER, ADMIN, soporte, export e impersonación ordinaria no
   pueden leerlas. Acceso de emergencia exige capability separada, motivo, TTL, doble aprobación definida y auditoría.
10. Una Institution suspendida bloquea toda escritura. Lecturas y export dependen de `HD-25`; mientras siga abierta, el
    comportamiento cerrado es negar acceso de estudiante/guardian y permitir únicamente metadatos de plataforma y export
    del OWNER con `tenant.data.export` mediante operación separada y auditada.

### R-06 · Navegación y no divulgación

1. Menús, pestañas, breadcrumbs, acciones contextuales, enlaces, resultados de búsqueda y prefetch pertenecen al mismo
   registro declarativo que sus rutas.
2. Un destino no autorizado no se renderiza, no se prefetch, no consulta datos ni revela conteos, etiquetas privadas o
   existencia del recurso.
3. La decisión usa el mismo contexto vivo y orden de R-05. Cambiar Institution, rol, permiso o relación limpia datos y
   lleva al primer destino autorizado estable, o al selector/login si no existe.
4. La navegación principal móvil muestra como máximo cinco destinos por rol; lo secundario se agrupa por tarea.
5. Una pestaña sin permiso no se renderiza ni ejecuta su loader. El acceso directo sigue respondiendo 404.

### R-07 · DAL, autenticación global y Storage privado

1. Solo módulos aprobados en `src/server/data/**` pueden usar el cliente tenant. Plataforma, autenticación, migración y
   Storage tienen límites separados; páginas, componentes, actions, APIs y jobs no importan Prisma directamente.
2. Cada función DAL recibe contexto, inyecta `institutionId`, resuelve IDs con claves compuestas y devuelve un view model
   mínimo. Lista y detalle aplican la misma política.
3. El rol DAL tenant no tiene SELECT sobre tablas globales de identidad/Auth.js ni sobre `passwordHash`.
4. Un repositorio de autenticación con grants/proyecciones mínimos expone solo búsqueda canónica, hash para verificación en
   proceso de login y datos de sesión necesarios. Nunca serializa/loguea hashes ni permite enumeración a tenant, soporte o
   reporting. Las columnas sensibles permanecen sin grants directos.
5. `withPlatformData()` exige principal/capability de plataforma y proyección registrada; no es un escape booleano.
6. Storage usa un broker server-only exclusivo. El service-role key nunca llega a bundle, cliente, logs ni artefactos.
7. El broker deriva bucket/path desde metadata confiable, no desde path del cliente; confirma tenant, owner, rol,
   relación, estado, MIME, tamaño, hash y ownership antes de publicar el upload.
8. Antes de firmar download/upload revalida autorización viva, emite TTL aprobado, `Cache-Control: no-store`, audita la
   emisión y no registra la URL. Se mide la ventana residual tras revocación.
9. Las pruebas cubren path tampering, cross-user/role/tenant, URL vencida, URL residual, metadata/objeto divergente y
   ausencia del service key en bundles y artefactos.

### R-08 · Integridad física e índices

1. Se conserva `Institution`/`institutionId`.
2. Toda tabla de negocio tiene `institutionId NOT NULL`, salvo allowlist global cerrada en `HD-07`.
3. Cada tabla institucional tiene al menos un acceso tenant-first útil y todos los índices de consultas tenant-scoped o
   relaciones institucionales comienzan por `institutionId`.
4. Se permiten, con justificación y plan de consulta, PK global, unicidad global, token hash, resolución pre-tenant y
   operaciones de plataforma que no pueden comenzar por `institutionId`.
5. Cada padre tenant expone `(institutionId,id)` y cada relación institucional usa FK compuesta, salvo excepción de
   `HD-08` con integridad equivalente y prueba negativa.
6. La nulabilidad transitoria solo existe durante expand/backfill y se mide antes de validar.
7. Índices se validan contra planes representativos; cantidad o prefijo por sí solos no prueban utilidad.

### R-09 · Roles PostgreSQL, RLS y bootstrap

1. Runtime tenant usa rol no-owner, `NOBYPASSRLS`; migrator, auth resolver y plataforma son roles/límites separados con
   grants mínimos. No hay herencia implícita hacia owner/BYPASSRLS.
2. Toda tabla tenant tiene RLS habilitado y policy por operación concedida, o denegación explícita.
3. La policy compara `institutionId` con `current_setting('app.institution_id', true)` y deniega contexto faltante,
   vacío, inválido o de otro tenant.
4. El contexto se fija con `set_config(..., true)` dentro de la misma transacción de cada operación DAL. Se prohíbe
   contexto persistente a nivel de conexión y fuga del transaction client.
5. El inventario versionado cubre tabla × SELECT/INSERT/UPDATE/DELETE × grant × policy × excepción.
6. Para cada operación concedida se prueba mismo tenant positivo y otro tenant, contexto ausente, inválido y cambio de
   `institutionId` negativos, siempre como rol app. Owner/migrator se prueba por separado.
7. `HD-09`, `HD-10` y `HD-11` deben cerrar roles reales, pooler y FORCE RLS. Hasta entonces no se activa RLS ni se cambia
   credencial.

### R-10 · Migración aditiva, manifiesto y rollback

1. Secuencia: expandir → backfill → compatibilidad → validar → activar rol/RLS → contraer.
2. Antes de mutar se obtiene inventario read-only autorizado de conteos, nulls, huérfanos, tuplas mixtas, tamaños,
   índices, roles, grants, policies, backups y límites.
3. Cada tabla tiene manifiesto con fuente(s), igualdades requeridas, categoría de anomalía, representación de cuarentena,
   PK/límite de lote, idempotency key, proyección de checksum, checkpoint y reinicio.
4. Checksum candidato: SHA-256 de filas ordenadas por PK sobre JSON canónico UTF-8 con columnas declaradas, null explícito
   y timestamps UTC ISO-8601. El algoritmo final y sus columnas quedan versionados por migración.
5. Quarantine conserva migrationId, table, sourcePk, category, hashes redactados, firstSeenAt, lastSeenAt y resolution;
   nunca PII cruda si no es imprescindible y aprobada.
6. Compatibilidad define por tabla el origen autoritativo antes/durante/después de cutover. Dual-write es atómico; si una
   escritura falla, ambas representaciones y efectos externos hacen rollback.
7. Shadow-read no cambia respuestas; divergencia sobre el umbral aprobado detiene rollout. El evento exacto de cutover
   termina rollback de aplicación y activa forward-fix.
8. Rollback de RLS usa solo un rol preprovisionado, probado, no-owner y `NOBYPASSRLS` con versión compatible de policies.
   Se prohíbe volver a owner, BYPASSRLS o credencial desconocida.
9. Si no existe rollback que preserve aislamiento después de activar RLS, la fase se declara forward-fix-only y exige
   go/no-go humano antes de activarla.
10. Upgrade y rollback se prueban desde cada predecesor poblado aprobado con conteos, checksums, interrupción, reentrada y
    prueba post-rollback de lectura/escritura.

### R-11 · Sesión, proxy, cookies y ticket de transición

1. `/api/auth/session`, páginas, actions y APIs usan la misma revalidación viva y plazo de `HD-04`.
2. Un token válido no concede acceso si cambió estado/versión de identidad, Membership, asignación o Institution.
3. El adaptador de autoridad recibe una sola fuente efectiva definida por `HD-26`. Si `Host`, `Forwarded` y
   `X-Forwarded-Host` contradicen la topología o el hop count, responde `UNKNOWN`; no aplica precedencia oportunista.
4. Cookies de sesión tenant usan prefijo `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` y no incluyen
   `Domain`. Cualquier excepción exige decisión y threat model específico.
5. La transición plataforma→tenant valida Origin/CSRF y un return target relativo o host exacto allowlisted; evita login
   CSRF, open redirect y session fixation.
6. El ticket se almacena solo como hash, se consume atómicamente una vez y se liga a sesión emisora, GlobalUser,
   Membership destino, host destino, nonce, issuedAt y expiresAt ≤ 60 s. Canjearlo rota el identificador de sesión.
7. Se prueban replay, robo por otro usuario/host, redención concurrente, expiración, header contradictorio y redirect
   externo.

### R-12 · Auditoría, privacidad y confidencialidad

1. Auditoría separa destino/partición de actor: `targetInstitutionId`, principal real, Membership efectiva,
   impersonationSession, service actor y event class son campos independientes.
2. Una acción de plataforma sobre una Institution conserva tanto principal real como Institution destino; no usa XOR.
3. Eventos son append-only para runtime. `before/after` usa allowlist y redacción por campo; no incluye secretos,
   password hashes, tokens, cookies, PII innecesaria ni URLs firmadas.
4. Se auditan autenticación sensible, cambios de autorización, dominios, tickets, URLs firmadas, exports, acceso de
   emergencia, service-role operations, reparaciones e impersonación.
5. Mutación y evento local son atómicos. Efectos externos usan outbox y registran resultado sin falsificar atomicidad.
6. Un actor no puede UPDATE/DELETE sus eventos. Retención/purge/legal hold dependen de `HD-16`.
7. Counseling usa DAL/policy/proyección separada. Export general, soporte e impersonación ordinaria excluyen estas notas.

### R-13 · Estados de UI, recorridos y accesibilidad

1. Los estados tipados mínimos son: `LOADING`, `EMPTY`, `READY`, `SUCCESS`, `CONFLICT`, `ARCHIVED_READ_ONLY`,
   `OFFLINE`, `REVOKED`, `SUSPENDED_INSTITUTION`, `CANCELLED_INSTITUTION`, `MODULE_OR_PLAN_DENIED`, `NOT_FOUND` y
   `RETRYABLE_ERROR`.
2. Un cambio de Institution/rol descarta datos previos. OFFLINE no muestra éxito ni encola mutaciones sensibles; conserva
   input local seguro cuando no contiene datos de otra Institution y ofrece reintento.
3. CONFLICT conserva input permitido, no sobrescribe, explica el cambio y exige recargar/revisar. No hay auto-merge sin
   contrato específico posterior.
4. SUCCESS solo aparece tras confirmación del servidor y debe persistir tras reload o sesión fresca.
5. ARCHIVED_READ_ONLY se distingue de suspensión/cancelación y no muestra mutaciones.
6. Cada recorrido de §8 prueba navegación, URL directa, loading, empty, error, denial, conflict, archive, success,
   reload, revocation y cross-user/role/tenant sin rediseñar el dominio.
7. WCAG 2.2 AA es normativo para esta frontera. Se prueban landmarks/headings, nombres/descripciones, asociación de error,
   orden/restauración de foco, selectores/dialogs, live regions, contraste, no depender del color, text spacing y reflow a
   320 CSS px, además de 360 px, 200 % y objetivos de 44 px.
8. `HD-23` elige combinaciones browser/OS/AT; automatización no sustituye revisión humana.

### R-14 · Evidencia, SLO, restore y gate de release

1. Una matriz de trazabilidad mapea requisito/policy a unit, integración HTTP, policy DB y E2E exact-SHA.
2. Unit prueba funciones puras sin DB; integración HTTP usa PostgreSQL real y no mockea authz/DAL; policy DB corre como
   rol app; E2E usa despliegue aislado autorizado. Cada capa declara comando, versiones, artefacto y dueño.
3. Fixtures machine-readable fijan IDs, timestamps, locale, timezone, seed, bytes/hashes de archivos, roles, scopes,
   relaciones, filas/anomalías/checksums esperados, estado migratorio y teardown con cero residuo.
4. Cada caso negativo declara status HTTP, schema/action result, redirect/cookie, concealment, audit requerido/prohibido y
   cero side effects de DB, Storage, email, notificación y job.
5. SLI define evento, numerador, denominador, ventana, percentil, exclusiones, dimensiones y fórmula de error budget.
   `HD-20` fija umbrales. Alert tests inyectan señal y miden detección/notificación y correlación app/DB/job con redacción.
6. Restore drill no destructivo registra backup IDs/timestamps, fingerprints origen/destino, aislamiento destino, conteos,
   hashes de DB/Storage, smoke auth/authz, RPO/RTO logrados, inicio/fin, prueba de no mutación de origen y limpieza.
   `HD-21` fija umbrales y autoridad.
7. Un release-evidence manifest versionado fija comandos, tool/runner/browser versions, checks obligatorios, terminal
   success, cero skips, retry/flaky policy, vulnerabilidad máxima y excepciones, vínculo deployment→commit, artefactos,
   hashes, provenance, retención y revisores.
8. Ningún Preview, backup, bucket ni credencial se usa sin autorización `HD-22`.

## 7. Matriz mínima de permiso, recurso y estado

`D` = denegar/404; `L` = lectura mínima; `W` = escritura; `RO` = lectura autorizada sin escritura. Cada celda exige
host, sesión, Institution, módulo/plan, capability, scope, relación, estado y RLS válidos.

| Actor/contexto | Propio/asignado activo | Mismo tenant sin relación/scope | Otro usuario | Otra Institution | Archivado | Suspendida (provisional `HD-25`) |
|---|---:|---:|---:|---:|---:|---:|
| OWNER/ADMIN con capability | W | W dentro de capability | D si no lo cubre | D | RO | RO; export solo OWNER/capability |
| ACADEMIC_LEAD | W académico en scope | D | D | D | RO | D hasta `HD-25` |
| REGISTRAR | W personas/matrícula | D | D | D | RO | D hasta `HD-25` |
| FINANCE | W solo finanzas | D académico | D | D | RO financiero | D hasta `HD-25` |
| TEACHER | W en asignación | D | D | D | RO | D hasta `HD-25` |
| ASSISTANT | W sin publicar/cerrar/borrar | D | D | D | RO | D hasta `HD-25` |
| COUNSELOR | W/L solo counseling asignado | D | D | D | RO según retención | D hasta `HD-25` |
| STUDENT | W solo propio activo | D | D | D | RO publicado | D hasta `HD-25` |
| GUARDIAN sin vínculo | Perfil propio + avisos generales | D datos de hijo | D | D | D | D |
| GUARDIAN con vínculo/área | L del hijo autorizado | D | D | D | L histórica aprobada | D hasta `HD-25` |
| Plataforma sin impersonación | Metadatos mínimos | D datos tenant | D | D | D | Metadatos mínimos |
| Plataforma con impersonación | Solo rol objetivo; counseling excluido | D | D | D | Según rol | Banner + policy |
| Job tenant | Solo operación registrada | D | D | D | Según contrato | D salvo excepción |
| Contexto ausente/desconocido | D | D | D | D | D | D |

## 8. Recorridos esenciales acotados

| Actor | Recorrido con rutas/semántica existente | Éxito verificable | Negativas mínimas |
|---|---|---|---|
| ADMIN | Entra a su Institution, abre `/dashboard/gestion/accesos` o `/dashboard/configuracion/roles` y gestiona una Membership ajena sin elevarse a sí mismo. | Cambio confirmado y auditado persiste tras sesión fresca. | Rol propio, último OWNER, cross-tenant, conflicto concurrente y suspensión. |
| TEACHER | Abre `/dashboard/aula/[courseId]` de un Course asignado y ejecuta una acción ya permitida del dominio. | Resultado confirmado persiste al recargar. | Course no asignado, rol cambiado, cerrado/archivado y otro tenant. |
| STUDENT | Abre `/dashboard/aula/[courseId]` estando matriculado y ejecuta una acción sobre recurso propio ya existente. | Estado servidor persiste tras sesión fresca. | Otro estudiante, sin matrícula, cerrado, offline y otro tenant. |
| GUARDIAN | Abre `/dashboard/hijos`, elige `/dashboard/hijos/[studentId]` vinculado y lee un área permitida. | Solo proyección autorizada; el selector conserva accesibilidad. | Sin vínculo conserva perfil/avisos, vínculo revocado, área no autorizada, otro hijo/tenant. |

## 9. Estados y texto exacto

| Estado | Texto y acción | Foco/anuncio y restricciones |
|---|---|---|
| LOADING | “Estamos preparando tu acceso…” | `role=status`; no reutiliza datos previos. |
| EMPTY memberships | “No tienes una institución activa todavía.” | Acción autorizada: “Volver a iniciar sesión”. |
| EMPTY roles | “No tienes un rol activo en esta institución.” | Acción: “Elegir otra institución”, si existe. |
| EMPTY classes teacher | “Todavía no tienes clases asignadas.” | Sin crear si carece capability. |
| EMPTY enrollments student | “Todavía no tienes cursos activos.” | Acción autorizada según producto, nunca implícita. |
| EMPTY children guardian | “Todavía no tienes estudiantes vinculados.” | “Ver avisos generales”; conserva “Mi perfil”. |
| RETRYABLE_ERROR | “No pudimos cargar tu acceso. Intenta de nuevo.” / “Reintentar” / “Código de referencia: {correlationId}” | Foco al título; código seleccionable y copiables con nombre accesible “Copiar código de referencia”. |
| NOT_FOUND | “Página no encontrada.” | Sin datos parciales, redirect ni pista de existencia. |
| READ_ONLY | “Puedes consultar esta información, pero no hacer cambios: {motivo}.” | Foco al banner al cambiar modo. |
| ARCHIVED_READ_ONLY | “Este contenido está archivado y solo puede consultarse.” | Sin mutaciones ni auto-save. |
| CONFLICT | “Esta información cambió mientras trabajabas. Revisa la versión actual antes de guardar.” / “Revisar cambios” | Conserva input seguro; no sobrescribe. |
| OFFLINE | “No hay conexión. Tus cambios no se enviaron.” / “Reintentar” | No cola mutación sensible ni muestra éxito. |
| SUCCESS | “Cambios guardados.” | `role=status`; solo tras commit, persiste tras reload. |
| REVOKED | “Tu acceso cambió o venció. Vuelve a iniciar sesión.” / “Ir a iniciar sesión” | Limpia estado sensible y mueve foco. |
| SUSPENDED_INSTITUTION | “Esta institución está suspendida. No puedes hacer cambios.” | Acciones según `HD-25`; no promete lectura general. |
| CANCELLED_INSTITUTION | “Esta institución ya no está activa.” | Export/retención solo según `HD-16/HD-25`. |
| MODULE_OR_PLAN_DENIED | “Esta función no está disponible para tu institución.” / “Volver al inicio” | Alternativa concreta autorizada; no expone módulo/plan interno. |
| UNKNOWN host | “Página no encontrada.” | Ocurre antes de marca, login y sesión. |
| Signup unavailable | “Por ahora no se pueden crear espacios nuevos.” | Sin formulario ni request de creación. |

## 10. Matriz de pruebas y oráculos

Las pruebas de autorización y RLS usan PostgreSQL real con dos Institutions. El fixture manifest define el número finito de
identidades, roles, scopes, relaciones y estados; “representativo” sin manifiesto no satisface este gate.

1. Host PLATFORM/TENANT/custom/UNKNOWN/invalid/revoked y headers contradictorios.
2. Resolver bootstrap: salida mínima, duplicado cerrado, rol sin SELECT general y revocación/caché.
3. URL declarada/no declarada y navegación/prefetch sin disclosure.
4. Server Action, API y job falsificados, con oráculo por superficie y cero side effects.
5. Otro usuario, relación/scope ausente, cross-tenant y tupla mixta en INSERT/UPDATE.
6. Revocación, `sessionVersion`, cambio concurrente de rol y TOCTOU durante una mutación.
7. Roles custom/templates y scopes: FK cross-tenant de rol/target falla en INSERT/UPDATE.
8. RLS generado por manifest para cada tabla/operación concedida, como rol app.
9. Rol app versus owner/migrator y ausencia de rollback a privilegio inseguro.
10. Auth repository: tenant/support/reporting no enumeran identidad ni leen `passwordHash`.
11. Counseling: solo COUNSELOR; OWNER/ADMIN/support/export/impersonación ordinaria deniegan; break-glass auditado.
12. Storage: path, metadata, owner/relación, MIME/size/hash, URL residual y bundle de credencial.
13. Guardian sin vínculo, revocado, uno/múltiples hijos, área no autorizada y cross-tenant.
14. Estados conflict/archive/offline/success, reload y sesión fresca en los cuatro recorridos.
15. Upgrade por predecesor, quarantine, cancelación/reentrada, checksum, dual-write, rollback y forward-fix.
16. Restore drill DB+Storage sin mutar origen.
17. WCAG 2.2 AA: 320/360 CSS px, 200 %, teclado, foco, semántica, contraste, text spacing y AT de `HD-23`.
18. Controles positivos de sesión, guardian portal y submission files.
19. Si PR #129 entra al SHA futuro, exclusión de adjunto seguida de edición inmediata contra backend real.

Para cada negativa, el manifest declara como mínimo:

| Superficie | Oracle requerido |
|---|---|
| Página/Route Handler | status, body/schema seguro, redirect/cookie, concealment y cache headers. |
| Server Action | resultado discriminado, cero mutaciones/outbox/Storage y audit permitido o prohibido. |
| Job | estado terminal/retry/dead-letter, actor de servicio, idempotency key y cero trabajo cross-tenant. |
| DAL/RLS | row count, SQLSTATE aprobado, cero filas modificadas y contexto transaction-local. |
| Storage | cero llamadas de firma/objeto en denegación, no-store y audit en emisión autorizada. |

## 11. Criterios medibles de aceptación

El paquete no puede proponerse como READY hasta cerrar G0 y `HD-01..HD-26`, actualizar cláusulas condicionales y obtener
aprobaciones humanas sobre el contrato resultante. Una implementación futura tampoco puede aceptarse hasta que:

1. Un manifest cubra 100 % de páginas, layouts, navegación, actions, APIs, jobs y DAL con policy ID.
2. Existan cero imports Prisma fuera de allowlists tenant/auth/platform/migration aprobadas.
3. El manifest de tablas muestre 100 % de claves, accesos tenant-first, FK aplicables y policies por operación.
4. Nulls, huérfanos, tuplas mixtas y divergencias no explicadas sean cero; ninguna fila se descarte sin ledger.
5. Unit, integración HTTP, DB-policy y E2E pasen con comandos/versiones/artefactos declarados y cero skips no aprobados.
6. Cada predecesor aprobado migre y haga rollback dual con conteos/checksums exactos e interrupción reproducible.
7. Locks, timeouts, lotes, write pause y divergencia estén dentro de presupuestos aprobados.
8. Revocación cumpla `HD-04` en página, action, API y `/api/auth/session` con petición/sesión fresca.
9. El SHA exacto pase el release manifest; todo check requerido termina SUCCESS y deployment identity coincide con commit.
10. Artefactos tienen hash/provenance, redacción verificada y retención aprobada no menor de 14 días.
11. Los cuatro recorridos de §8 pasan en entorno aislado `HD-22`, incluida persistencia, Storage y cross-tenant.
12. SLI/alertas producen evidencia conforme a semántica de R-14 y umbrales `HD-20`.
13. Restore drill de DB+Storage mide RPO/RTO `HD-21`, conserva origen y limpia destino.
14. WCAG 2.2 AA y combinaciones `HD-23` tienen evidencia automática y humana.
15. Arquitectura, seguridad, migración/datos, producto y UX aprueban independientemente, con identidad y fecha.
16. La autoridad `HD-24` autoriza por separado READY, implementación, merge, migración, deploy y release.
