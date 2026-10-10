# Edukana — Coordinación de equipo

**Lectura obligatoria antes de cualquier trabajo.** Este archivo coordina a Kiro, Claude, Codex y cualquier otro agente que escriba en el repositorio.

## Fuentes de verdad

Leer en este orden:

1. `TEAM-COORDINATION.md` — trabajo activo, alcance y bloqueos.
2. `.kiro/steering/current-state.md` — código real y decisiones vigentes.
3. `.kiro/steering/simplicity.md` — contrato de experiencia.
4. `.kiro/PLAN.md` — sprints, dependencias y estado.
5. Spec READY del trabajo asignado.
6. Código y migraciones reales.

Una spec DRAFT o una conversación externa no puede contradecir estas fuentes sin registrar primero una decisión.

## Responsabilidades

Desde el 2026-10-08 el trabajo se reparte por **módulos completos**, no por capas. Cada agente construye su módulo de punta a punta —base de datos, lógica, pantallas y pruebas— y nadie espera a otro para avanzar.

**Meta única del tramo:** *un instituto da un curso completo*. Nada fuera de esa meta entra hasta que Carlos la recorra en el navegador.

| Módulo | Dueño | Qué entrega, de punta a punta | Carpetas propias |
|---|---|---|---|
| **M1 · Personas y arranque** | Claude | Inicio del administrador con primeros pasos; períodos; personas (crear, editar, importar, invitar, suspender); recuperar contraseña; elegir institución; datos de la institución; avisos (crear, editar, borrar) | `src/app/dashboard/gestion/**`, `src/app/dashboard/configuracion/**`, `src/app/dashboard/comunidad/**`, `src/app/dashboard/page.tsx`, `src/app/{login,recuperar,restablecer,elegir-institucion,setup}/**`, `src/server/{people,platform,imports,security,integrations}/**`, `src/server/{identity,login,session,password-reset}.ts`, `src/lib/auth.ts`, `src/proxy.ts` |
| **M2 · Curso y contenido** | Kiro | Crear, editar y archivar cursos; secciones, lecciones y archivos; matricular y retirar; horario; asistencia; lo que ve el estudiante al entrar a su curso | `src/app/dashboard/aula/**` (salvo evaluación), `src/app/dashboard/portal/**`, `src/app/dashboard/calendario/**`, `src/app/dashboard/hijos/**`, `src/server/courses/**` |
| **M3 · Evaluación** | Codex | Tareas y entregas; exámenes con tiempo; calificaciones y su corrección con motivo; lo que ve el estudiante de sus notas | `src/app/dashboard/evaluacion/**` (nueva), `src/server/{exams,grade-history}.ts`, `src/server/actions/exams.ts`, `src/server/assessment/**` |

Carlos decide, prueba como usuario y autoriza cada fusión. Fuera de la meta y sin dueño por ahora: admisiones, cobros, reportes, certificados.

### Qué significa "terminado"

Un módulo está terminado cuando **Carlos lo recorre en el Preview y dice que se entiende**. Que pasen las pruebas es condición necesaria, no suficiente. Además:

- Todo lo que se puede crear se puede **editar y borrar o archivar**, con confirmación que muestra el impacto.
- Cada pantalla cumple `.kiro/steering/simplicity.md`: una acción principal, sin términos internos, usable a 360 px.
- Cada pantalla vacía explica qué es y ofrece el botón para empezar.

### Archivos compartidos

Tres lugares generan choques. Regla para todos: **solo agregar líneas propias; nunca modificar ni reordenar las de otro**.

| Archivo | Regla |
|---|---|
| `prisma/schema.prisma` y `prisma/migrations/**` | Cada módulo agrega sus modelos en un bloque propio al final, marcado `// --- M1 ---`, `// --- M2 ---` o `// --- M3 ---`, y su propia migración con fecha y hora. Solo cambios aditivos. Para tocar un modelo de otro módulo (por ejemplo una columna en `Enrollment`), se pide en el PR del dueño. Antes de crear una migración: `git pull` de la rama base, y fusionar pronto para no acumular. |
| `src/lib/ux.ts` (menú y textos) y `src/components/dashboard/Sidebar.tsx` | Agregar la entrada propia; no cambiar las demás. |
| `src/app/dashboard/academico/actions.ts` | Archivo heredado que mezcla curso y evaluación. M2 y M3 **no lo editan**: cada uno mueve sus acciones a `src/server/courses/**` o `src/server/assessment/**` y deja de importarlo. Se borra cuando quede vacío. |
| `TEAM-COORDINATION.md` | Cada agente edita solo su fila. |

## Flujo por tarea

1. Cada agente trabaja en su rama `m1/…`, `m2/…` o `m3/…`, creada desde `integration/curso-completo`.
2. Abre PR hacia `integration/curso-completo` en trozos pequeños: una pantalla o un recorrido por PR, no el módulo entero.
3. CI en verde y Preview funcionando son requisito para pedir la prueba de Carlos.
4. Carlos recorre el Preview. Si se entiende, autoriza la fusión; si no, dice qué no entendió y se corrige.
5. Nadie fusiona a `master` ni despliega a producción sin autorización explícita de Carlos.

Un agente solo se detiene si de verdad no puede avanzar; en ese caso escribe el bloqueo en su fila y sigue con otra parte de su módulo.

## Protocolo antes de editar

1. Actualizar la rama local y leer este archivo desde la rama de coordinación vigente.
2. Buscar un claim que toque los mismos modelos, migraciones, contratos o archivos.
3. Si existe solape, no editar: comentar en el PR/issue del claim y esperar un handoff explícito del propietario o coordinador. El estado `REVIEW` no libera el alcance.
4. Si no existe, proponer una fila con ID, agente, rama, alcance exacto, estado y siguiente paso; publicarla en la rama coordinadora y confirmar en remoto que no apareció un claim competidor antes de escribir.
5. Si dos claims compiten, prevalece el primero publicado en la rama coordinadora; el segundo espera decisión del coordinador.
6. Trabajar únicamente dentro del alcance reclamado.
7. Actualizar la fila al encontrar un bloqueo, cambiar contrato o terminar.
8. Antes de handoff, incluir SHA base, archivos, migraciones, pruebas reales, pendientes y próximo escritor confirmado.

## Estados

- `PLANNED`: definido, nadie escribe.
- `CLAIMED`: reservado por un agente.
- `IMPLEMENTING`: escritura activa.
- `REVIEW`: código terminado, esperando revisión.
- `BLOCKED`: necesita decisión o acceso externo.
- `DONE`: fusionado y verificado.
- `ABANDONED`: liberado sin integrar.

## Claims activos

Los claims siguen la convención canónica de `.kiro/steering/spec-governance.md`.

| ID | Agente | Rama | Estado | Alcance exclusivo | Última actualización | Siguiente paso / bloqueo |
|---|---|---|---|---|---|---|
| DEMO-GUARD | Codex | `fix/demo-isolated-target-guard` | CLAIMED | `scripts/demo/seed-demo.ts`, nuevo guard puro de destino, regresiones DB-free y `docs/demo.md`; sin schema, backfill, DB externa ni infraestructura. | 2026-10-10 14:09 UTC | Base ead0cb6. Usuario autoriza demo aislada y protección contra producción. Primera fase solo guard fail-closed y pruebas; destino de demo móvil pendiente. Publicar PR draft, no fusionar. |
| BO-A | Codex A | `bo/a-tablero` | CLAIMED | Issue #101 A: `src/server/platform/metrics.ts`, `src/app/operador/tablero/**`, tests y fragmento smoke propios. Consultas agregadas y tabla de atención; sin migración. | 2026-10-09 | Base común segura 6c4c45a (PR #99) sobre `todo/tanda-4` 8720149; PR hacia `todo/tanda-4`. Conectar status B y suscripción C al integrar. Integrador ensambla menú/migas y smoke. |
| BO-B | Codex B | `bo/b-suspension` | REVIEW | Issue #101 B: suspensión institucional en platform/suspension.ts, login/session/auth, ajuste mínimo identity.ts y login UI; SuspensionSection, schema B y migración 20261010100000_backoffice_suspension, pruebas y fragmento smoke. | 2026-10-09 | 23:35 UTC: base b0fd0e7 segura; 137 base + 13 propios PASS, Prisma validate/generate, tipos, lint completo, build y audit producción 0 PASS. 14 PostgreSQL pendientes de CI. Estado leído por petición, sin invalidar otras membresías. LOGIN_SUCCEEDED para A sin PII. Integrador próximo escritor de ficha/listado/smoke; D conecta catálogo/compra. Sin DB externa ni merge. |
| BO-C | Codex C | `bo/c-planes` | REVIEW | Issue #101 C: servicios platform plans/subscriptions/invoices/limits; rutas `operador/planes`, `operador/facturacion`, `api/cron/plataforma`; BillingSection/PlanLimitBanner; hooks de alta `platform/institutions.ts` y `platform/independent.ts`; tests propios. Modelos PlatformPlan/InstitutionSubscription/PlatformInvoice y migración `20261010110000_backoffice_planes`. | 2026-10-09 | Implementación C sobre b0fd0e7; schema ensamblado por integrador. Plan enum sincronizado, TRIAL 30 días por ambas altas, cron protegido, pago manual y límites informativos. Tipos, lint focal, Prisma validate/generate, 4/4 DB-free y diff-check PASS. 12 PostgreSQL pendientes CI; no DB staging/prod. Integrador siguiente escritor ficha/dashboard/seed/migas/smoke; docs/fragments/backoffice-planes.md. |
| BO-D | Codex D | `bo/d-interruptores` | REVIEW | Issue #101 D: `src/server/platform/features.ts`, funciones/commission/independientes y ventas; FeatureSection; `src/server/ai/**`, configuración IA, `src/app/catalogo/**` y compra; tests propios. Settings `platform.aiLocked/catalogEnabled/commissionPercent`; no migración. | 2026-10-09 | Cesión M1 limitada a ajustes IA de #101. Único escritor catálogo/IA; conectar suspensión B y defaults PlatformPlan C después del handoff. Integrador ensambla listado/ficha/ux. Alta independiente global sigue variable de entorno. |
| BO-E | Codex E | `bo/e-soporte` | REVIEW | Issue #101 E: soporte read-only y bitácora, `src/server/platform/support.ts`, `src/app/operador/[institutionId]/vista/**`, `src/app/operador/bitacora/**`, componentes y tests propios. Sin migración prevista. | 2026-10-09 | 23:35 UTC: vista aislada y bitácora completas, 15/15 DB-free, tipos, lint y build nativo Turbopack PASS; 5 PostgreSQL pendientes CI. Sin tocar M1. SupportSection + fragmento smoke + docs/backoffice-fragments/e-soporte.md para integrador. Sin auth/capabilities/migraciones. PR draft en preparación. |
| BO-F | Codex F | `bo/f-avisos` | REVIEW | Issue #101 F: `src/server/platform/announcements.ts`, `src/app/operador/avisos/**`, PlatformAnnouncementBanner y tests propios. Modelo PlatformAnnouncement y migración `20261010120000_backoffice_avisos`. | 2026-10-09 | Implementación F lista: modelo aplicado por integrador, migración aditiva, tres páginas, servicios/auditoría, franja por identidad. 5 unitarias PASS; tipos/lint/Prisma PASS; 4 pruebas PG y fragmento smoke entregados, ejecución CI pendiente. Integrador próximo escritor dashboard/migas/smoke; docs/backoffice-announcements.md contiene ensamblaje. No Supabase ni avisos M1. |
| M1 | Claude | `m1/*` desde `integration/curso-completo` | IMPLEMENTING | Módulo M1 (ver Responsabilidades) | 2026-10-08 | Primero: editar y borrar avisos; inicio del administrador con primeros pasos. Ya incluido en la rama base: sesión viva, login con límite de intentos, recuperación, identidad global, importación CSV, invitaciones, suspender/reactivar y sus pantallas. |
| M2 | Kiro | `m2/*` desde `integration/curso-completo` | PLANNED | Módulo M2 (ver Responsabilidades) | 2026-10-08 | Empezar por editar y archivar curso, sección y lección. |
| M3 | Codex (traspaso limitado M2/legacy autorizado por Carlos el 2026-10-09) | `m3/legacy-assignment-portal` #74 d523a7e0 → #73; `m3/legacy-timed-exam` #75 d724d308 → #72; `m3/legacy-exam-review` #76 526b54f5 → #71. Drafts previos #67–#73 sin fusionar. | REVIEW | Integración propuesta `m3/integrate-reviewed-evaluation` sobre `todo/curso-completo` fde25e43: traspaso publisher autorizado 21:50 UTC: también SOLO paso capturas y su enlace en `.github/workflows/ci.yml`, conservando resto CI y sin adoptar PR89 ni `publicar-registros.sh`; por ahora `src/server/exams.ts`, `tests/exam-submit-enrollment.test.ts` y `tests/integration/exam-submit-enrollment.test.ts` para revalidar matrícula al entregar, sin cambiar contratos. Resto detenido por solapes PR80/83/85/87 y pendiente handoff. Solo evaluación en curso/portal M2, formularios y acciones académicas heredadas; adaptadores/lectores y pruebas M3 relacionados. Sin otras funciones M2, esquema, migraciones, configuración compartida ni política de nota oficial. Solo esta fila. | 2026-10-09 | 23:03 UTC: Carlos autoriza nueva rama `m3/tanda4-enrollment-ci-artifacts` sobre `todo/tanda-4` 872014902632090ab4f3cb6c3a8edffaa3d72ed0: portar el guard y ambos tests de PR94 y sustituir AMBOS publishers de capturas y registros por artifacts conservando logs, resúmenes y estado de fallo. Cesión limitada a `src/server/exams.ts`, sus dos tests, `.github/workflows/ci.yml`, `.github/workflows/publicar-registros.sh` y esta fila M3. Sin otros contratos o regiones PR95/96, esquema, migraciones, merge ni producción. Único escritor Codex. 23:05 UTC: revisión independiente estática PASS del port y publishers; Node22: 5/5 focales, 137/137 suite base mediante node --import tsx (CLI npm test bloqueado localmente por EPERM de socket), lint completo, tipos, Prisma validate y build PASS. YAML/bash, comparación de pasos originales, fixtures presentes/ausentes y las nueve ramas de fallo del gate PASS. PostgreSQL y artifacts reales pendientes de CI para el nuevo SHA; no DB local/staging. Claim se publica junto al commit CI seguro en la nueva rama para no ejecutar el workflow heredado de la coordinadora. Historial: 22:10 UTC: PR94 draft publicado, HEAD3739b361a6f232a903e84ebbcbb7c579efb0a66a sobre base fde25e43; cuatro archivos (exams.ts, dos tests, publisher CI capturas). Actions37996095529 SUCCESS:121/121 unitarias base +280/280 integración,9PG nuevas PASS incluida carrera,smoke6/6; tipos/lint/build y Vercel PASS. Artifact11646689631 ZIP real verificado,260 archivos allowlisted sin .env/seed.json,7.427.687 bytes,expira23oct; digest coincide.5unit focales locales fuera de npm test. Sin cambios de esquema/migraciones; no DB local/staging,merge ni despliegue manual. Próximo paso: Carlos acepta Preview360px/teclado y decide integración/cesiones; siguiente escritor de regiones solapadas aún no confirmado. Al integrar PR89 conservar sus logs/resúmenes y este publisher seguro. Historial previo (los bloqueos CI/publicación siguientes están resueltos para PR94): 21:50 UTC: Carlos confirma cesión específica CI capturas→artefactos ante claim S0-GOV y PR89. Preparar cuatro archivos sobre fde25e43, revisión independiente antes de publicar. Revalidado21:49: guard5/5, tipos/lint/diff PASS;9PG pendientes. 18:55 UTC: guard matrícula local portable terminado y revisado independientemente: 5/5 DB-free, tipos, lint y diff-check PASS; 9 PG redactadas, incluida carrera con pg_blocking_pids, no ejecutadas; runner necesita al menos 3 conexiones. Patch aplica sobre base/tanda-3, sin publicar. Integración y UX detenidas por cesión de regiones80/83/85/87 y publisher CI. 18:46 UTC: recuperado worktree limpio; base/tanda-3 2dc69a1c ya integra los diez commits, no duplicar. Publicación bloqueada por publisher CI; no push de código hasta autorización. Tres cortes revisados independientemente y publicados draft. Legacy tareas delega a M3 y portal protege publicación/GradeEntry/exoneración; submitExam antiguo falla cerrado y dirige al temporizador; revisión docente exige motivo, snapshot completo e IDs manuales propios antes de delegar. Node22: A 146, B 126, C 125 pruebas DB-free PASS; tipos/lint/build PASS. CI desechable: #74 job136 SUCCESS 172/172; #76 job142 SUCCESS 147/147; #75 reintento job200 SUCCESS 146/146 sobre el mismo d724d308, incluido diff-check; sustituye el fallo de red de job132. Verificados #67–#76 a las 18:12 UTC: diez drafts abiertos sin merge, heads esperados y CircleCI/Vercel success. Totales incluyen 22/14/12 casos nuevos DB-free separados de 13/4/5 PostgreSQL reales; los 22 PostgreSQL nuevos verificados por nombre, nunca local/staging. Validación temporal combinada y revisión independiente PASS: 204/204 DB-free, tipos/lint/build; reconciliar imports y partes estudiante/docente del bloque examen, conservar grade-history de A. No staging, merge ni despliegue manual. Preview móvil/teclado pendiente. Persisten I1 máximo/representación docente, I2 historia exoneración, token de formulario antiguo, retención de intentos y decisión de nota oficial. |
| S0-GOV | Kiro | `fix/role-access-hardening` | BLOCKED | `TEAM-COORDINATION.md`, `AGENTS.md`, `.kiro/PLAN.md`, `.kiro/steering/{current-state,simplicity,tech,data-model,product,spec-governance,structure}.md`, documentación S0, CI PostgreSQL y runner E2E | 2026-10-08 | Revisión independiente final `PASS`: preflight exacto/read-only antes de escrituras, curso por ID y pickers por código. Puerta local: 93/93, auth 11/11, tipos, lint, build 23/23, audit 0, migraciones 6/6. No crear otro Supabase ni iniciar S1. Bloqueos únicos: autorización de commit/push y login/bypass de Preview para el recorrido desplegado. |
| S0-AUTH-DIAG | Kiro | `fix/role-access-hardening` | REVIEW | Diagnóstico seguro de credenciales en `src/lib/auth.ts` y prueba contractual en `tests/security.test.ts`; sin esquema, migraciones ni secretos | 2026-10-09 | Diagnóstico listo: cuatro causas explícitas, SHA/tenant/rol/updatedAt sin PII. Puerta: 94/94, auth 12/12, tipos, lint, build 23/23 y audit 0. Publicar en ambas ramas feature, ejecutar un solo login y leer `[auth][credentials-rejected]` en Vercel. |

Historial: los claims S1-SEC-A, S2-ID-A, S2-UI-A (Claude) quedaron integrados en `integration/curso-completo`; sus PR #6, #7 y #8 se cierran a favor de esa rama. S3-PROP (PR #9) queda en espera hasta cumplir la meta del tramo.

**Requisito operativo:** `integration/curso-completo` necesita tres migraciones aplicadas en el Supabase de staging (`s1_security`, `s1_grade_autograded`, `s2_identity`). Sin ellas el inicio de sesión de sus Preview falla.

## Coordinación del backoffice #101

Carlos asignó explícitamente el issue #101 completo a Codex, seis ramas/PR y una integración final para revisión. Esta decisión cede solo los alcances BO-A a BO-F anteriores; las filas ajenas y sus responsabilidades no relacionadas permanecen intactas. No se encontró otro claim BO ni rama bo activa al preflight del 2026-10-09 23:24 UTC. #96 continúa abierto: base/destino vigente `todo/tanda-4` 872014902632090ab4f3cb6c3a8edffaa3d72ed0. La base común añade únicamente la dependencia segura PR #99, commit 6c4c45a866dd7c6bf57ecfdb6cd1458434fa5b70, para no heredar publishers destructivos.

La coordinadora de este trabajo es `todo/backoffice`. El integrador es el único escritor de ensamblajes compartidos: `prisma/schema.prisma` (parches B, C y F serializados), `src/app/operador/{layout,page}.tsx`, `src/app/operador/[institutionId]/page.tsx`, `src/app/dashboard/layout.tsx`, `src/lib/ux.ts`, `package.json` scripts de pruebas, `.github/workflows/ci.yml` entorno operador, `tests/e2e/smoke/{seed.ts,recorrido.smoke.ts}`, y `docs/backoffice.md`. Cada pieza entrega componentes, pruebas y fragmentos de smoke propios; no sobrescribe estas regiones simultáneamente. Las migraciones están reservadas por pieza; no se ejecutarán en Supabase/staging/producción. Todo cambio operador registra PLATFORM_* y changes.operator sin secretos. Los seis PR apuntan a la base vigente y la integración final abre un PR de revisión, sin merge a main/master ni a la base. Evidencia CI/capturas se conserva en artifacts seguros; no se restablecen publishers force-push a ci-registros/qa-capturas.

### Handoff local del integrador — 2026-10-09 23:54 UTC

`recover_backoffice_integration` retoma el ensamblaje local de `todo/backoffice`. Publicaciones nuevas pausadas hasta aclarar las cancelaciones del usuario. `finish_backoffice_features` es único escritor BO-D; `assemble_backoffice_smoke` recibe exclusivamente seed.ts, shared.ts, recorrido.smoke.ts y sus fragmentos nuevos. El integrador conserva schema, UI compartida, menú, scripts, documentación y esta coordinación. `review_backoffice_security` recibió después escritura exclusiva local de invoices.ts, plans.ts, announcements.ts y regresiones propias para corregir los defectos confirmados de vigencia/auditoría. El integrador recibe de vuelta los fragmentos smoke y ajusta playwright.smoke.config.ts a 360 px para cumplir simplicidad. Validación local a 23:58 UTC: 137/137 base, 54/54 backoffice, Prisma generate, TypeScript, ESLint y build nativo Turbopack PASS. Smoke discovery: 18 casos; runtime PostgreSQL/browser y CI integrado pendientes. Documentación docs/backoffice.md y tres migraciones reservadas completas. Ninguna migración externa ni publicación durante esta recuperación.

## Claims reservados siguientes

| ID | Estado | Alcance | Dependencia |
|---|---|---|---|
| S1-SEC | DONE (servidor) | Sesión viva, rate limit, recuperación, examen temporal, Postgres CI | S0-GOV DONE |
| S2-ID | DONE (servidor y pantallas de acceso) | Identidad global, Membership, invitaciones y CSV | S1-SEC DONE |
| S3-ACADEMIC | PLANNED | Course/Offering, programa, cohorte, grupo y matrícula masiva | S2-ID DONE |
| S4-HYBRID | PLANNED | ClassSession, Panel Hoy, MeetingProvider y notificaciones | S3-ACADEMIC DONE |
| S5-VIDEO | PLANNED | VideoProvider y streaming | S3-ACADEMIC DONE |

## Decisiones vigentes

- Conservar `Institution`/`institutionId`.
- Migrar a identidad global + `Membership` antes de importar 1,600 cuentas.
- Separar `Course` y `Offering` antes de datos reales.
- Modelar `ClassSession` para presencial, virtual, híbrida y asincrónica.
- `MeetingProvider` usa enlace externo primero; BigBlueButton se evalúa después.
- Video grabado migra a proveedor de streaming.
- Dinero en centavos enteros.
- Cobros del piloto sin pasarela.
- IA después del núcleo operativo, con revisión humana.
- Código nuevo adopta `src/server` gradualmente.
- Una capacidad termina con E2E desplegado.

## Contratos compartidos

Los siguientes recursos tienen un solo escritor a la vez:

- `prisma/schema.prisma` y cada migración.
- Autenticación/contexto/membresías.
- Catálogo de capabilities.
- `Course`, `Offering`, `Enrollment` y relaciones.
- Storage y providers.
- Steering, PLAN y este archivo.

Cambiar uno requiere claim explícito aunque el archivo concreto no esté listado.

## Handoff obligatorio

Al pasar trabajo a otro agente, añadir bajo su claim:

- Base SHA.
- Archivos modificados.
- Contratos o migraciones cambiadas.
- Comandos ejecutados y resultados.
- Pruebas no ejecutadas.
- Riesgos y decisiones pendientes.
- Próximo paso concreto.

## Comunicación en GitHub

- El documento conserva plan y claims durables.
- Cada trabajo vive en rama propia y PR.
- Las discusiones detalladas ocurren en el PR/issue asociado; la conclusión se copia aquí o en `.kiro/PLAN.md`.
- Nadie empuja directamente a `main`/`master`.
- Antes de empezar un nuevo claim, comprobar que este archivo no cambió en remoto.

## Registro

- 2026-10-08 — Se crea el protocolo durante S0 y se reclama la reconciliación de gobierno para Kiro.

### Corrección local BO-E — 2026-10-10 00:10 UTC

El integrador retoma exclusivamente support.ts y sus regresiones por fallo verificado en CI ef7c1fb1: upsert de revocación concurrente termina en P2002 audit_logs_pkey. Sustituir por inserción atómica con conflicto ignorado; preservar evidencia del primer evento. Publicaciones siguen pausadas, base no cambia. Pieza G y dominios fuera de implementación pendiente de confirmación.

## BO-G: marca blanca aprobada — 2026-10-10 00:17 UTC

Carlos aprobó añadir G a las seis piezas. Base local fija `6cba9ad`, rama `bo/g-marca-blanca`; no se adopta silenciosamente tanda-4 posterior. Alcance código/pruebas/documentación; no DNS, configuración Vercel, secretos, envío real de correo ni migraciones externas.

| Subalcance | Único escritor | Archivos/contratos |
|---|---|---|
| Host y aislamiento | G-host | server/platform/domains.ts, domain-policy.ts, lib/auth.ts, proxy.ts, server/actions/institutions.ts, operator-session.ts, server/actions/password-reset.ts (contexto host), guard público de certificados, pruebas host/auth propias |
| Marca y UI | G-ui | server/platform/white-label.ts, components/platform/BrandingSection*, operador ficha/nueva y server/actions/platform.ts (retorno institutionId para segundo paso), login páginas/layout, dashboard layout, catálogo layout, metadatos, footer, pruebas UI propias |
| Correos | G-mail | server/password-reset.ts, server/people/invitations.ts, server/notifications/**, server/integrations/email/**, helper branded-email.ts y pruebas correo propias |
| Integración/contratos | Integrador | schema (solo si necesario), TEAM, scripts CI/package, docs/marca-blanca.md, ensamblaje smoke y revisión final |

Contrato domains.ts: normalizeInstitutionDomain(value) valida host canónico sin esquema/ruta/puerto; resolveInstitutionHost(host) devuelve institución o null; getRequestInstitution() lee host del request en servidor; institutionBaseUrl(institution) construye URL canónica solo desde configuración/datos validados. Institución resuelta incluye id, slug, name, logoUrl, brandColor, domain y settings. Política whiteLabel sale de PlatformPlan.features con fallback settings.platform.hideEdukanaBrand. Revisar host desconocido, headers suplantados, caché obsoleta y sesión B bajo dominio A. Revisión independiente obligatoria antes de publicar G.

### Handoff BO-G ampliado

G-host incluye guard DAL catálogo/certificados y contexto host para recuperación; G-ui incluye operator-branding/actions/helpers metadata y segundo paso de alta. El integrador agrega smoke de color persistido en la ficha. Publicaciones reautorizadas por Carlos; A–F a cargo de publisher separado, G e integrado después de QA. La base técnica actual a79b5b7 fue inspeccionada: solo política Vercel y cambios sobre publishers antiguos. Integración 8e1580a conserva artifacts seguros y elimina publishers force-push; el permiso contents:write heredado se conserva para comentarios de CI, sin ampliarlo.

### Estado integrado A–G — 2026-10-10 00:30 UTC

G b417536 integrado localmente en 4837a211, baseactual 8e1580a. Revisión independiente PASS;137 base+98backoffice, tipos/lint/buildPASS;18smokediscovery. PG/browser/CIintegrado pendientes. Publicación del último lote de árbol (vercel.json heredado) requiere confirmación específica; ningún ref remoto actualizado. Continuar solo tras confirmación y comprobar lease del ref.

### Integración publicada y corrección de harness — 2026-10-10 00:38 UTC

El usuario confirmó conservar vercel.json heredado. Base A–F publicada en a540932; G PR #108 e integración final PR #109, SHA e9c9ca7. CI 38009779593 en curso; aún no aceptación visual ni runtime final. El integrador conserva la escritura de documentos y publicación con lease. G-host retoma exclusivamente tests/integration/catalog.test.ts y helper de contexto si hace falta: el catálogo ahora exige headers de request y el harness Node anterior no los proveía. Mantener intacto el guard de Host de producción. Revisor G valida esta corrección antes de publicar; no se toca schema ni migraciones.

### Correcciones de accesibilidad observadas en navegador — 2026-10-10 00:48 UTC

Validación real del SHA 563b1a: 137 base, 98 backoffice y 522 PostgreSQL PASS. Capturas y errores de navegador muestran nombres accesibles contaminados por opciones/ayudas/texto inicial. G-ui retoma exclusivamente BrandingForm.tsx, BillingSection.tsx y operador/avisos/AnnouncementForm.tsx para asociaciones explícitas label/htmlFor/id y aria-describedby. Smoke conserva selectores exactos y todas las verificaciones; ensamblador smoke retoma fragmento de suspensión para completar de nuevo los campos requeridos después del rechazo. Revisor independiente valida la corrección y las capturas finales; no se declara aceptación visual todavía.

Extensión coordinada del mismo hallazgo: G-ui también es único escritor de operador/[institutionId]/SuspensionForm.tsx. Los campos controlados conservarán motivo y confirmación ante rechazo; el éxito conserva el remount existente. Smoke sustituye el relleno compensatorio por una aserción de que el motivo permanece, verificando la corrección UX real.

### Último escenario de suspensión — 2026-10-10 01:00 UTC

CI 38010797140: validate PASS (137/101/522), navegador 16/18 con un único escenario repetido por viewport: aviso de credenciales de institución suspendida. Los cuatro problemas previos ya pasan. G-host diagnostica Auth.js sin editar todavía. G-ui es único escritor de dashboard/page.tsx y nueva regresión platform-dashboard-session: evitar dereferencia de sesión nula durante render paralelo con layout, conservando en layout la redirección y aviso. Ninguna relajación de autenticación ni aserciones.
