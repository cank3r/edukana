# 00 · Límite institucional confiable y autorización de petición — Tareas futuras

**Estado:** DRAFT-CANDIDATE
**Base de esta propuesta:** `21b6b71ab166d7bfbad23d9c43a829f7afc17354`
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
| T00 coordinación/candidato | Asignación documental; G0 pendiente hasta mecanismo autoritativo | T01 | Solo tres specs y fila propia |
| T01 inventario read-only | T00 + autorización exacta del origen | T02 | Ninguna mutación del origen |
| T02 decisiones humanas | T01 | T03 | Solo decision log/documentos |
| T03 revisión y transición | T02 + G0 satisfecho | G-READY | Solo documentos y review evidence |
| G-READY | Cero HD abierto + cinco aprobaciones + autoridad HD-24 | T04–T09 | Transición documental separada |
| T04 harness/evidence | G-READY | T05–T11 | Solo en claim de implementación |
| T05 host/sesión/contexto | G-READY + T04 + HD-01/02/04/26 | T06/T07/T09 | Código futuro autorizado |
| T06 authz/navigation/atomicity | T05 + T04 | T07/T11 | Código futuro autorizado |
| T07 DAL/auth/Storage | T05 + T06 | T09/T11 | Código futuro autorizado |
| T08 DB expand/backfill | G-READY + T01 + T04 + HD-05..15 | T09 | Schema/migration futura autorizada |
| T09 roles DB/RLS | T05–T08 + pooler proof | T10/T11 | DDL futura autorizada |
| T10 contract | T09 + stable window + restore | T11 | Irreversible approval separada |
| T11 acceptance/release evidence | T04–T10 + operations gates | T12 | Solo entorno HD-22 autorizado |
| T12 handoff S3 | T11 + spec 00 implementada/aceptada | Spec S3 | Documentación separada |

```text
T00 → T01 → T02 → T03 → G-READY
G-READY → T04 → T05 → T06 → T07
G-READY + T01 + T04 → T08
T05 + T06 + T07 + T08 → T09 → T10
T04..T10 → T11 → T12
```

G-READY no existe en este candidato y no puede inferirse de un PR DRAFT, review parcial o test verde.

## T00 · Cerrar gobierno del candidato

- [ ] Confirmar que el worktree, branch y base coinciden con el claim y no son checkout principal/protected/PR existente.
- [ ] Marcar G0 pendiente mientras el claim no sea visible en `origin/todo/tanda-4` o excepción autoritativa trazable.
- [ ] Obtener la publicación/exception de coordinación sin empujar esta rama a una rama protegida.
- [ ] Revalidar que no existe claim competidor inmediatamente antes de cada revisión con escritura.
- [ ] Mantener exactamente `requirements.md`, `design.md`, `tasks.md` y la fila propia como límite.
- [ ] Mantener DRAFT-CANDIDATE y registrar hechos, inferencias, candidates y decisiones por separado.
- [ ] Reconciliar specs DRAFT 01/02/03/15 por cláusula, sin editarlas desde este claim.

**Owner futuro:** writer/coordinador documental.
**Salida:** candidato, diff, trazabilidad de reviews y evidencia de coordinación.
**Stop:** claim competidor, base movida, G0 representado falsamente como satisfecho o archivo fuera de alcance.

## T01 · Inventario read-only pre-READY

- [ ] Obtener autorización del origen exacto; confirmar que la credencial no puede escribir.
- [ ] Registrar SHA, migration history y fingerprint del entorno sin exponer secretos.
- [ ] Inventariar roles PostgreSQL, ownership, memberships, grants, inheritance, `rolbypassrls` y policies.
- [ ] Confirmar tipo/configuración del pooler y conexión app/migrator por metadata no secreta.
- [ ] Ejecutar prueba read-only de viabilidad transaction-local en un entorno aislado autorizado, sin DDL ni datos reales.
- [ ] Obtener conteos agregados de rows, nulls, orphans y cross-institution tuples.
- [ ] Obtener table/index sizes y `EXPLAIN` seguro de consultas tenant-first representativas.
- [ ] Enumerar predecesores poblados, backup IDs/age, Storage inventory y límites operativos disponibles.
- [ ] Redactar PII, credentials, tokens, cookies, password hashes y signed URLs.
- [ ] Conservar commands/queries reproducibles y prueba de cero mutaciones.

**Owner futuro:** data/security reviewer con acceso read-only autorizado.
**Salida:** environment evidence manifest, aggregate results y gaps por `HD-09/10/13/14/21/22/26`.
**Stop:** destino ambiguo, privilegio de escritura, dato personal en output, policy fuera de scope o mutación detectada.

## T02 · Resolver decisiones humanas

- [ ] Asignar owner humano y fecha objetivo a `HD-01..HD-26`.
- [ ] Para cada HD, registrar opciones, valor elegido, evidencia, rationale, approver/date, compatibility y rollback.
- [ ] Elegir un solo modelo Membership/role y un solo modelo scope con FKs enforceable.
- [ ] Cerrar global allowlist, composite-FK exceptions, email uniqueness, proxy topology y host behavior.
- [ ] Cerrar roles/grants/pooler/FORCE RLS y paths de platform/job/export/repair/impersonation.
- [ ] Cerrar predecessor matrix, budgets, dual window, cutover y safe rollback/forward-fix classification.
- [ ] Cerrar suspended/cancelled read/export matrix separada de archive y retention.
- [ ] Cerrar SLI thresholds, restore RPO/RTO, acceptance environment, AT matrix y transition authorities.
- [ ] Regenerar requisitos, modelo, matrices, tasks y oracles para eliminar ramas condicionales incompatibles.

**Owner futuro:** autoridades de dominio y `HD-24`, no el writer por inferencia.
**Salida:** decision log cerrado y candidato internamente único.
**Stop:** HD abierta, approver/date ausente, opción no implementable, steering conflict o riesgo aceptado sin owner/expiry.

## T03 · Revisar contrato resuelto y crear G-READY

- [ ] Obtener revisión independiente de arquitectura sobre las decisiones ya cerradas.
- [ ] Obtener revisión independiente de seguridad/privacidad, incluida auth, Storage, counseling y audit.
- [ ] Obtener revisión independiente de datos/migration, manifests, rollback y restore.
- [ ] Obtener revisión independiente de producto/simplicity/accessibility y cuatro journeys.
- [ ] Obtener revisión independiente de testability/release evidence y exact oracles.
- [ ] Resolver todo P0/P1 en un nuevo claim documental y rerun de las cinco revisiones afectadas.
- [ ] Verificar G0, acyclic DAG, clause reconciliation y exact title/status en los tres documentos.
- [ ] Crear una transición separada a READY solo con autoridad `HD-24`; no incluir implementación.

**Owner futuro:** autoridad `HD-24`; reviewers distintos del writer.
**Salida:** cinco verdicts trazables y commit de transición documental separado.
**Stop:** G0 pendiente, HD abierta, reviewer no independiente, P0/P1, aprobación sobre versión anterior o identidad/fecha ausente.

## G-READY · Puerta explícita

Condiciones simultáneas:

- G0 visible por mecanismo autoritativo o excepción trazable.
- `HD-01..HD-26` cerradas con evidencia/owner/date.
- Requisitos, diseño, tasks, fixtures y oracles describen una sola opción.
- Reviews architecture/security/migration/product-UX/testability aprueban el mismo commit.
- Autoridad `HD-24` firma transición DRAFT-CANDIDATE→READY en cambio separado.

Hasta entonces, T04–T12 están bloqueadas.

## T04 · Harness y evidencia reproducible

- [ ] Crear machine-readable fixture manifest por predecesor con fixed IDs, UTC clock, timezone/locale y random seed.
- [ ] Definir exact rows/states/roles/scopes/relationships/anomalies y file bytes/SHA-256.
- [ ] Crear namespace por run y teardown que pruebe cero residual rows/objects.
- [ ] Separar unit, HTTP integration, DB-policy y E2E exact-SHA.
- [ ] Prohibir mocks de authz/DAL/session en integration y owner role en app-policy tests.
- [ ] Mapear cada requirement/policy/surface a test IDs, command, versions, owner y artifact.
- [ ] Crear per-surface denial oracle con status/result, cookies/redirect, audit y side-effect deltas.
- [ ] Crear release-evidence manifest con checks, terminal status, skips/retries/flaky y vulnerability policy.
- [ ] Fijar artifact hashes, provenance, retention y redaction scan.

**Owner futuro:** test/evidence writer, sin product scope adicional.
**Salida:** fixture, traceability, policy-operation y release manifests.
**Stop:** nondeterminism, hidden manual fixture, mock de boundary, owner DB, skip no aprobado o artifact sin SHA/hash.

## T05 · Host, sesión y request context

- [ ] Implementar `HostAuthority` triestado sin `null` ambiguo.
- [ ] Implementar adapter exacto de proxy/header/hop `HD-26`; contradiction produce UNKNOWN.
- [ ] Implementar resolver preauth mínimo con rol/function/grants/search_path revisados.
- [ ] Invalidar cache de dominio al revocar y probar TTL positive/negative.
- [ ] Devolver 404 UNKNOWN antes de branding/login/session/tenant lookup.
- [ ] Deshabilitar signup por config ausente/inválida.
- [ ] Implementar `getRequestContext()` per-request, sin global transaction client.
- [ ] Unificar live revalidation para `/api/auth/session`, pages, actions y APIs.
- [ ] Implementar cookie y one-use hashed transition ticket según decisión.
- [ ] Probar replay, theft, concurrent redemption, CSRF, open redirect y session fixation.

**Owner futuro:** auth/context writer único.
**Salida:** ADR ratificado, host/session matrix y HTTP/DB evidence.
**Stop:** client slug fallback, general platform client, untrusted header, cache cross-request, password field/log o revocation fuera de SLA.

## T06 · Autorización, navegación y mutaciones atómicas

- [ ] Implementar orden Institution→module/plan→capability→scope→relationship→state→operation.
- [ ] Consolidar closed capability catalog sin cambiar semantics por inferencia.
- [ ] Registrar layouts/pages/navigation/tabs/breadcrumbs/search/prefetch/actions/APIs/DAL/jobs/platform.
- [ ] Denegar build/runtime para surface ausente y devolver concealment 404.
- [ ] Revalidar versions/status/relationship dentro de transaction para cada sensitive write.
- [ ] Elegir lock/serializable/optimistic strategy; concurrent revoke produce zero mutation/outbox.
- [ ] Aplicar guardian own-profile/general-announcement exception y child relationship rules.
- [ ] Aplicar finance/academic separation, peer privacy, last OWNER y no self-role/self-grade.
- [ ] Aplicar counseling-only y audited break-glass separado de ordinary impersonation.
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
- [ ] Agregar modelo Membership/roles/scopes aprobado, candidate keys y physical tenant columns.
- [ ] Agregar tenant-first query/relationship indexes y document global/preauth exceptions con plans.
- [ ] Agregar composite FKs y staged constraints; revisar cascades por `HD-16`.
- [ ] Versionar per-table backfill manifest, incluidos CourseModule, Enrollment, Assignment, Submission, ExamQuestion,
  ExamAnswer y OrganizationalUnitMembership.
- [ ] Cargar por stable PK/checkpoint/idempotency key y quarantine typed anomalies.
- [ ] Calcular canonical SHA-256 y exact expected row/anomaly counts.
- [ ] Forzar interruption en checkpoint, rerun y probar no duplicate/gap.
- [ ] Activar atomic dual-write; definir authoritative side por compatibility phase.
- [ ] Medir shadow divergence, stop threshold y exact cutover event.

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

- [ ] Ejecutar cuatro bounded journeys de requirements §8 con positive/negative states.
- [ ] Probar loading/empty/retry/404/read-only/archive/conflict/offline/success/revoked/suspended/cancelled.
- [ ] Confirmar guardian no-link profile/announcements y linked-child area matrix.
- [ ] Confirmar navigation/tabs/search/prefetch no disclose unauthorized data/counts.
- [ ] Verificar WCAG 2.2 AA: semantics, names/errors, keyboard/focus, live regions, contrast/non-color, text spacing,
  320/360 CSS px, 200 % y `HD-23` browser/OS/AT.
- [ ] Ejecutar Storage matrix, URL residual y credential-bundle scan.
- [ ] Ejecutar populated migration/rollback, DB policy manifest y concurrent revocation.
- [ ] Ejecutar alert injection con SLI semantics/thresholds `HD-20`.
- [ ] Ejecutar restore drill y verificar RPO/RTO `HD-21`, source unchanged y cleanup.
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
