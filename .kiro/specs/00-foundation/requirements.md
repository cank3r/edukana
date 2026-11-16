# 00 · Límite institucional confiable y autorización de petición — Requisitos

**Estado:** DRAFT-CANDIDATE
**Base autoritativa auditada:** `origin/todo/tanda-4` en `d16502906aaba04f7fdad2323a1152f3efeb1794`
**Baseline documental pre-Phase B:** PR #130 en `bdb1a9d8844af7bc2e2817903d9dd37492a79523`
**Candidato actual:** bytes de la rama de PR #130; cada revisión reusable debe registrar el SHA exacto observado en GitHub.
**Fecha de evidencia:** 2026-11-16
**Claim:** `SPEC00-TRUSTED-BOUNDARY-20261115`
**Autoridad:** propuesta documental; no autoriza implementación, migración, merge ni despliegue.

## 1. Precedencia, coordinación y puerta de aprobación

1. El código y las migraciones de la base indicada describen lo construido. Las decisiones aprobadas de
   `.kiro/steering/current-state.md` prevalecen sobre steering o specs DRAFT incompatibles.
2. `.kiro/steering/spec-governance.md`, `tech.md`, `roles-permissions.md`, `simplicity.md` y este paquete deben
   reconciliarse antes de una transición de estado.
3. El claim de este trabajo existe en la rama de propuesta y no es ancestro de `origin/todo/tanda-4`. El propietario
   del workspace autorizó **“Autoriza excepción G0 y dependencias”** el 2026-11-16; la cuenta GitHub que publica dejó la
   evidencia durable en [PR #130, comentario 6927885328](https://github.com/cank3r/edukana/pull/130#issuecomment-6927885328).
   La excepción satisface G0 únicamente para continuar el paquete documental de la fila existente
   `SPEC00-TRUSTED-BOUNDARY-20261115` y realizar su handoff limitado `S0-GOV`; no publica el claim en la rama base ni
   concede autoridad sobre otro alcance.
4. La excepción G0 no autoriza READY, implementación, harness, merge, deploy, Preview, producción, Supabase, Storage,
   migraciones, protección de ramas, reducción de auditoría ni cambios en el checkout principal. Tampoco cierra por sí
   misma dependencias técnicas, decisiones pendientes o revisiones.
5. Las únicas actividades permitidas antes de READY son: edición/revisión de estos tres documentos, actualización de
   la fila propia de coordinación, inspección de repositorio y PR, y recolección **read-only** expresamente autorizada de
   roles, pooler, conteos, anomalías, tamaños, backups y límites operativos. Ninguna actividad pre-READY puede escribir
   código, schema, migraciones, datos, Storage, configuración o infraestructura.
6. El paquete permanece **DRAFT-CANDIDATE** mientras exista una decisión fundacional `HD-01..HD-26` abierta, falte
   evidencia fundacional o falte una aprobación humana independiente sobre arquitectura, seguridad, migraciones/datos,
   producto/UX y testabilidad de esta frontera. `HD-27..HD-41` son gates de specs productoras, recorridos y reportería:
   permanecen abiertos en sus handoffs y bloquean esos nodos y producción, pero no crean una dependencia circular para
   la transición READY de la fundación. Las decisiones humanas registradas en §5.1 fijan valores de producto y operación,
   pero no sustituyen ningún cierre técnico.
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
- implementar reportes, agregados, exportaciones, vistas guardadas o programaciones; esta spec solo fija su frontera
  de seguridad, exactitud, auditoría y handoff bloqueante hacia la spec 14 dedicada;
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
| Hecho verificado | La cadena contiene 16 migraciones inmutables. En PostgreSQL 16.16 local desechable, una base limpia aplica las 16; un predecesor alpha poblado con `Attendance` falla en `20261001193000_real_edukana_mvp` porque agrega claves obligatorias sin backfill. | `HD-13` debe incluir o excluir ese predecesor y definir reconciliación sin reescribir historia. |
| Hecho verificado | El seed actual deja tres `User` sin `Identity`; `Enrollment`, `Assignment`, `Submission` y `ExamQuestion` conservan claves tenant nulas. | Backfill, normal writes y compatibilidad N/N-1 deben alcanzar cero anomalías antes de `NOT NULL` o RLS. |
| Hecho verificado | El catálogo local tiene 54 tablas con `institutionId`, cero FK tenant compuestas y cero padres `UNIQUE(institutionId,id)`; probes locales aceptaron cuatro grafos mixtos. | El manifest de relaciones debe ser generado y completo; una lista manual parcial no cierra `HD-07/HD-08`. |
| Hecho verificado | `Course` todavía concentra contenido reusable, ejecución, matrícula, staff, horario, evaluación, notas y asistencia; no existen `Offering`, `MeetingPattern` ni `ClassSession`. | Aula debe avanzar por el DAG de R-16 y no puede migrar productores mientras su ownership siga ambiguo. |
| Hecho verificado | Reportería actual es síncrona, usa permisos legacy, carece de registry/job/artifact/snapshot/lineage y puede sumar monedas distintas. | R-15 y R-16 mantienen reportería como gate bloqueante de preproducción. |
| Desconocido | Roles, grants, ownership, BYPASSRLS, pooler y políticas fuera del repositorio. | Exigen inventario read-only autorizado; no se asumen. |

Los ensayos de migración anteriores fueron locales y desechables. No prueban tamaños, datos, pooler, roles, backups,
Storage ni capacidad de ningún entorno remoto.

## 5. Reconciliación de contratos DRAFT vecinos

Estos documentos tienen menor autoridad que steering y continúan DRAFT. El paquete no puede pasar a READY mientras una
cláusula incompatible pueda dirigir una implementación distinta.

| Documento y cláusula observada | Autoridad actual | Reemplazo candidato en spec 00 | Reconciliación posterior requerida |
|---|---|---|---|
| `01-platform-tenancy/design.md`, “Resolución de tenant” y rename a `Tenant/tenantId`. | DRAFT; contradice `current-state.md`. | Conservar `Institution/institutionId`; resolver host triestado y bootstrap mínimo. | Spec 01 debe eliminar rename, caché ambigua e inyección de `x-tenant-id` como autoridad. |
| `02-identity-auth/requirements.md`, Requisito 5 permite hasta cinco minutos al suspender cuenta. | DRAFT; contradice la revalidación viva aprobada, pero la compatibilidad física sigue abierta. | Primera petición nueva falla cerrada en página, action, API, job por usuario y `/api/auth/session`; `HD-04` permanece abierto hasta cerrar el adaptador N/N-1 con `HD-05/HD-15`. | Spec 02 debe adoptar la decisión de revalidación y, después, el cierre compatible de `HD-04`. |
| `03-roles-settings/design.md`, unión de roles y `tenantId`, scope en Membership. | DRAFT; modelo físico no aprobado. | Selección explícita de una asignación activa; roles tenant y scope con FK enforceable. | Spec 03 debe adoptar `HD-05/HD-06` y `Institution`. |
| `15-ops-privacy-quality/requirements.md`, WCAG 2.1 AA. | DRAFT; steering `tech.md` exige WCAG 2.2 AA. | WCAG 2.2 AA es el objetivo normativo de esta frontera. | Spec 15 debe elevar su cláusula y conservar evidencia humana. |

### 5.1 Decisiones humanas aprobadas; cierre técnico aún pendiente

Las decisiones interactivas del 2026-11-16 quedaron publicadas con identidad, fecha y valores en
[PR #130, comentario 6928063312](https://github.com/cank3r/edukana/pull/130#issuecomment-6928063312). Son entradas vinculantes
para el diseño posterior, pero no prueban viabilidad, no cierran por sí solas un `HD-*` y no cambian el estado
**DRAFT-CANDIDATE**:

| ID | Área | Valor humano aprobado | Gate relacionado y evidencia pendiente |
|---|---|---|---|
| AHD-01 | Recovery | RPO 1 h; RTO 4 h. | Restore drill DB+Storage, autoridad, medición y evidencia exact-SHA (`HD-21`, T02/T11). |
| AHD-02 | Retención | Artefactos de exportación: 30 días. Datos operacionales: 90 días y luego purge. | Matriz por clase, legal hold, cancelación, cascadas y prueba de purge (`HD-16/HD-25`, T02/T10/T13). |
| AHD-03 | Impersonación | Duración máxima 30 minutos. | Roles/capabilities, motivo, allowlist, revocación, banner y auditoría (`HD-17`, T02/T05/T06). |
| AHD-04 | Aprobación | Revisor independiente más owner por transición. | Identidades, cinco responsabilidades de revisión y mecanismo enforceable (`HD-19/HD-24`, T03). |
| AHD-05 | Preproducción | Staging dedicado de pago, región US East. | Proyecto, tenant, bucket, operadores, controles y aislamiento (`HD-22`, T01/T11). |
| AHD-06 | Dominio y consola | `edukana.com`; consola `app.edukana.com`; selector sin datos tenant. | DNS, host/proxy, cookies/ticket y proyección control-plane (`HD-01/HD-26`, T02/T05). |
| AHD-07 | Registro y marketplace | Registro institucional solo por invitación; marketplace público. | Flujos de cuenta/checkout, antiabuso, cuotas, privacidad y autoridad (`HD-03`, T02/T05). |
| AHD-08 | Matriz cliente | Web responsive y PWA con matriz móvil completa. | Browsers, OS, dispositivos, AT, versiones y evidencia humana (`HD-23`, T02/T11). |
| AHD-09 | Disponibilidad | 99,9 % mensual. | SLI, exclusiones, error budget, fuentes, alertas y retención (`HD-20`, T02/T11). |
| AHD-10 | Autenticación | Contraseña, Google y Microsoft. | Normalización/linking/colisiones (`HD-12`), revocación (`HD-04`), recovery y configuración segura; T02/T05A/T11. |

## 6. Requisitos normativos

Las opciones fundacionales `HD-01..HD-26` aún sujetas a decisión humana se marcan **CANDIDATE** y bloquean G-READY
hasta registrar opción, autoridad y fecha en `design.md` y regenerar requisitos, diseño, tareas y oráculos coherentes. Las
opciones downstream `HD-27..HD-41` se mantienen CANDIDATE como handoffs acotados; bloquean su spec dueña, sus nodos y
producción, no la promoción de la fundación.

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
7. **CANDIDATE `HD-11/HD-25`:** `InstitutionDomain` mantiene una proyección mínima `institutionRoutingStatus`, separada
   de los demás datos de Institution. Toda transición de lifecycle actualiza esa proyección y su versión en la misma
   transacción que el estado fuente y el AuditEvent/outbox. El owner-definer posee únicamente la tabla de mapeo y la
   función, y ningún otro dato tenant.
8. La función devuelve un único DTO interno `ResolvedInstitutionRoute` con `institutionId`, `canonicalHost`,
   `domainStatus`, `institutionRoutingStatus` y `routingVersion`. La autoridad pública `TENANT` se deriva de ese DTO y
   omite `domainStatus`, `institutionRoutingStatus` y `routingVersion`; no expone marca, identidad, membership, plan,
   correo ni datos académicos. Cero o más de una coincidencia, estado no enrutable o versión ausente/contradictoria
   producen resultado cerrado.
9. El caller resolver es no-owner y `NOBYPASSRLS`; solo puede ejecutar la función. La función no expone un cliente general
   de plataforma y registra métricas agregadas sin PII; cambios de dominio o lifecycle sí generan auditoría.
10. Mientras `HD-11/HD-26` no aprueben un mecanismo distribuido de consistencia, autoridad de host no usa cache positiva
    ni negativa: cada petición consulta la proyección transaccional. Cualquier cache futura es solo una optimización,
    versiona la clave canónica y debe demostrar invalidación/ack de todas las réplicas antes de confirmar revocación o
    lifecycle change; una versión stale niega. Las pruebas intercalan resolución con suspensión, cancelación, reactivación
    y revocación y demuestran que ningún request posterior al commit obtiene autoridad obsoleta.
11. La topología de proxy, header aceptado y hop count se cierra en `HD-26`. Hasta entonces, headers forwarded
    contradictorios o no verificables se tratan como `UNKNOWN`.

### R-02 · Alta anónima cerrada

1. El alta de docente independiente queda deshabilitada si falta configuración o contiene un valor desconocido.
2. Mientras `HD-03` siga abierto, ninguna ruta anónima crea Institution, suscripción, membership, período ni auditoría.
3. Una habilitación futura exige feature/plan, verificación, rate limit, antiabuso, cuotas y default-off aprobados.
4. Texto exacto: **“Por ahora no se pueden crear espacios nuevos.”**

### R-03 · Identidad, membresía, rol y scope

1. `User` es la única raíz de identidad global y evoluciona aditivamente desde la tabla existente; Membership representa
   pertenencia a una Institution. No se crea una segunda tabla raíz de usuario.
2. **CANDIDATE `HD-05`:** una Membership por `(institutionId, userId)` y una o más asignaciones de rol.
3. La selección activa identifica una sola asignación viva, se valida por petición y se audita al cambiar.
4. Una plantilla global nunca se asigna directamente. Se instancia como rol institucional antes de asignarse.
5. Cada rol institucional y scope tiene `institutionId`; las asignaciones usan FK compuestas tenant-aware.
6. El scope se representa con un modelo físico tipado y enforceable, no con un `scopeType/scopeId` polimórfico sin FK.
7. **CANDIDATE `HD-06`:** tipos de scope y roles institution-wide permanecen cerrados hasta aprobación; no hay wildcard.
8. El servidor nunca autoriza con Institution, rol, capabilities o scope tomados solo del JWT.
9. Estado y versión de identidad, membership, asignación, Institution y `sessionVersion` se releen por petición.
10. La base impide asignar un rol o scope de otra Institution y prueba INSERT/UPDATE negativos.

#### R-03.11–R-03.16 · Password, Google y Microsoft sin linking implícito

11. **CANDIDATE `HD-12`:** `ProviderAccount` pertenece a `User`, nunca a una Membership, y es globalmente único por
   `(provider, providerAccountId)`. La tabla `User` existente es el único destino físico y se expande en el lugar hasta
   ser global; no se crea otra raíz. Cuando varias filas legacy representan la misma identidad, una regla versionada elige
   exactamente un `User.id` fuente como ID canónico y registra cada otro ID en un ledger append-only
   `UserIdentityRemap(legacyUserId,canonicalUserId,sourceInstitutionId,migrationVersion)`. Ningún ID fuente desaparece sin
   remap verificable. `Membership(institutionId,userId,...)` se backfillea por pertenencia legacy hacia el ID canónico;
   `Account`, `Session`, recovery y cada FK existente a `User` se remapean mediante el mismo ledger durante expansión y
   compatibilidad N/N-1. Ningún FK ni campo legacy se retira antes de paridad, cero referencias pendientes y cutover.
12. Google y Microsoft solo pueden autenticar con el conjunto de claims verificados que `HD-12` apruebe por proveedor.
   Un email de proveedor nuevo puede crear identidad únicamente cuando su `emailCanonical` está libre.
13. Si `emailCanonical` ya pertenece a otra identidad, el proveedor nunca se auto-enlaza ni fusiona cuentas. La persona
   autentica primero el método existente y confirma el vínculo con reautenticación reciente y protección CSRF.
14. Un cambio de email en el proveedor no rekeyea, fusiona ni cambia Institution/Membership automáticamente. Las colisiones
   quedan en cuarentena redactada y siguen el recovery aprobado; nunca se elige una identidad por orden de consulta.
15. Unlink exige reautenticación reciente, conserva al menos un método usable, revoca tokens del proveedor, incrementa
   `sessionVersion` global y emite un evento de seguridad global sin tokens. Linking, unlinking y recovery no crean ni
   seleccionan Membership por sí mismos.
16. Rollback deshabilita Google/Microsoft y linking por flags default-off sin borrar vínculos ni fusionar identidades.
   La matriz N/N-1 define qué versión emite/consume cada referencia y niega formas desconocidas; takeover recovery,
   last-method protection y provider compromise tienen pruebas negativas antes de habilitar cada proveedor.

### R-04 · Contexto único y atomicidad de mutación

1. `getRequestContext()` es la única fuente memoizada por petición para host, Institution, identidad, membership,
   asignación activa, capabilities, scopes, módulos, plan, estado, suplantación y correlation ID.
2. Ningún campo ausente se completa con datos del cliente. La caché nunca cruza requests, hosts, roles o Institutions.
3. Un job construye contexto explícito de servicio con Institution y operación registrada; no simula petición humana.
4. Toda escritura sensible revalida **dentro de la misma transacción** identidad y `sessionVersion`, versión/estado de
   Membership, asignación/rol/scope, relación, estado del recurso, módulos, plan e Institution.
5. La implementación aprobada debe usar lock de filas, aislamiento serializable u optimistic concurrency con predicados de
   versión. Un cambio concurrente causa cero filas mutadas, cero efectos externos y resultado tipado `CONFLICT`/denegado.
6. La mutación, su evento de auditoría y la **fila de outbox** se confirman en la misma transacción. Solo el dispatcher
   procesa efectos externos después del commit; no se envía correo, archivo, notificación o job si la autorización o la
   escritura transaccional falla.
7. Toda mutación de matrícula, materialización de sesión, submission/answer, nota, asistencia, mensaje/notificación y
   metadata de archivo recibe `mutationId` estable, payload canónico versionado y `payloadHash` ligado a Institution,
   actor, operación y recurso. La unicidad aplicable garantiza un solo efecto lógico.
8. Repetir el mismo `mutationId` con el mismo hash devuelve el resultado confirmado original; reutilizarlo con otro
   payload devuelve `CONFLICT` y produce cero cambios, AuditEvent de éxito, outbox, objeto, correo, notificación o job.
9. Si el cliente pierde la respuesta, consulta un status endpoint/policy por `mutationId`; nunca crea una segunda
   mutación para adivinar el resultado. El status reautoriza identidad, Membership, scope, relación y recurso.
10. Retries usan presupuesto y backoff aprobados, estados monotónicos y compare-and-set/lease cuando existe worker. Un
    timeout local no significa fracaso ni éxito y no autoriza side effects adicionales.
11. El oracle por operación declara deltas exactos de filas, revisiones, AuditEvent, outbox, objetos y entregas para
    primer intento, duplicate, payload conflict, response loss, retry concurrente, revocación y otro tenant.
12. Este contrato es transversal a los productores de R-16; cada spec productora fija payload y estado concretos antes
    de READY. No autoriza colas offline para mutaciones sensibles.

### R-05 · Autorización central y orden vinculante

1. Los prerrequisitos de autenticación se evalúan primero: autoridad de host, identidad viva y Membership viva.
2. `can()` aplica después una política de lifecycle por operación: las operaciones de negocio requieren Institution
   `ACTIVE`; `SUSPENDED` y `CANCELLED` niegan por defecto y solo admiten operaciones de recovery incluidas en la allowlist
   mínima de R-13/`HD-25`, cada una con capability, reautorización y auditoría propias. Tras ese gate evalúa exactamente:
   **módulo/plan disponible → capability → scope → relación → estado del recurso → política de operación**.
3. Cada página, acción, API, job, función DAL y destino de navegación declara lifecycle/operación y las demás dimensiones;
   cualquier superficie o dimensión ausente deniega.
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

#### R-05.11–R-05.17 · Impersonación CANDIDATE, no soporte ordinario

11. `HD-17` permanece abierto. Solo un principal de plataforma activo con `platform.support.impersonate` puede solicitar
   una sesión con Institution, Membership/asignación objetivo, motivo de 20–500 caracteres, ticket, duración y modo de
   autoridad. `OWNER_CONSENT` exige una aprobación append-only vigente del OWNER; `BREAK_GLASS` exige dos aprobaciones
   append-only de plataforma independientes y nunca concede counseling. Cada aprobación liga approver, sesión, mode,
   scope hash, decisión, creación, expiración y correlation ID mediante FK. Una revocación posterior se representa con
   una fila append-only separada que referencia la aprobación; nunca muta ni duplica la aprobación original. La policy
   deriva vigencia de aprobación, expiración y ausencia de revocación en cada request.
12. `expiresAt = min(createdAt + requestedDuration, createdAt + 1800 s)` se impone con constraint DB. No hay extensión ni
   renovación; una nueva sesión requiere nueva autoridad. Cada operador puede tener como máximo una sesión activa.
13. Permisos efectivos son la intersección del rol/asignación objetivo vigente, estado de Institution y allowlist
   inmutable versionada: `support.dashboard.summary.read`, `support.institution.profile.read`,
   `support.navigation.read`, `support.system.health.read` y `support.audit.metadata.read`.
14. La denylist absoluta cubre toda creación/cambio/borrado/publicación, notas, asistencia, matrícula, roles, identidad,
   pagos, exports, archivos/URLs firmadas, counseling, secretos, jobs/webhooks, legal hold/purge, backups/restore,
   migración, deploy/release y cualquier operación no registrada.
15. Cada request relee operador, autoridad/aprobaciones, asignación objetivo, Institution, allowlist version, expiración,
   estado y revocación. Revoca de inmediato por cambio de cualquiera de ellos, logout o `sessionVersion`.
16. Estados terminales `REVOKED`, `EXPIRED` y `ENDED` no regresan. Se registran `REQUESTED`, `APPROVED`, `STARTED`, `READ`,
   `DENIED`, `REVOKED`, `EXPIRED` y `ENDED` con actor real/efectivo, autoridad, asignación, operación, resultado,
   correlation ID y tiempos, sin valores sensibles ni URLs.
17. Pruebas de reloj, concurrent revoke/read y cada operación permitida/prohibida demuestran la intersección y cero efectos
   DB/Storage/outbox/email/notificación/job al negar. Un banner o cookie nunca crea autoridad.

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
10. Upgrade y rollback se prueban desde cada uno de los 16 estados post-migración y el seed/demo actual. Cada estado
    recibe `SUPPORTED` o `EXCLUDED`, supuestos de población, fixture ID, postflight ID y evidencia. `EXCLUDED` exige
    prueba de que no pudo contener datos o decisión humana explícita de desoporte; no puede desaparecer por selección.
11. Si alpha poblado es `SUPPORTED`, una reconciliación separada e inmutable permite continuar tras el fallo conocido de
    `20261001193000_real_edukana_mvp`; su rehearsal y aprobación no cambian, renombran ni reemplazan esa migración.
12. Mientras N-1 sirve tráfico, legacy sigue autoritativo. N dual-writea atómicamente y shadow-read; un catch-up
    idempotente recurrente absorbe writes N-1. N-1 se drena antes de una ventana estable **CANDIDATE de 24 horas**
    con cero divergencia; `HD-15` debe aprobar o reemplazar duración y criterio. Cutover registra versiones, SHA y
    autoridad; rollback pre-cutover restaura reads N-1 conservando schema aditivo. Después de cutover se usa forward-fix
    salvo rollback compatible aprobado por separado.
13. `AuditLog` legacy forma parte del manifest. Cada fila se clasifica de forma determinista como evento tenant con
    Institution derivable, evento platform/global válido con `targetInstitutionId` nulo, o anomalía huérfana/ambigua en
    cuarentena. Se conservan actor, destino, checksum y retención; nunca se descarta una fila. El oracle exige cero nulls
    inexplicados en claves que el modelo aprobado declare tenant-required, no cero nulls legítimos de eventos globales.
14. Por relación, el rollout crea/verifica primero el índice padre candidato `UNIQUE(institutionId,id)` con el método de
    bajo lock aprobado; luego índice hijo `(institutionId,parentId,...)`; adjunta candidate key; agrega FK compuesta
    inicialmente no validada cuando PostgreSQL lo permita; y valida solo con null/orphan/mixed counts en cero. FKs
    simples y acciones `ON DELETE/ON UPDATE` existentes se preservan durante N/N-1; solo se retiran tras cutover,
    revisión de retención y evidencia `EXPLAIN`.
15. `HD-14` registra por entorno: `lock_timeout` y `statement_timeout` separados para metadata DDL, índices concurrentes y
    validación; lote inicial/mínimo/máximo y objetivo de duración transaccional; SQLSTATE retryables, backoff y máximo de
    intentos; write-pause, ventana de mantenimiento, umbrales de abort y medidas de tamaño/tráfico que justifican cada
    valor. Sin todos esos campos no existe presupuesto aprobado.

### R-11 · Sesión, proxy, cookies y ticket de transición

1. **Decisión de producto aprobada; cierre técnico `HD-04` abierto:** `/api/auth/session`, páginas, actions, APIs y jobs
   que actúan por una persona deben usar la misma revalidación viva. La primera petición nueva después de revocar
   identidad, Membership, asignación o Institution falla cerrada. El JWT objetivo es solo localizador de identidad
   global, Membership, asignación activa y `sessionVersion`; ningún rol, scope, Institution o capability del token es
   autoridad. La implementación y compatibilidad dependen de `HD-05/HD-15`.
2. Un token válido no concede acceso si cambió estado/versión de identidad, Membership, asignación o Institution.
3. El adaptador de autoridad recibe una sola fuente efectiva definida por `HD-26`. Si `Host`, `Forwarded` y
   `X-Forwarded-Host` contradicen la topología o el hop count, responde `UNKNOWN`; no aplica precedencia oportunista.
4. Cookies de sesión tenant usan prefijo `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` y no incluyen
   `Domain`. Cualquier excepción exige decisión y threat model específico.
5. La transición plataforma→tenant valida Origin/CSRF y un return target relativo o host exacto allowlisted; evita login
   CSRF, open redirect y session fixation.
6. El ticket se almacena solo como hash, se consume atómicamente una vez y se liga a sesión emisora, User,
   Membership destino, host destino, nonce, issuedAt y expiresAt ≤ 60 s. Canjearlo rota el identificador de sesión.
7. Se prueban replay, robo por otro usuario/host, redención concurrente, expiración, header contradictorio y redirect
   externo.
8. Compatibilidad N/N-1 permanece **OPEN_BLOCKING**. El token legacy observado usa `sub`, `idn`, `sv`, `role` e
   `institutionId`, y puede carecer de `idn`/`sv`; el objetivo añade localizadores de Membership y asignación aún no
   definidos por `HD-05`. Antes de cerrar `HD-04`, una matriz claim-by-claim debe fijar emisión y consumo por N/N-1,
   lookup determinista hacia identidad/Membership/asignación vivas, rechazo de ausencia o ambigüedad, condiciones de
   version 0, reemisión, incremento de versiones por cada cambio de autoridad, duración, drain, cutover y rollback de
   `HD-15`. Ninguna implementación puede usar `role` o `institutionId` legacy como autoridad de fallback.
9. Ante indisponibilidad del almacén de identidad, la frontera falla cerrada. El rollback no puede restaurar autorización
   stale desde JWT. Hasta cerrar la matriz, todo token sin mapping único se rechaza; después del cutover definido, el
   endpoint se corrige hacia delante y solo un rollback compatible aprobado puede consumir formas anteriores.

### R-12 · Auditoría, privacidad y confidencialidad

1. Auditoría separa destino/partición de actor: `targetInstitutionId`, principal real, Membership efectiva,
   impersonationSession, service actor y event class son campos independientes.
2. Una acción de plataforma sobre una Institution conserva tanto principal real como Institution destino; no usa XOR.
3. Eventos son append-only para runtime. `before/after` usa allowlist y redacción por campo; no incluye secretos,
   password hashes, tokens, cookies, PII innecesaria ni URLs firmadas.
4. Se auditan autenticación sensible, cambios de autorización, dominios, tickets, URLs firmadas, exports, acceso de
   emergencia, service-role operations, reparaciones e impersonación.
5. Mutación, evento local y fila de outbox son atómicos. Solo el dispatcher ejecuta efectos externos después del commit
   y registra resultado sin falsificar atomicidad.
6. Un actor no puede UPDATE/DELETE sus eventos. Retención/purge/legal hold dependen de `HD-16`.
7. Counseling usa DAL/policy/proyección separada. Export general, soporte e impersonación ordinaria excluyen estas notas.

### R-13 · Estados de UI, recorridos y accesibilidad

1. Los estados tipados mínimos son: `LOADING`, `EMPTY`, `READY`, `SUCCESS`, `CONFLICT`, `ARCHIVED_READ_ONLY`,
   `OFFLINE`, `REVOKED`, `SUSPENDED_INSTITUTION`, `CANCELLED_INSTITUTION`, `MODULE_OR_PLAN_DENIED`,
   `PLAN_LIMIT_REACHED`, `NOT_FOUND` y `RETRYABLE_ERROR`.
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
8. `HD-23` mantiene abierta la aprobación de dispositivos, versiones y evidencia humana. La matriz candidata mínima es:

| Plataforma | Browser/AT | Viewports y modos mínimos | Evidencia requerida |
|---|---|---|---|
| Windows 11 soportado | Chrome N/N-1 y Edge N/N-1 con NVDA; Firefox Stable/ESR con NVDA | 320x568, 360x800, 1280x720, 1440x900 cuando aplique; 200 %, teclado, reduced motion, high contrast, online/offline; instalación standalone en Chrome/Edge | Versiones exactas, script manual, transcript, capturas y pass/fail por paso. |
| macOS actual y anterior | Safari soportado con VoiceOver | 1280x800, 1440x900; 200 %, teclado, reduced motion, increased contrast, online y fallback offline | Versiones exactas y revisión manual VoiceOver. |
| iOS/iPadOS actual y anterior | Safari con VoiceOver | 390x844 y 768x1024, portrait/landscape, touch/teclado, reduced motion, cached text lesson, Add to Home Screen y standalone | Dispositivo/OS/browser exactos, instalación, offline y revisión manual. |
| Android actual y anterior | Chrome N/N-1 con TalkBack | 360x800 y 412x915, portrait/landscape, touch/teclado, reduced motion, cached text lesson, install prompt y standalone | Dispositivo/OS/browser exactos, instalación, offline y revisión manual. |
| Automatización | Chromium, Firefox y WebKit fijados por Playwright; árbol accesible y axe | 320x568, 360x800, 390x844, 768x1024 y 1280x720; reflow, 200 %, reduced motion, portrait/landscape | Cero hallazgos serious/critical y artefactos exact-SHA; no sustituye AT manual. |

9. El release manifest congela N contra la fecha candidata y registra versiones completas. PWA exige HTTPS, manifest
   scoped, `start_url`, standalone, colores, iconos 192/512 y maskable, service worker controlador y update determinista.
   Offline solo abre shell y lecciones de texto previamente autorizadas con `lastUpdated` bajo una
   **authorization lease CANDIDATE de `HD-36`** ligada a User, sesión, Institution, recurso+versión y dispositivo.
   La lease tiene `issuedAt` y `expiresAt`; su duración final queda abierta y no se infiere en esta spec. Un reloj local
   atrasado, rollback de reloj o imposibilidad de demostrar tiempo confiable invalida la lease. Login, contenido no
   cacheado, exports, notas, pagos y toda mutación sensible fallan claramente y no se encolan. Logout y cambios de
   sesión/rol/relación/Institution/lifecycle observados localmente purgan o inutilizan criptográficamente el contenido
   protegido antes de volver a mostrarlo. Una revocación ocurrida mientras el dispositivo está desconectado impide renovar
   la lease y se aplica en el próximo check online confiable; el acceso residual offline nunca supera `expiresAt`. Un cambio
   de versión del recurso también invalida en el próximo check y no puede extender una lease existente.
10. **CANDIDATE `HD-25`:** la matriz de Institution siguiente no es autoridad hasta aprobación de producto, privacidad,
    seguridad, billing y retención:

| Operación | SUSPENDED | CANCELLED | ARCHIVED_READ_ONLY |
|---|---|---|---|
| Login/sesión | Niega login y acceso tenant en la primera petición; reactivación invalida sesiones previas y exige login. | Niega login normal incluso OWNER; no restaura una sesión previa. | La sesión puede seguir viva si el recurso y la relación siguen autorizados. |
| Reads/writes | Niega UI ordinaria y toda escritura; solo metadata plataforma y recovery export OWNER separado. | Niega UI y writes; solo metadata lifecycle/billing y operaciones de recovery/hold/purge autorizadas. | Permite solo lectura histórica aprobada; nunca mutación. |
| Jobs/notificaciones/integraciones | No inicia jobs de negocio; jobs en curso releen estado antes de commit y paran sin efectos. Audit/hold/recovery pueden seguir. | Cancela o termina jobs de negocio y delivery; solo audit/hold/export-recovery/retention/purge. | Solo jobs de conservación/reconciliación expresamente registrados. |
| Export/download | OWNER mediante superficie recovery separada, capability y reautorización; expiración normal no cambia. | Recovery verificado hasta `cancelledAt+30d`; artefacto nunca después de `purgeAt`; reautorización por request/download. | Solo si la política del recurso y retención lo permiten. |
| Retención/hold | No inicia el reloj de 90 días; hold solo pausa purge. | `cancelledAt` inicia reloj operacional de 90 días; hold pausa purge, no acceso. | La clase de dato aprobada gobierna retención; archive no equivale a purge. |
| Reactivar/restaurar/purge | Reactivación plataforma con razón/audit; login nuevo obligatorio. | Antes de `purgeAt`, consentimiento OWNER + platform owner + reviewer independiente; después de `PURGED` no restaura. | Desarchivar exige capability, razón e historia; no cambia Institution lifecycle. |
| Auditoría | Transición, cada denial y recovery autorizado. | Cancelación, denial, recovery, hold, retention y purge. | Archive/read/unarchive según policy; nunca se confunde con lifecycle institucional. |

### R-14 · Evidencia, SLO, restore y gate de release

1. Antes de G-READY existe un manifest de trazabilidad con una fila por **cada cláusula** R-01.1..R-16.8. Cada fila
   contiene requirement/policy/test IDs, capa, fixture determinista, oracle positivo/negativo, deltas esperados de DB,
   AuditEvent, outbox, Storage y delivery, owner, comando o `NOT_YET_IMPLEMENTED`, artefacto, estado, dependencia externa
   y stop condition. Una fila ausente o que agrupe obligaciones con oráculos distintos bloquea READY.
2. Unit prueba funciones puras sin DB; integración HTTP usa PostgreSQL real y no mockea authz/DAL; policy DB corre como
   rol app; E2E usa despliegue aislado autorizado. Cada capa declara comando, versiones, artefacto y dueño.
3. Fixtures machine-readable fijan IDs, timestamps, locale, timezone, seed, bytes/hashes de archivos, roles, scopes,
   relaciones, filas/anomalías/checksums esperados, estado migratorio y teardown con cero residuo.
4. Cada caso negativo declara status HTTP, schema/action result, redirect/cookie, concealment, audit requerido/prohibido y
   cero side effects de DB, Storage, email, notificación y job.
5. **CANDIDATE SLI-1 / `HD-20`:** la ventana es mes calendario UTC. El denominador cuenta outcomes del edge confiable
   para rutas registradas de HTML core, auth/session, Server Actions, APIs y assets críticos de tráfico humano. Excluye
   health/operator, probes sintéticos, abuso verificado y conexiones abandonadas antes de headers, siempre con reason code
   retenido. Cero requests elegibles produce `UNKNOWN`, nunca PASS.
6. El numerador cuenta requests elegibles terminados en ≤10 s con success, redirect, validation rejection o policy denial
   normalizados y sin error server. 5xx, edge 502/503/504, timeout, outcome no clasificado y 429 por capacidad para usuario
   legítimo fallan. Deploy, mantenimiento, provider, overload, bugs y error operador no se excluyen. Disponibilidad `N/D`
   debe ser ≥0.999; error observado `(D-N)/D`; consumo `error/0.001`.
7. Probes desde dos operadores/ubicaciones, una US East: cada 60 s login HTML+asset; cada 5 min password auth,
   `/api/auth/session`, dashboard autorizado, read DB tenant y logout; cada 15 min objeto privado sin retener URL.
   Page con ventanas 5m+1h a burn ≥14.4, 30m+6h a ≥6; warning 6h+3d a ≥1; dos fallos consecutivos desde ambas
   ubicaciones page inmediato. Evidencia incluye señal/detección/notificación, route, burn, correlation, redacción,
   destino, ack y resolución. Destino, retención e instrumentación siguen abiertos hasta aprobación.
8. **CANDIDATE REC-1 / `HD-21/HD-22`:** para cutoff declarado `T0`, DB RPO=`T0` menos el commit marker restaurado más
   nuevo ≤`T0`; object RPO=`T0` menos el object-manifest event restaurado más nuevo ≤`T0`; achieved RPO es el peor y
   debe ser ≤3600 s. RTO inicia al declarar drill/incidente y tratar el origen como indisponible.
9. RTO termina solo cuando el destino aislado completa startup, password auth, live-session revocation, denegaciones
   cross-Institution, reads/writes representativos, seguridad de jobs, retrieval privado, replay de hold/purge/artifact
   expiry/revocation y aceptación de release owner; debe ser ≤14400 s. El drill usa restore DB provider-native más restore
   independiente de objetos, staging US East pago y destino separado; el origen permanece read-only.
10. Evidencia REC-1 fija backup/PITR IDs, fingerprints, migration SHA, counts/checksums, object manifest/hashes/missing,
    tiempos, achieved RPO/RTO, auth/authz, source write counters, approvers y cleanup disposition. Requiere owner de
    recovery, reviewer data/security independiente y release authority. Ningún drill real se infiere de este candidato.
11. Un release-evidence manifest versionado fija comandos, tool/runner/browser versions, checks obligatorios, terminal
    success, cero skips, retry/flaky policy, vulnerabilidad máxima y excepciones, vínculo deployment→commit, artefactos,
    hashes, provenance, retención y revisores.
12. Ningún Preview, backup, bucket ni credencial se usa sin autorización `HD-22`.
13. **CANDIDATE REL-1 / `HD-19/HD-24`:** READY, inicio de implementación, merge, migración, deploy, release, restore,
    purge y rollback son aprobaciones distintas sobre el mismo commit/evidence manifest. Una nunca implica otra.
14. Writer/migration author no puede ser independent reviewer; deployment executor no aprueba ese deploy; release owner
    autoriza al final. Merge conserva la autoridad humana designada por repositorio; migración exige data owner,
    migration reviewer, restore probado, ventana compatible y release manager; purge/contracción exige aprobación
    irreversible adicional.
15. Incident Commander solo puede rollbackear aplicación a un last-known-good compatible. Restore DB, policy rollback,
    purge reversal o cualquier rollback que debilite aislamiento exige data+security authority; si no existe rollback
    seguro, solo forward-fix. El ledger machine-readable registra actor, rol, transición, entorno, commit/deployment,
    scope, timestamp, evidence-manifest hash, decisión, expiry y correlation ID. Las identidades y enforcement externos
    permanecen abiertos.

### R-15 · Frontera auditada y bloqueante de reportería

1. La reportería de producción se rige por un registro versionado de reportes. Cada entrada declara `reportId`, versión,
   owner, familia, dominios productores, propósito, audiencia, permisos, parámetros, proyecciones de salida,
   sensibilidad, moneda, timezone, semántica `asOf`, watermark, freshness SLO, linaje, reconciliación, formatos y estados.
   El catálogo mínimo no puede cerrarse omitiendo: académico, asistencia, evaluación, progreso/finalización, carga docente,
   admisiones, finanzas **por moneda**, uso/límites y auditoría/seguridad. Cada familia fija productor, campos,
   granularidad, dimensiones, owner y criterio de reconciliación.
2. **CANDIDATE `HD-39`:** el acceso usa exclusivamente el catálogo cerrado y una capability de familia explícita;
   `report.export` es adicional para exportar. Scheduling/delivery requieren `report.export` más policy más restrictiva
   hasta que spec 14 apruebe capabilities separadas. Acceso a pantalla, entidad o dominio nunca concede otra operación.

| Familia | Capability mínima candidata de view/request | Controles adicionales |
|---|---|---|
| Académico, asistencia, evaluación, progreso/finalización, carga docente | `report.academic` | Scope/relación, field projection y estado del productor. |
| Admisiones | `report.sales` | Funnel/PII por scope; ninguna lectura académica implícita. |
| Finanzas por moneda | `report.finance` | Separación por moneda y proyección financiera. |
| Uso/límites | `report.usage` | Metadata operacional mínima; sin contenido ni identidades innecesarias. |
| Auditoría/seguridad | `report.audit` | Principal privilegiado, redacción y policy por event class; counseling excluido. |

Para todas, view/request/download/schedule/delivery/cancel/retry se autorizan por separado en registry; field projection,
filters, impersonation y service jobs no heredan acceso. `report.export` no concede view de una familia.
3. Cada salida usa una proyección de campos específica y allowlisted. Todo campo tiene clase de sensibilidad y reglas de
   redacción; identidad, counseling, credenciales y datos de menores conservan sus fronteras más restrictivas. Cada
   versión también allowlista claves de filtro, orden y agrupación, tipos, operadores, límites, defaults y normalización;
   un campo no proyectable tampoco puede filtrar, ordenar o agrupar si ello permite inferir existencia, conteo o valor.
4. Toda consulta sigue el path de policy registrado `request/service context → capability → scope/relación → DAL tenant
   → RLS`. Ningún motor, export, vista guardada, schedule o reintento acepta `institutionId`, IDs o filtros del cliente
   como autoridad ni usa acceso directo o cross-tenant.
5. Está prohibido sumar importes de monedas distintas. Un reporte multi-moneda separa cada moneda o usa conversiones
   versionadas con fuente, timestamp y regla explícitos; nunca produce un total mixto.
6. Los agregados son deterministas y versionados. Todas las secciones de una ejecución comparten el mismo snapshot o
   watermark, y publican timezone, intervalo inclusivo/exclusivo y semántica `asOf` sin mezclar cortes temporales.
7. Cada resultado declara freshness, fuentes, transformaciones y linaje hasta la versión del agregado. La reconciliación
   compara conteos, sumas y excepciones con los sistemas productores y bloquea publicación ante diferencias no aprobadas.
8. Toda exportación corre como job asíncrono, auditado e idempotente. La idempotency key liga Institution, actor efectivo,
   `reportId`/versión, parámetros en serialización canónica versionada, snapshot y formato; se persiste junto a un hash del
   payload y `UNIQUE(institutionId,idempotencyKey)`. Un claim transaccional crea a lo sumo un job/artefacto bajo retries
   concurrentes; reutilizar la clave con otro payload produce `CONFLICT` y cero efectos.
9. Los artefactos son privados y tienen checksum. Nunca se publican en buckets, rutas o cachés públicas; metadata y
   auditoría registran hash, tamaño, formato, owner, Institution, clasificación, creación y expiración, nunca una URL firmada.
10. El job expone progreso monotónico y estados `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` y `EXPIRED`.
    Transiciones válidas: `QUEUED→RUNNING|CANCELLED`, `RUNNING→SUCCEEDED|FAILED|CANCELLED`,
    `SUCCEEDED→EXPIRED` y `FAILED→QUEUED` solo mediante retry acotado; `CANCELLED` y `EXPIRED` son terminales.
    El worker reclama un lease con vencimiento/heartbeat; un `RUNNING` abandonado vuelve a cola o falla según policy sin
    duplicar artefacto. Cancelación compite mediante transición condicional: después de `CANCELLED` no puede confirmarse
    `SUCCEEDED`. Ningún estado terminal retrocede y un artefacto parcial nunca puede descargarse ni entregarse.
11. Cada descarga y cada entrega reautorizan sesión, Institution, Membership/actor, capability, scope, estado del reporte,
    expiración y clasificación en ese momento. Una autorización válida al crear el job no autoriza una descarga posterior.
12. Los formatos mínimos son CSV con encoding/esquema documentados y PDF accesible. Las pruebas del PDF cubren orden de
    lectura, headings, tablas, etiquetas, contraste, reflow aplicable y metadata; ambos formatos conservan la misma
    proyección y semántica.
13. Vistas guardadas y schedules almacenan parámetros validados, versión del reporte, timezone, owner y destinatarios
    autorizados. **CANDIDATE `HD-41`:** cada ocurrencia se identifica de forma única por
    `(scheduleId, scheduleVersion, occurrenceAtUtc)`. La versión congela timezone y regla civil; la política final debe
    elegir explícitamente qué hacer con horas inexistentes y horas repetidas por DST, ejecuciones perdidas durante
    downtime, catch-up, solapamiento y máximo de concurrencia. Retries conservan la misma ocurrencia y no crean otra.
    Una edición crea una versión nueva con `effectiveAtUtc`: ocurrencias anteriores permanecen en la versión anterior y
    las posteriores usan solo la nueva; cancelación impide claims nuevos sin convertir un claim ya confirmado en una
    entrega autorizada. La ocurrencia congela un snapshot de destinatarios para trazabilidad, pero cada destinatario se
    reautoriza inmediatamente antes de generar su proyección y antes de entregar. Cada entrega usa una clave idempotente
    por `(scheduleId, scheduleVersion, occurrenceAtUtc, recipientId, channel, reportArtifactVersion)` y no se duplica bajo
    retry o worker concurrente. Las opciones concretas de DST, missed-run, overlap, cutover y cancelación siguen abiertas
    hasta aprobación de `HD-41`; la ausencia de una opción bloquea spec 14 READY. Deshabilitar actor, permiso o reporte
    detiene el schedule.
14. La suite negativa cubre URL directa, `reportId`, job ID, artifact ID, saved-view ID y schedule ID falsificados o
    ajenos; otro usuario, rol o Institution; filtros/fields no permitidos e inferencia por filtros ocultos; descarga
    expirada/cancelada; retry concurrente; y asegura 404/denegación, cero filas, cero entrega, cero artefactos nuevos y
    auditoría conforme al oracle.
15. REP14 entrega una matriz obligatoria `operación × resultado × AuditEvent` para lectura sensible, solicitud, generación,
    descarga, delivery, cancelación, retry, expiración, saved views, schedules y denegaciones. Cada evento aplicable incluye
    actor real/efectivo, impersonación/motivo, Institution, `reportId`/versión, snapshot, parámetros canónicos redactados,
    destino, resultado y correlation ID; el oracle también declara cuándo **no** debe existir evento.
16. Exportaciones y sus artefactos dejan de estar disponibles exactamente a los 30 días aprobados, incluso bajo legal
    hold. A partir de `expiresAt` no se emite signed URL ni delivery ordinario. El hold solo pausa purge físico; no
    restaura ni prolonga download, delivery, login o impersonación. Una retrieval por autoridad legal, si se aprueba,
    usa una superficie separada, principal/capability propios, doble aprobación, motivo, TTL y auditoría; no reutiliza la
    autorización del usuario ni cambia `expiresAt`. Los 90 días aplican solo a clases operacionales de matriz aprobada;
    evidencia académica o no clasificada se excluye por defecto. Hold registra alcance, clases, autoridad, aprobadores,
    inicio/fin y correlation ID, y un restore reproduce hold/tombstone antes de abrir acceso.
17. Esta frontera bloquea producción. La implementación pertenece a una spec 14 dedicada y no puede iniciar hasta que
    todas las specs productoras de datos consumidos por el registro estén `DONE`, exista un dependency manifest cerrado y
    la spec 14 obtenga su propio claim, revisión y transición READY. Este paquete no implementa reportes ni edita spec 14.

### R-16 · DAG bloqueante de aula y reportería

1. La ejecución respeta este orden y no usa un nodo posterior para justificar que su productor está completo:

```text
FND foundation + identidad/Membership + estructura académica
  → CO Course/Offering
      → EN OfferingStaff + Enrollment
          → CS MeetingPattern + ClassSession
          → AS Assignment + SubmissionAttempt
          → EX Exam + ExamAttempt
          → AT Attendance sobre ClassSession
      AS + EX → GR gradebook + publicación + cierre/reapertura
      CS + D05 content/calendar/files + AS + EX + AT + GR → CM anuncios + mensajes + outbox
  CO + EN + CS + AS + EX + GR + AT + CM → J4 recorridos ADMIN/TEACHER/STUDENT/GUARDIAN
  J4 → UX resiliencia + accesibilidad + PWA/offline
  FND + todos los productores DONE → RM manifest de productores de nueve familias
  RM → S14 claim, revisión y READY propios de spec 14
  S14 + FND → RR registry + consulta + seguridad por campo
  RR + CM → RJ exports + artefactos + vistas guardadas + schedules/delivery
  RJ + UX → RA aceptación multi-tenant de las nueve familias
  RA + recovery/SLO/release gates → PB bloqueo de preproducción satisfecho
```

2. `HD-27..HD-37` deben cerrar, respectivamente: ownership/versionado Course/Offering; estados de matrícula/finalización;
   materialización y excepciones ClassSession; intentos de tareas; intentos/autosave de exámenes; cálculo/publicación/cierre
   de notas; modos/correcciones de asistencia; anuncios/mensajes; calendario/deduplicación; frontera PWA/offline; y un
   recorrido acotado por cada rol. Cada cierre incluye migración compatible, rollback o forward-fix y oráculos.
3. `HD-38` cierra el inventario `ReportRegistry` de nueve familias y su manifest de productores. Ninguna familia puede
   sustituirse por un KPI: académico; asistencia; evaluación; progreso/finalización; carga docente; admisiones; finanzas
   por moneda; uso/límites; auditoría/seguridad.
4. `HD-39` cierra operación y seguridad por campo: permisos de view/request/download/schedule/delivery/cancel/retry,
   proyecciones, sensibilidad, scope, relación, impersonación y prevención de inferencia por filtros/agregados ocultos.
5. `HD-40` cierra filtros y semántica temporal/financiera: parámetros allowlisted, snapshot/watermark común, timezone,
   intervalos, `asOf`, aggregate version, freshness SLO por familia, linaje y reconciliación. Diferencia no aprobada o
   total mixed-currency bloquea publicación.
6. `HD-41` cierra job/artefacto/vista/schedule/delivery: payload canónico, idempotencia, lease, heartbeat, retry,
   cancelación, progreso, CSV, PDF accesible, checksum, Storage privado, expiración exacta, legal hold, destinatarios,
   reautorización y objetivos de servicio.
7. La aceptación de reportería ejecuta las nueve familias con admin, líder/docente scoped, finanzas, registro,
   estudiante/tutor denegados, plataforma metadata-only, impersonación, service job y dos Institutions. Cubre seguridad
   por rol/campo, IDs/URLs/filtros falsificados, freshness, lineage, producer reconciliation, monedas, retries concurrentes,
   cancelación/expiración, auditoría, accesibilidad, offline/reconnect y cero efectos en denegación.
8. Specs 05–10, 14 y 15 permanecen sin cambios bajo este claim. Los nodos describen dependencias y gates, no transfieren
   ownership, no marcan productores `DONE` y no autorizan implementación.

## 7. Matriz mínima de permiso, recurso y estado

La transición desde el enum legacy es explícita y sigue abierta en `HD-05/HD-06`; ningún nombre aproximado concede
capabilities. El manifest debe cubrir cada fila por separado:

| Rol legacy | Plantilla objetivo candidata | Condición de transición |
|---|---|---|
| `SUPER_ADMIN` | `OWNER` o `ADMIN` | Elección explícita; nunca convertir automáticamente en OWNER. |
| `ADMIN` | `ADMIN` | Membership y asignación tenant con capabilities verificadas. |
| `COORDINATOR` | `ACADEMIC_LEAD` | Scope tipado obligatorio; sin finanzas. |
| `TEACHER` | `TEACHER` | Relación activa con cada Offering. |
| `STUDENT` | `STUDENT` | Enrollment/relación activa; sin datos de pares. |
| `PARENT` | `GUARDIAN` | Guardianship activa y permisos por área. |
| Sin equivalente legacy | `REGISTRAR`, `FINANCE`, `ADMISSIONS`, `ASSISTANT`, `HOMEROOM`, `COUNSELOR` y roles de plataforma individuales | Alta explícita; nunca inferida durante backfill. |

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

Estos son contratos candidatos de alcance, no evidencia de finalización. `HD-37` mantiene abiertos rutas finales,
fixtures, asignación de clientes y owner humano; ninguna fila puede aceptarse parcialmente ni sustituirse con SQL manual.

| Actor | Estado inicial y acciones visibles | Outputs persistidos y comprobación | Negativas/degradación y evidencia |
|---|---|---|---|
| ADMIN | Autentica en Institution activa; desde inicio abre estructura académica, crea/selecciona Course reusable y Offering, asigna staff, matricula grupo, publica semana híbrida, resuelve una excepción de ClassSession, revisa cierre de asistencia/notas y comunica. Las rutas exactas salen de los registries READY de D02-D10. | Course y Offering quedan separados; staff/enrollments/sessions/audit/outbox persisten. Reload y sesión fresca muestran el mismo resultado y ninguna operación depende de un toast. | Último OWNER, autoelevación, role/scope ajeno, cross-user/Offering/Institution IDs, capacity race, revoked/suspended/cancelled, stale form, lost response y 320/360/offline. Owner de aceptación y cliente exacto quedan en `HD-37/HD-23`. |
| TEACHER | Autentica; abre Today, entra a Offering/ClassSession asignada, publica contenido/archivo, crea tarea y examen, observa submission/attempt, toma asistencia de 30 estudiantes, califica/corrige con motivo, publica/recalcula y comunica. | Versiones de contenido, attempts, answer acknowledgements, attendance corrections, grade snapshot/revisions, messages y AuditEvent/outbox persisten tras reload y sesión fresca; archivo se reautoriza. | Offering/session no asignada, estudiante/attempt ajeno, close/reopen no autorizado, stale roster, duplicate/lost response, revoked relation, otro tenant, offline sin write queued; objetivo de asistencia <1 min y clientes asignados por `HD-37/23`. |
| STUDENT | Autentica; Today muestra ubicación/join en ≤2 acciones; abre contenido/archivo autorizado, entrega tarea con retry seguro, inicia/autoguarda/reconecta/finaliza examen, consulta calendario/mensajes y solo notas publicadas más asistencia/progreso propio. | SubmissionAttempt y ExamAttempt conservan IDs/versiones; status lookup resuelve respuesta perdida; respuestas confirmadas, progreso y estado publicado persisten tras reload/sesión fresca sin duplicar. | Otro estudiante, sin Enrollment, Offering cerrada, artifact/file ajeno, answer stale, retry concurrente, unpublished grade, revoked/suspended/cancelled, cross-tenant y offline/reconnect conforme R-04/R-13. |
| GUARDIAN | Autentica; abre `/dashboard/hijos`, selecciona `/dashboard/hijos/[studentId]` vinculado, consulta schedule/ClassSession, asistencia, tareas, notas publicadas, archivos, anuncios/mensajes permitidos y envía una justificación de asistencia si el productor la autoriza. | Solo proyección del hijo/área autorizados; justificación, audit/outbox y estado resultante persisten tras reload/sesión fresca; selector y flujo cumplen teclado/AT. | Sin vínculo conserva solo perfil/avisos generales; vínculo o área revocados, otro hijo, dato counseling/peer, direct IDs, otro tenant, response loss, suspended/cancelled y offline sin cola sensible. |

Los recorridos base terminan en los productores D02–D10 y no solicitan ni consultan reportes. Las extensiones de recorrido
para reportería se definen y aceptan únicamente después de D14 READY y D15 implementado; D17 las prueba sin convertirlas
en prerrequisito de D11/`HD-37`.

Cada recorrido registra start fixture, route/surface IDs, acciones, row/object/outbox/audit deltas, reload/fresh-session,
identidades negativas, viewport/browser/OS/AT, tester/owner, exact SHA y artefactos en el manifest de R-14. Un productor
D02-D10 no READY/DONE, una ruta no congelada o owner ausente mantiene `HD-37` abierto.

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
| PLAN_LIMIT_REACHED | “Alcanzaste el límite de tu plan. Contacta a la administración para ampliar la capacidad.” / “Contactar a la administración” | Banda persistente; no intenta el alta ni confunde límite con módulo desactivado. El contacto solo aparece si está autorizado. |
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
7. Identidad y roles: clases con varios `User` por `Identity`, usuarios sin `Identity`, Identity sin User, email/hash
   divergente, colisión canónica, selección determinista de canonicalUserId, `UserIdentityRemap`, Membership/PersonProfile,
   remap de cada FK y conteos/checksums exactos; además matriz `SUPER_ADMIN|ADMIN|COORDINATOR|TEACHER|STUDENT|PARENT`
   hacia roles objetivo, alta explícita de roles sin equivalente y FK cross-tenant de rol/target falla en INSERT/UPDATE.
8. RLS generado por manifest para cada tabla/operación concedida, como rol app.
9. Rol app versus owner/migrator y ausencia de rollback a privilegio inseguro.
10. Auth repository: tenant/support/reporting no enumeran identidad ni leen `passwordHash`.
11. Counseling: solo COUNSELOR; OWNER/ADMIN/support/export/impersonación ordinaria deniegan; break-glass auditado.
12. Storage: path, metadata, owner/relación, MIME/size/hash, URL residual y bundle de credencial.
13. Guardian sin vínculo, revocado, uno/múltiples hijos, área no autorizada y cross-tenant.
14. Estados conflict/archive/offline/success, module denied/plan limit, reload y sesión fresca en los cuatro recorridos.
15. Upgrade por predecesor, quarantine, cancelación/reentrada, checksum, dual-write, rollback y forward-fix.
16. Restore drill DB+Storage sin mutar origen.
17. WCAG 2.2 AA: 320/360 CSS px, 200 %, teclado, foco, semántica, contraste, text spacing y AT de `HD-23`.
18. Controles positivos de sesión, guardian portal y submission files.
19. Si PR #129 entra al SHA futuro, exclusión de adjunto seguida de edición inmediata contra backend real.
20. Registro de reportes: permiso de dominio/exportación, proyección por salida, sensibilidad, DAL/RLS y negativas de URL,
    IDs, rol, usuario e Institution.
21. Agregados: versión determinista, no mixed-currency, snapshot/watermark común, timezone/`asOf`, freshness, linaje y
    reconciliación contra productores.
22. Exportaciones: job async auditado/idempotente, estados/progreso/cancelación/retry/expiración, artefacto privado con
    checksum, reautorización de download/delivery, CSV y PDF accesible, vistas guardadas y schedules.

Para cada negativa, el manifest declara como mínimo:

| Superficie | Oracle requerido |
|---|---|
| Página/Route Handler | status, body/schema seguro, redirect/cookie, concealment y cache headers. |
| Server Action | resultado discriminado, cero mutaciones/outbox/Storage y audit permitido o prohibido. |
| Job | estado terminal/retry/dead-letter, actor de servicio, idempotency key y cero trabajo cross-tenant. |
| DAL/RLS | row count, SQLSTATE aprobado, cero filas modificadas y contexto transaction-local. |
| Storage | cero llamadas de firma/objeto en denegación, no-store y audit en emisión autorizada. |

## 11. Criterios medibles de aceptación

El paquete no puede proponerse como READY hasta registrar G0 por mecanismo autoritativo o excepción trazable, cerrar
`HD-01..HD-26`, actualizar cláusulas condicionales fundacionales, completar el manifest de trazabilidad pre-READY y
obtener aprobaciones humanas sobre el contrato fundacional resultante. `HD-27..HD-41` permanecen abiertos como gates de
sus specs productoras, recorridos, PWA y reportería; bloquean esos nodos y producción, pero no la puerta acíclica de la
fundación. La decisión de revocación viva está aprobada, pero `HD-04` permanece abierto por su adaptador N/N-1 dependiente
de `HD-05/HD-15`. La excepción G0 del 2026-11-16 ya permite esta iteración documental y su handoff `S0-GOV`, pero no
satisface los demás gates. Una implementación futura tampoco puede aceptarse hasta que:

1. Un manifest cubra 100 % de páginas, layouts, navegación, actions, APIs, jobs y DAL con policy ID.
2. Existan cero imports Prisma fuera de allowlists tenant/auth/platform/migration aprobadas.
3. El manifest de tablas muestre 100 % de claves, accesos tenant-first, FK aplicables y policies por operación.
4. Nulls inexplicados en claves tenant-required, huérfanos, tuplas mixtas y divergencias sean cero; nulls globales
   aprobados se clasifiquen; ninguna fila se descarte sin ledger.
5. Unit, integración HTTP, DB-policy y E2E pasen con comandos/versiones/artefactos declarados y cero skips no aprobados.
6. Los 16 estados post-migración y el demo actual tengan disposition `SUPPORTED|EXCLUDED` con evidencia; cada supported
   migre y haga rollback dual con conteos/checksums exactos e interrupción reproducible, incluida reconciliación alpha si aplica.
7. Locks, timeouts, lotes, retries, write pause, ventana y abort thresholds estén dentro del presupuesto completo de R-10.15.
8. La evolución in-place de `User` demuestre source users=remaps, clases resueltas=Users canónicos, Membership y
   PersonProfile completos, conteos iguales por cada FK remapeada, checksums source=target+quarantine y cero colisiones/
   referencias pendientes antes de cutover. Después, revocación falla cerrada en la primera petición nueva de página,
   action, API, job actuando por una persona y `/api/auth/session`; la matriz N/N-1 de `HD-04/HD-05/HD-12/HD-15` prueba
   cada claim, mapping, reissue, drain y cutover sin usar role/Institution del token como autoridad.
9. El SHA exacto pase el release manifest; todo check requerido termina SUCCESS y deployment identity coincide con commit.
10. Los artefactos de **evidencia de release** tienen hash/provenance, redacción verificada y retención aprobada no menor
    de 14 días. Los artefactos de **exportación de reportes** dejan de estar disponibles exactamente a 30 días incluso
    bajo legal hold; cualquier conservación o retrieval legal separada cumple R-15.16.
11. Los cuatro recorridos de §8 pasan en entorno aislado `HD-22`, incluida persistencia, Storage y cross-tenant.
12. SLI/alertas producen evidencia conforme a semántica de R-14 y umbrales `HD-20`.
13. Restore drill de DB+Storage mide RPO/RTO `HD-21`, conserva origen y limpia destino.
14. WCAG 2.2 AA y combinaciones `HD-23` tienen evidencia automática y humana.
15. Cinco responsabilidades aprueban independientemente el mismo commit: arquitectura; seguridad/privacidad;
    migración/datos; producto/UX/accesibilidad; y testabilidad/release evidence. El revisor independiente aprobado puede
    cubrir varias responsabilidades solo si registra un veredicto separado y evidencia suficiente para cada una; el
    owner autoriza después la transición.
16. La autoridad `HD-24` autoriza por separado READY, implementación, merge, migración, deploy y release.
17. El SLO aprobado de 99,9 % mensual tiene SLI, exclusiones, error budget, fuentes y alertas verificadas.
18. El restore drill demuestra RPO ≤ 1 h y RTO ≤ 4 h en staging dedicado de pago en US East, sin mutar el origen.
19. La matriz completa responsive web/PWA móvil y la autenticación contraseña/Google/Microsoft tienen evidencia técnica y
    humana; la consola `app.edukana.com` no expone datos tenant antes de seleccionar un espacio autorizado.
20. Antes de producción, la spec 14 dedicada demuestra R-15 sobre reportes cuyos productores están todos `DONE`; ningún
    reporte se acepta con total mixed-currency, snapshot inconsistente, lineage/reconciliation incompletos, artefacto
    público, descarga sin reautorización o negativa cross-tenant ausente.
