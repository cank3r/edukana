# 00 · Límite institucional confiable y autorización de petición — Tareas futuras

**Estado:** DRAFT-CANDIDATE
**Base autoritativa auditada:** `origin/todo/tanda-4` en `d16502906aaba04f7fdad2323a1152f3efeb1794`
**Baseline documental pre-Phase B:** PR #130 en `bdb1a9d8844af7bc2e2817903d9dd37492a79523`
**Candidato actual:** bytes de la rama de PR #130; cada approval reusable debe registrar el SHA exacto observado en GitHub.
**Ejecución:** T00–T03 permiten solo gobierno, documentación, revisión y evidencia read-only expresamente autorizada.
Ningún harness nuevo, código, schema, migración, cambio de entorno o implementación es ejecutable antes de G-READY.

## 1. Reglas de handoff

- Cada fase futura necesita claim exclusivo visible y base SHA vigente.
- Un solo writer controla schema/migraciones. Auth, context, catálogo, DAL, roles DB y Storage son contratos compartidos.
- Revisores independientes trabajan read-only salvo un claim correctivo posterior explícito.
- Ninguna fase toca Preview, Supabase, datos, Storage, infraestructura, ramas protegidas o producción sin autorización
  específica del destino y la operación.
- Cada handoff registra base, archivos, migraciones, commands, resultados, no ejecutado, evidencia, decisiones y siguiente
  writer.
- Un stop condition detiene la fase. No se amplía alcance ni se debilita una negativa para continuar.
- Los checkboxes son backlog de diseño. Solo T00–T03 pueden realizarse mientras el estado siga DRAFT-CANDIDATE, y dentro
  de sus límites no mutantes.

## 2. Dependencias y gate

| Nodo | Requiere | Habilita | Mutación permitida antes de READY |
|---|---|---|---|
| T00 coordinación/candidato | Asignación documental + excepción G0 trazable del 2026-11-16 | T01 | Solo tres specs y fila propia; handoff `S0-GOV` |
| T01 inventario read-only | T00 + autorización exacta del origen | T02 | Ninguna mutación del origen |
| T02 decisiones humanas | T01 | T03 | Solo decision log/documentos |
| T03 revisión y transición | T02 + excepción G0 vigente + manifest de trazabilidad pre-READY | G-READY | Solo documentos y review evidence |
| G-READY | Cero HD-01..26 fundacional abierto + cinco aprobaciones same-commit + autoridad HD-24 | T04–T07 | Transición documental separada |
| T04 harness/evidence | G-READY | T05–T11 | Solo en claim de implementación |
| T05 frontera S1 transicional | G-READY + T04 + HD-01/02/04/26 | T05A | Host, sesión legacy viva y contexto transicional; no crea identidad S2 |
| T05A integración post-S2 | T05 + identity/Membership producer S2 DONE + HD-04/05/12/15 | T06/T07/T08/T09 | Integra User global in-place, source/class/remap/consolidation/anomaly/session-version ledgers, Membership/PersonProfile/ProviderAccount/AuthSession y edge manifest producidos por S2 |
| T06 authz/navigation/atomicity | T05A + T04 | T07/T11 | Código futuro autorizado |
| T07 DAL/auth/Storage | T05A + T06 | T09/T11 | Código futuro autorizado |
| T08 DB expand/backfill | G-READY + T01 + T04 + T05A + identity/Membership producer S2 DONE + HD-05..15 | T09 | Schema/migration futura autorizada; spec00 integra, no posee el modelo identity |
| T09 roles DB/RLS | T05A + T06 + T07 + T08 + pooler proof | T10/T11 | DDL futura autorizada |
| T10 contract | T09 + stable window + restore | T11 | Irreversible approval separada |
| T11 acceptance/release evidence | T04–T10 + operations gates | T12 | Solo entorno HD-22 autorizado |
| T12 handoff S3 | T11 + spec 00 implementada/aceptada | Spec S3 | Documentación separada |
| T13 handoff reportes/spec 14 | Manifest de productores + todas las specs productoras `DONE` | Claim/revisión de spec 14 | Solo handoff; cero reportes |

```text
T00 → T01 → T02 → T03 → G-READY
G-READY → T04 → T05(S1 transicional) → identity/Membership S2 → T05A(integración post-S2)
T05A → T06 → T07
G-READY + T01 + T04 + T05A → T08
T05A + T06 + T07 + T08 → T09 → T10
T04..T10 → T11 → T12
all report producers DONE + dependency manifest → T13 → spec 14 claim/review/READY
```

G-READY no existe en este candidato y no puede inferirse de la excepción G0, un PR DRAFT, review parcial o test verde.
Solo `HD-01..HD-26` pertenecen a esa puerta fundacional. `HD-27..HD-41` siguen abiertos en las specs dueñas y bloquean
sus productores, recorridos, reportería y producción; no pueden usarse para reintroducir un ciclo hacia G-READY.
T13 tampoco autoriza implementación de reportes.

## 3. DAG contractual de aula y reportería

Este orden no autoriza implementación ni edita specs vecinas:

```text
FND foundation + identidad/Membership + estructura
  → CO Course/Offering
      → EN OfferingStaff/Enrollment
          → CS MeetingPattern/ClassSession
          → AS Assignment/SubmissionAttempt
          → EX Exam/ExamAttempt
          → AT Attendance
      AS + EX → GR gradebook/publicación/close-reopen
      CS + content/calendar/files + AS + EX + AT + GR → CM announcements/messages/outbox
  CO..CM → J4 journeys ADMIN/TEACHER/STUDENT/GUARDIAN
  J4 → UX resilience/accessibility/PWA
  FND + CO..CM + admissions + finance + usage + audit, todos DONE → RM nine-family manifest
  RM → spec14 claim/reviews/READY
  spec14 READY + FND → RR registry/query/field security/snapshot/freshness/lineage/reconciliation
  RR + CM → RJ export jobs/artifacts/saved views/schedules/delivery
  RJ + UX → RA nine-family multi-tenant acceptance
  RA + recovery/SLO/release evidence → production unblock
```

- `HD-27..HD-37` cierran ownership y comportamiento de los productores y los cuatro journeys.
- `HD-38..HD-41` cierran inventario de nueve familias, seguridad de operación/campo/filtro, semántica temporal-financiera,
  freshness/lineage/reconciliation y jobs/artifacts/scheduling/delivery.
- Ningún nodo posterior puede marcar al anterior `DONE`; cada handoff conserva `Institution`/`institutionId`, las 16
  migraciones y su propio claim/revisión/READY.

## T00 · Cerrar gobierno del candidato

- [x] Conservar como registro histórico la verificación inicial en `dce739270e7edba51f2034e602a4ae6468bbd773`.
- [x] Revalidar para Phase B que el worktree está limpio en la rama de PR #130, que HEAD y upstream coinciden en
  `bdb1a9d8844af7bc2e2817903d9dd37492a79523`, y que su delta desde
  `d16502906aaba04f7fdad2323a1152f3efeb1794` contiene solo los cuatro archivos autorizados.
- [x] Registrar **“Autoriza excepción G0 y dependencias”** del 2026-11-16 con identidad, fecha, texto y alcance en
  [PR #130, comentario 6927885328](https://github.com/cank3r/edukana/pull/130#issuecomment-6927885328), limitada a la
  fila SPEC00 existente y el handoff `S0-GOV`.
- [ ] Publicar el claim mediante el mecanismo autoritativo si una fase futura exige visibilidad fuera de esta excepción.
- [ ] Revalidar que no existe claim competidor inmediatamente antes de cada revisión con escritura.
- [x] Mantener exactamente `requirements.md`, `design.md`, `tasks.md` y la fila propia como límite.
- [x] Mantener DRAFT-CANDIDATE y registrar hechos, inferencias, candidates y decisiones humanas por separado.
- [x] Etiquetar `bdb1a9d8844af7bc2e2817903d9dd37492a79523` como baseline pre-Phase B, no como identidad de los bytes
  locales modificados. No inventar SHA: un commit posterior autorizado debe fijar candidato/hashes y todas las reviews
  reutilizables se repiten contra exactamente ese commit.
- [ ] Reconciliar specs DRAFT 01/02/03/15 por cláusula, sin editarlas desde este claim.

**Owner futuro:** writer/coordinador documental.
**Salida:** candidato, diff, trazabilidad de reviews y evidencia de coordinación.
**Stop:** claim competidor, base movida, excepción G0 ampliada más allá de SPEC00/S0-GOV o archivo fuera de alcance.

## T01 · Inventario read-only pre-READY

- [ ] Obtener autorización del origen exacto; confirmar que la credencial no puede escribir.
- [ ] Registrar SHA, migration history y fingerprint del entorno sin exponer secretos.
- [ ] Inventariar roles PostgreSQL, ownership, memberships, grants, inheritance, `rolbypassrls` y policies.
- [ ] Confirmar tipo/configuración del pooler y conexión app/migrator por metadata no secreta.
- [ ] Ejecutar prueba read-only de viabilidad transaction-local en un entorno aislado autorizado, sin DDL ni datos reales.
- [ ] Obtener conteos agregados de rows, nulls, orphans y cross-institution tuples.
- [ ] Obtener table/index sizes y `EXPLAIN` seguro de consultas tenant-first representativas.
- [ ] Enumerar los 16 estados post-migración y demo actual; asignar `SUPPORTED|EXCLUDED`, population assumptions,
  fixture/postflight y evidencia. Exclusión exige imposibilidad de datos o de-support humano; alpha supported exige
  reconciliación inmutable.
- [ ] Obtener backup IDs/age, Storage inventory y límites operativos disponibles.
- [ ] Registrar budget fields por operación: lock/statement DDL/index/validate; batch min/initial/max y target;
  SQLSTATE/backoff/retries; write-pause/window/abort; medidas que justifican cada valor.
- [ ] Redactar PII, credentials, tokens, cookies, password hashes y signed URLs.
- [ ] Conservar commands/queries reproducibles y prueba de cero mutaciones.

**Owner futuro:** data/security reviewer con acceso read-only autorizado.
**Salida:** environment evidence manifest, aggregate results y gaps por `HD-09/10/13/14/21/22/26`.
**Stop:** destino ambiguo, privilegio de escritura, dato personal en output, policy fuera de scope o mutación detectada.

## T02 · Resolver decisiones humanas

**Inputs humanos aprobados y trazables en [comentario 6928063312](https://github.com/cank3r/edukana/pull/130#issuecomment-6928063312), sin cierre técnico implícito:**
`AHD-01` RPO 1 h/RTO 4 h; `AHD-02` export 30 d y operacional 90 d+purge; `AHD-03` impersonación ≤30 min;
`AHD-04` owner+revisor independiente; `AHD-05` staging dedicado pago US East; `AHD-06` edukana.com/app.edukana.com;
`AHD-07` invite-only+marketplace público; `AHD-08` responsive web/PWA móvil completa; `AHD-09` 99,9 % mensual;
`AHD-10` contraseña+Google+Microsoft.

- [ ] Mantener una matriz `AHD → HD → requisito → tarea → evidencia`, incluida `AHD-10→HD-12/HD-04→T05A/T11`.
- [ ] Asignar owner humano y fecha objetivo a la evidencia técnica pendiente de `HD-01..HD-26`; registrar owner de spec
  y nodo de handoff para `HD-27..HD-41` sin pretender cerrarlos desde la fundación.
- [ ] Para cada HD, separar valor humano aprobado de evidencia, rationale, approver/date, compatibility y rollback pendientes.
- [ ] Elegir un solo modelo Membership/role y un solo modelo scope con FKs enforceable.
- [ ] Cerrar global allowlist, composite-FK exceptions, canonical email y ProviderAccount Google/Microsoft: verified claims,
  collision/no-auto-link, recent reauth, provider-email changes, unlink/last-method, token revoke, takeover recovery,
  sessionVersion/audit, migración N/N-1 y feature rollback.
- [ ] Cerrar proxy topology, host behavior y proyección `institutionRoutingStatus` con sync/cache revocation atómicos.
- [ ] Cerrar roles/grants/pooler/FORCE RLS y paths de platform/job/export/repair/impersonation.
- [ ] Cerrar predecessor matrix exhaustiva, budgets completos, legacy-authoritative/catch-up, N-1 drain, stable window,
  cutover y safe rollback/forward-fix classification.
- [ ] Cerrar `HD-04` después de `HD-05/HD-15` con matriz claim-by-claim del token legacy/target, mapping único,
  missing/ambiguous deny, version triggers, reissue y HTTP concurrency en cada superficie.
- [ ] Cerrar impersonation: authority modes/approvals, target assignment, permission intersection, allow/deny lists,
  max DB, one-active, revocation, terminal states, audit y concurrency.
- [ ] Cerrar suspended/cancelled/read-only matrix separada de archive y retention; hold preserva sin ampliar acceso.
- [ ] Someter a aprobación los candidatos SLI-1, REC-1, WEB-1, INST-1 y REL-1 sin confundir contrato con evidencia.
- [ ] Entregar `HD-27..HD-37` abiertos a sus specs dueñas con criterios de decisión: Course/Offering,
  enrollment/staff, ClassSession, assignments, exams, grades, attendance, communication, calendar, PWA/offline y cuatro
  role journeys. Cada nodo los cierra con su compatibilidad y rollback/forward-fix antes de ejecutarse.
- [ ] Entregar `HD-38..HD-41` abiertos a spec 14 con criterios de decisión: nueve familias, seguridad por
  operación/campo/filtro, snapshot/freshness/lineage/reconciliation y jobs/artifacts/saved views/schedules/delivery.
  Spec 14 los cierra antes de su READY; no bloquean G-READY fundacional.
- [ ] Regenerar requisitos, modelo, matrices, tasks y oracles para eliminar ramas condicionales incompatibles.

**Owner futuro:** autoridades de dominio y `HD-24`, no el writer por inferencia.
**Salida:** decision log cerrado y candidato internamente único.
**Stop:** `HD-01..HD-26` abierta, handoff sin owner/nodo para `HD-27..HD-41`, approver/date ausente, opción
fundacional no implementable, steering conflict o riesgo aceptado sin owner/expiry.

## T03 · Revisar contrato resuelto y crear G-READY

- [ ] Validar antes de READY la expansión lógica de design §15.4 contra cada cláusula R-01..R-16: cero IDs
  ausentes/duplicados y cada fila con requirement/policy/test IDs, layer, fixture, positive/negative oracle, exact
  side-effect/audit deltas, owner, command o `NOT_YET_IMPLEMENTED`, artifact, status, external dependency y stop.
  Reemplazar perfiles generales fundacionales por valores específicos al cerrar `HD-01..HD-26`; en G-READY no puede
  quedar `UNASSIGNED/PENDING` para esas filas. Las filas dependientes solo de `HD-27..HD-41` usan
  `DEFERRED_TO_OWNER_SPEC` con owner/nodo/stop explícitos, nunca un PASS ficticio.
- [ ] Parsear `IFX-1` de design §14.2.2, recalcular sus diez SHA-256 sobre UTF-8 sin newline y verificar que cada caso
  enlaza requisito, test ID, categoría, owner y stop condition sin modificar los outputs esperados.
- [x] Registrar las cinco revisiones iniciales del diff local como `NEEDS_FIX`; no tratarlas como approval exact-SHA.
- [ ] Después de un commit candidato autorizado, repetir cada lane afectada contra el mismo SHA y resolver sus P0/P1.
- [ ] Obtener revisión independiente de arquitectura sobre las decisiones ya cerradas.
- [ ] Obtener revisión independiente de seguridad/privacidad, incluida auth, Storage, counseling y audit.
- [ ] Obtener revisión independiente de datos/migration, manifests, rollback y restore.
- [ ] Obtener revisión independiente de producto/simplicity/accessibility y cuatro journeys.
- [ ] Obtener revisión independiente de testability/release evidence y exact oracles.
- [ ] Si una sola persona revisora cubre varias responsabilidades, exigir un veredicto separado, evidencia y fecha por
  arquitectura; seguridad/privacidad; migración/datos; producto/UX/accesibilidad; y testabilidad/release evidence.
- [ ] Resolver todo P0/P1 en un nuevo claim documental y rerun de las cinco revisiones afectadas.
- [ ] Verificar G0, acyclic DAG, clause reconciliation y exact title/status en los tres documentos.
- [ ] Verificar REL-1 contra ledger same-commit: writer≠reviewer, deploy executor≠approver, release owner final,
  data/security authority para DB/policy/restore, Incident Commander solo app rollback compatible y forward-fix cuando
  rollback debilita aislamiento.
- [ ] Crear una transición separada a READY solo con autoridad `HD-24`; no incluir implementación.

**Owner futuro:** autoridad `HD-24`; reviewers distintos del writer.
**Salida:** cinco verdicts trazables y commit de transición documental separado.
**Stop:** G0 pendiente, `HD-01..HD-26` abierta, handoff downstream sin dueño/stop condition, reviewer no
independiente, P0/P1, aprobación sobre versión anterior o identidad/fecha ausente.

## G-READY · Puerta explícita

Condiciones simultáneas:

- G0 visible por mecanismo autoritativo o excepción trazable limitada; para este candidato aplica la excepción del 2026-11-16.
- La decisión de revalidación viva está aprobada, pero `HD-04` permanece OPEN_BLOCKING hasta que `HD-05/HD-15`
  cierren el adaptador claim-by-claim, reissue, drain, cutover y rollback sin autoridad stale.
- `HD-01..HD-26` deben estar cerradas con evidencia/owner/date.
- `HD-27..HD-41` deben tener spec/nodo dueño, dependencia y stop condition explícitos. Permanecen abiertos y bloquean su
  ejecución y producción, pero no cuentan como defectos de cierre de G-READY.
- El manifest de trazabilidad pre-READY contiene una fila completa por cada cláusula normativa, sin comandos inventados.
- Requisitos, diseño, tasks, fixtures y oracles describen una sola opción para `HD-01..HD-26`; los handoffs
  `HD-27..HD-41` pueden conservar alternativas CANDIDATE delimitadas con spec dueña y stop condition.
- Reviews architecture/security/migration/product-UX/testability aprueban el mismo commit.
- Owner y revisor independiente identificados según `HD-24` firman la transición DRAFT-CANDIDATE→READY en cambio separado.

Hasta entonces, T04–T12 están bloqueadas.

## T04 · Harness y evidencia reproducible

- [ ] Crear machine-readable fixture manifest para los 16 estados post-migración y demo actual, cada uno con
  `SUPPORTED|EXCLUDED`, fixed IDs, UTC clock, timezone/locale y random seed; no omitir estados fallidos.
- [ ] Materializar `IFX-1` sin cambiar sus outputs/hashes y expandirlo con una fila por cada FK a `users.id`, la FK
  saliente Institution, interruption checkpoints y hashes PostgreSQL por tabla/edge.
- [ ] Definir exact rows/states/roles/scopes/relationships/anomalies y file bytes/SHA-256.
- [ ] Crear namespace por run y teardown que pruebe cero residual rows/objects.
- [ ] Separar unit, HTTP integration, DB-policy y E2E exact-SHA.
- [ ] Prohibir mocks de authz/DAL/session en integration y owner role en app-policy tests.
- [ ] Completar cada fila pre-READY del manifest con commands y artifacts implementados, conservando historial de
  `NOT_YET_IMPLEMENTED`; no crear cobertura nueva para ocultar una cláusula omitida.
- [ ] Crear per-surface denial oracle con status/result, cookies/redirect, audit y side-effect deltas.
- [ ] Crear release-evidence manifest con checks, terminal status, skips/retries/flaky y vulnerability policy.
- [ ] Fijar artifact hashes, provenance, retention y redaction scan.

**Owner futuro:** test/evidence writer, sin product scope adicional.
**Salida:** fixture, traceability, policy-operation y release manifests.
**Stop:** nondeterminism, hidden manual fixture, mock de boundary, owner DB, skip no aprobado o artifact sin SHA/hash.

## T05 · Frontera S1 transicional de host, sesión legacy y request context

- [ ] Implementar `HostAuthority` triestado sin `null` ambiguo.
- [ ] Implementar adapter exacto de proxy/header/hop `HD-26`; contradiction produce UNKNOWN.
- [ ] Implementar resolver preauth mínimo con el único DTO interno
  `ResolvedInstitutionRoute(institutionId,canonicalHost,domainKind,domainStatus,institutionRoutingStatus,routingVersion)`,
  role/function/grants/search_path y sync transaccional revisados; la autoridad pública omite estados/version y authority
  cache queda off hasta aprobación HD-11/26.
- [ ] Probar que función, adaptador DB y cualquier cache futura producen los seis campos del DTO interno y que falta,
  rename o contradicción de `domainKind`/`routingVersion` falla cerrado; la proyección pública deriva `source` solo de
  `domainKind` y no serializa estados/version.
- [ ] Probar interleaving de resolve con suspend/cancel/reactivate/revoke: ningún request post-commit usa estado stale;
  si se habilita cache futura, probar ack distribuido antes de confirmar el cambio.
- [ ] Devolver 404 UNKNOWN antes de branding/login/session/tenant lookup.
- [ ] Deshabilitar signup por config ausente/inválida.
- [ ] Implementar `getRequestContext()` per-request transicional contra `User`/`Identity` legacy, sin global transaction
  client, sin convertir todavía `User` en raíz global y sin crear `Membership`, `ProviderAccount` ni `AuthSession`.
- [ ] Unificar live revalidation legacy para `/api/auth/session`, pages, actions, APIs y jobs: los claims
  `role`/`institutionId` son solo hints comparados con autoridad server-side y nunca autorizan.
- [ ] Implementar cookie y one-use hashed transition ticket ligado al identificador legacy único durante S1.
- [ ] Probar missing/ambiguous legacy mapping, revocación, replay, theft, concurrent redemption, CSRF, open redirect y
  session fixation.

**Owner futuro:** writer S1 de host/session/contexto transicional; no posee el agregado de identidad S2.
**Salida:** frontera S1 fail-closed, host/session matrix y HTTP/DB evidence sin modelo identity nuevo.
**Stop:** client slug fallback, general platform client, untrusted header, cache cross-request, creación de modelos S2,
password field/log o revocation fuera de SLA.

## T05A · Integración de sesión post-S2

- [ ] Iniciar solo cuando la spec S2 haya evolucionado la tabla `User` existente hasta convertirla en la única identidad
  global, conserve un `User.id` fuente canónico por clase y entregue ledgers tipados de source, class, remap,
  consolidation, anomaly y session-version; además `Membership(institutionId,userId,...)`, role assignments, `ProviderAccount`, `AuthSession`, `PersonProfile`, edge
  manifest y oráculos de design §14.2.1 como productor `DONE`, con claves y compatibilidad aprobadas.
- [ ] Integrar `getRequestContext()` y todas las superficies con esos modelos sin duplicarlos, crear otra raíz de identidad
  ni modificar su ownership.
- [ ] Implementar la matriz final `HD-04/HD-05/HD-15`: token N-1 `sub/idn/sv/role/institutionId`, mapping único hacia
  User/Membership/asignación, missing/ambiguous deny, version-zero prerequisites, emisión/consumo N/N-1, reissue,
  drain, cutover y rollback. `role`/`institutionId` legacy nunca son fallback de autoridad.
- [ ] Migrar los consumidores Auth.js al contrato S2 aditivamente; habilitar password/Google/Microsoft solo tras
  verified-claim, collision/no-auto-link, reauth-link, email-change, unlink/last-method, token-revoke, takeover,
  sessionVersion/audit y feature-rollback tests de `HD-12`.
- [ ] Reemitir cookie/ticket con localizadores S2 y probar mixed-version, identity-store failure, concurrent revocation,
  drain y rollback en `/api/auth/session`, pages, actions, APIs y jobs.

**Owner futuro:** integrador auth/context post-S2, distinto del productor S2 salvo claim explícito sin solape.
**Salida:** sesión objetivo integrada, matriz N/N-1 y evidencia de cutover/rollback.
**Stop:** S2 no DONE, contrato físico ambiguo, identidad duplicada, claim legacy usado como autoridad o cambio al agregado
S2 desde este claim.

## T06 · Autorización, navegación y mutaciones atómicas

- [ ] Implementar policy de lifecycle por operación: negocio exige `ACTIVE`; recovery en `SUSPENDED`/`CANCELLED` solo
  usa allowlist mínima, capability y auditoría propias; después module/plan→capability→scope→relationship→state→operation.
- [ ] Consolidar closed capability catalog sin cambiar semantics por inferencia.
- [ ] Registrar layouts/pages/navigation/tabs/breadcrumbs/search/prefetch/actions/APIs/DAL/jobs/platform.
- [ ] Denegar build/runtime para surface ausente y devolver concealment 404.
- [ ] Revalidar versions/status/relationship dentro de transaction para cada sensitive write.
- [ ] Elegir lock/serializable/optimistic strategy; concurrent revoke produce zero mutation/outbox.
- [ ] Aplicar guardian own-profile/general-announcement exception y child relationship rules.
- [ ] Aplicar finance/academic separation, peer privacy, last OWNER y no self-role/self-grade.
- [ ] Aplicar counseling-only y audited break-glass separado de ordinary impersonation.
- [ ] Implementar impersonation `HD-17`: authority approvals, target assignment, DB max 1800 s, one-active,
  permission intersection, immutable allow/deny lists, per-request revocation, terminal states y complete AuditEvent.
- [ ] Probar que revocar inserta una única `ImpersonationApprovalRevocation`, conserva byte-for-byte la aprobación,
  rechaza revocación de `REJECTED`, segunda revocación y FK cross-Institution, y que revoke/read concurrente deniega.
- [ ] Probar clock boundaries, `requestedDurationSeconds` 0/1/300/1800/1801, rechazo de expiresAt distinto a lo
  solicitado y de UPDATE posterior a createdAt/duration/expiresAt, every allowed/denied operation y concurrent
  revoke/read con cero efectos tardíos.
- [ ] Aplicar mutationId+canonical payload hash+original-result replay+status lookup+bounded retry a cada productor de
  R-16; atomizar AuditEvent/outbox y verificar exact deltas para duplicate/conflict/lost-response/cross-tenant.
- [ ] Aplicar suspended/cancelled matrix `HD-25` sin conflation con archive.

**Owner futuro:** authz/registry writer; domain owners aportan casos bajo claims separados.
**Salida:** 100 % registry, matrices y concurrency evidence.
**Stop:** implicit permission, UI/server drift, data/prefetch before deny, TOCTOU mutation o confidential disclosure.

## T07 · DAL, auth data y Storage boundaries

- [ ] Crear allowlists separadas tenant/auth/platform/migration/Storage para imports DB.
- [ ] Implementar `withTenantData`, auth repository, `withPlatformData` y institutional job context.
- [ ] Revocar direct identity/Auth.js/passwordHash grants al rol tenant/support/reporting.
- [ ] Migrar por aggregate con legacy adapter y parity tests; no global refactor.
- [ ] Inyectar Institution from context y resolver external IDs como composite keys.
- [ ] Devolver minimal role/relationship projections; lists/details comparten policy.
- [ ] Implementar exclusive server-only Storage broker y metadata-derived object paths.
- [ ] Verificar upload bytes/MIME/hash/ownership; URLs usan approved TTL y `no-store`.
- [ ] Auditar signed URL issuance sin URL; medir residual access after revocation.
- [ ] Alcanzar cero imports fuera de allowlist antes de contract.

**Owner futuro:** DAL/auth/Storage writers con ownership no solapado.
**Salida:** migrated aggregate ledger, grants, DTO tests y Storage matrix.
**Stop:** query sin tenant, extra PII/hash, platform escape, service key exposure, client path authority o residual TTL fuera de límite.

## T08 · Expandir, backfill y validar integridad

- [ ] Crear una migración nueva; no reescribir las 16 existentes.
- [ ] Consumir el modelo Membership/roles/scopes producido y marcado DONE por S2/specs de identidad; spec00 no crea ni
  posee ese agregado. Integrar únicamente candidate keys, tenant columns y constraints de frontera aprobados.
- [ ] Exigir en handoff S2 el manifest de design §14.2.1: clases/ranking; source snapshots; class plans;
  identity+Membership remaps; consolidation baseline; `UserSessionVersionEvent`; anomaly sources/resolution con
  migrationVersion compuesto; status/sessionVersion candidate separados del legacy; Membership/PersonProfile; 30-in/
  1-out edge seed; y rollback N/N-1 exacto.
- [ ] Verificar oráculos: source users=remaps+OPEN anomaly users y OPEN=0 antes de cutover; clases=plans=consolidations=
  self-remaps; source Memberships=MembershipSourceRemaps+OPEN y target keys=Membership rows; status global/Membership
  separados; baseline sessionVersion frozen y revocaciones repetidas CAS; checksum incluye auth/recovery/cada edge;
  Institution FK RESTRICT; cero cross-version anomaly link/remap/FK/email/provider pendiente. T08 no cambia S2.
- [ ] Probar rollback pre-cutover después de cada write N permitida: las filas legacy dual-written conservan IDs,
  Institution, role/status/profile, credential/sessionVersion y FK counts; identidades/Memberships nuevas tienen forma
  legacy-compatible; read N-1 produce los mismos authz/results/checksums. No invertir many-to-one al rollback.
- [ ] Por edge: crear/verificar parent UNIQUE `(institutionId,id)` low-lock, child index tenant-first, attach candidate
  key, add composite FK `NOT VALID` si aplica y validar solo tras cero null/orphan/mixed. Preservar FK simples y acciones
  ON DELETE/ON UPDATE durante N/N-1 salvo cambiar `users.institutionId→Institution` de CASCADE a RESTRICT antes de
  autoridad cross-Institution; probar DELETE denegado con cero cascada. Retirar los demás duplicados solo
  post-cutover+retention+EXPLAIN.
- [ ] Versionar manifest completo generado, incluidos CourseModule, Enrollment, Assignment, Submission, ExamQuestion,
  ExamAnswer, OrganizationalUnitMembership y AuditLog→AuditEvent con clasificación global/tenant/quarantine.
- [ ] Cargar por stable PK/checkpoint/idempotency key y quarantine typed anomalies.
- [ ] Calcular canonical SHA-256 y exact expected row/anomaly counts.
- [ ] Forzar interruption en checkpoint, rerun y probar no duplicate/gap.
- [ ] Activar atomic dual-write solo en N con legacy authoritative; ejecutar catch-up idempotente recurrente para writes N-1.
- [ ] Drenar N-1, cumplir stable window candidata de 24 h o la reemplazada por `HD-15` con cero divergencia y
  registrar cutover SHA/versiones; probar rollback pre-cutover a reads N-1 conservando schema aditivo y clasificar
  post-cutover como forward-fix salvo excepción aprobada.

**Owner futuro:** único schema/migration writer; security/data reviewers read-only.
**Salida:** expand/backfill/validate migrations, manifests, anomaly ledger y go/no-go.
**Stop:** destructive operation, ambiguous source path, equality mismatch, unexplained anomaly, lock/timeout/budget, non-idempotence o divergent dual-write.

## T09 · Roles DB, resolver y RLS

- [ ] Provisionar/verificar migrator, app, auth, host-resolution-owner, host-resolver y platform roles según `HD-09`.
- [ ] Probar todos como no-owner/NOBYPASSRLS donde corresponda; registrar inheritance/grants.
- [ ] Ejecutar interactive transaction con `set_config('app.institution_id',...,true)` sin client escape.
- [ ] Alternar tenants y invalid/missing context sobre pool pequeño concurrente.
- [ ] Versionar table×operation×grant×policy×FORCE×exception manifest.
- [ ] Generar same-tenant positive y other/missing/empty/invalid/tenant-key-change negatives por operación concedida.
- [ ] Probar resolver preauth como su rol, incluido direct SELECT denied y hostile search_path.
- [ ] Probar owner/migrator en suite separada y paths auditados de platform/job/export/repair/impersonation.
- [ ] Preparar safe rollback role/policies no-owner/NOBYPASSRLS antes de activation.
- [ ] Si safe rollback no existe, declarar forward-fix-only y obtener go/no-go humano antes de activation.

**Owner futuro:** DB security writer con reviewer independiente.
**Salida:** DDL/grants/policies manifests, exhaustive policy evidence y rollback classification.
**Stop:** owner/BYPASSRLS runtime, persistent SET, pool leak, table/operation gap, broad bootstrap/platform grant o unsafe rollback.

## T10 · Contract y retiro legacy

- [ ] Confirmar stable-window con cero null/orphan/mixed tuple/divergence.
- [ ] Aplicar NOT NULL/final constraints, incluida deuda `s1_security_enforce`, mediante migración nueva.
- [ ] Cambiar autoridad a Membership/assignment y retirar role/Institution authority del JWT.
- [ ] Retirar fallback route y imports Prisma no permitidos.
- [ ] Ejecutar non-destructive restore drill DB+Storage y medir achieved RPO/RTO.
- [ ] Retirar legacy columns/tables solo según retention/legal hold y irreversible approval.
- [ ] Registrar cutover exacto, end of app rollback y forward-fix runbook.

**Owner futuro:** contract migration writer; go/no-go reviewer separado.
**Salida:** contract migration, stability/restore evidence y irreversible authorization.
**Stop:** legacy consumer, restore gap, retention unknown, artifact incomplete, mixed app version o approval ausente.

## T11 · UX, journeys, recovery y exact-SHA acceptance

- [ ] Ejecutar completos los cuatro recorridos base de requirements §8, sin reportería: ADMIN Course/Offering→staff/
  enrollment→hybrid week→attendance/grade close→communication; TEACHER session→content/files→assignment/exam→
  attendance→grade/correction→message; STUDENT Today→content→submission retry→exam autosave/reconnect→calendar/
  messages/results; GUARDIAN child→schedule/attendance/assessment/grades/files/comms→justification. Registrar start
  fixture, routes, persisted rows/objects/audit/outbox, reload/fresh-session y negative identities.
- [ ] Ejecutar las extensiones de recorrido de reportes solo en D17/T13 después de spec 14 READY y de registry/query
  implementados; nunca usarlas para aceptar D11/`HD-37`.
- [ ] Probar loading/empty/retry/404/read-only/archive/conflict/offline/success/revoked y la matriz completa
  SUSPENDED/CANCELLED/ARCHIVED de R-13, `MODULE_OR_PLAN_DENIED` y `PLAN_LIMIT_REACHED`.
- [ ] Probar la authorization lease offline de `HD-36`: binding a user/session/Institution/resource-version/device,
  expiración sin duración inventada, reloj atrasado/rollback/untrusted time, purge local en logout/cambio observado,
  revocación remota aplicada al próximo check y acceso residual nunca posterior a `expiresAt`, además de cero writes/
  background sync sensibles.
- [ ] Para mutaciones de cada journey, probar duplicate, conflicting payload, lost response/status lookup, concurrent retry,
  revoke y cross-tenant con exact row/AuditEvent/outbox/Storage/delivery deltas.
- [ ] Confirmar guardian no-link profile/announcements y linked-child area matrix.
- [ ] Confirmar navigation/tabs/search/prefetch no disclose unauthorized data/counts.
- [ ] Verificar WCAG 2.2 AA y WEB-1: Windows Chrome/Edge/Firefox+NVDA, macOS/iOS Safari+VoiceOver, Android
  Chrome+TalkBack y Playwright Chromium/Firefox/WebKit; versiones exactas, viewports/orientation, 200 %, keyboard/touch,
  focus, contrast, reduced motion, install/standalone y offline. Automatización no sustituye evidencia AT humana.
- [ ] Ejecutar Storage matrix, URL residual y credential-bundle scan.
- [ ] Ejecutar populated migration/rollback, DB policy manifest y concurrent revocation.
- [ ] Ejecutar alert injection conforme SLI-1: event classification, no-traffic UNKNOWN, 10 s/429/exclusions,
  probe cadences, burn windows/thresholds, destination, redaction y timestamps signal/detect/notify.
- [ ] Ejecutar REC-1: cutoff T0, DB/object markers, peor RPO≤1h, declaration→full acceptance RTO≤4h, provider-native
  DB+independent objects, purge/hold replay, source write counters, approvers y cleanup.
- [ ] Si PR #129 integra el SHA, probar exclude attachment→immediate re-edit con backend real.
- [ ] Verificar deployment identity equals exact commit y todos los checks terminan SUCCESS.
- [ ] Hash/provenance/redaction/retention de artifacts y human reviews.

**Owner futuro:** acceptance owner y reviewers independientes; destino exacto `HD-22`.
**Salida:** release manifest, traces/artifacts, SLO/restore evidence y verdict.
**Stop:** unauthorized destination, PII/secret, skip/flaky fuera de policy, pending/wrong-SHA check, browser/AT faltante, source mutation o P0/P1.

## T12 · Handoff a S3 sin implementación implícita

- [ ] Entregar a Course/Offering los contratos aprobados de Membership, scopes, tenant keys, DAL y RLS.
- [ ] Prohibir copiar `User.role`, `Course.teacherId` o Enrollment/Course legacy como contrato nuevo.
- [ ] Registrar DONE/BLOCKED con exact evidence SHA.
- [ ] Abrir claim S3 separado solo después de aprobación de su propia spec.

**Owner futuro:** coordinador S3.
**Salida:** handoff y dependency matrix.
**Stop:** spec 00 no implementada/aceptada, dependency abierta o overlap schema/migration.

## T13 · Handoff bloqueante a reportería/spec 14

- [ ] Crear un dependency manifest con inventario mínimo obligatorio: académico, asistencia, evaluación,
  progreso/finalización, carga docente, admisiones, finanzas por moneda, uso/límites y auditoría/seguridad. Por cada
  `reportId`/versión registrar productor, campos, granularidad, dimensiones, owner, agregado y reconciliación.
- [ ] Exigir estado `DONE` y evidencia exacta para cada spec productora; actualmente el inventario debe evaluar specs
  00–15 y cualquier productor añadido después, sin permitir cerrar el manifest omitiendo una familia.
- [ ] Entregar a spec 14 la matriz candidata por familia: `report.academic` para académico/asistencia/evaluación/
  progreso/carga; `report.sales` admisiones; `report.finance` finanzas; `report.usage` uso/límites;
  `report.audit` auditoría/seguridad; y `report.export` adicional. Separar view/request/download/schedule/delivery/
  cancel/retry, field projection, filters, impersonation y service jobs; las capabilities nuevas requieren aprobación HD-39.
- [ ] Entregar un schema allowlisted de filtros/ordenamientos/agrupaciones con tipos, operadores, límites, defaults,
  normalización, sensibilidad y oráculos contra inferencia por campos ocultos.
- [ ] Entregar contratos de DAL/RLS tenant, no mixed-currency, agregados deterministas/versionados, snapshot/watermark
  común, timezone/`asOf`, freshness, linaje y reconciliación.
- [ ] Entregar contrato transaccional mutación+AuditEvent+outbox y job async con serialización canónica, payload hash,
  `UNIQUE(institutionId,idempotencyKey)`, claim atómico, lease/heartbeat, retry acotado y máquina de estados terminal.
- [ ] Entregar artefactos privados con checksum, disponibilidad/descarga ordinaria terminada exactamente a 30 días
  incluso bajo legal hold, progreso, cancelación/retry y reautorización por download/delivery. Hold solo pausa purge;
  retrieval legal, si se aprueba, usa path/capability/doble aprobación/TTL/audit separados.
- [ ] Entregar matriz `operación × resultado × AuditEvent` con actor real/efectivo, impersonación, Institution,
  reporte/versión, snapshot, parámetros redactados, destino, resultado y correlation ID.
- [ ] Entregar formatos CSV/PDF accesible, saved views y negativas de URL/ID/user/role/cross-tenant, filtros
  ocultos, revocación posterior, plan limit y artefacto expirado/cancelado.
- [ ] Entregar a `HD-41` un contrato CANDIDATE de schedules con unicidad
  `(scheduleId,scheduleVersion,occurrenceAtUtc)`, timezone/regla civil versionados, opciones explícitas para DST gap/fold,
  missed-run/downtime/catch-up, overlap/concurrencia, retry de la misma ocurrencia, edit cutover por `effectiveAtUtc`,
  cancelación, recipient snapshot+reautorización y delivery idempotency por destinatario/canal/artefacto. Spec 14 debe
  escoger las opciones antes de READY; este handoff no las aprueba.
- [ ] Abrir claim separado para spec 14 y exigir sus cinco responsabilidades de revisión y transición READY antes de
  cualquier implementación.
- [ ] Mantener fuera de este claim todo código, query, report, export, job, artifact, vista o schedule.

**Owner futuro:** owner de spec 14 más revisor independiente, nunca el writer de un productor sin separación de funciones.
**Salida:** handoff `REP14`, dependency manifest cerrado y evidencia de productores `DONE`.
**Stop:** productor no `DONE`, campo sin linaje/sensibilidad, moneda/snapshot ambiguos, policy path incompleto, revisión no
independiente o intento de implementar antes del READY propio de spec 14.
