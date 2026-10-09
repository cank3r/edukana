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
| M1 | Claude | `m1/*` desde `integration/curso-completo` | IMPLEMENTING | Módulo M1 (ver Responsabilidades) | 2026-10-08 | Primero: editar y borrar avisos; inicio del administrador con primeros pasos. Ya incluido en la rama base: sesión viva, login con límite de intentos, recuperación, identidad global, importación CSV, invitaciones, suspender/reactivar y sus pantallas. |
| M2 | Kiro | `m2/*` desde `integration/curso-completo` | PLANNED | Módulo M2 (ver Responsabilidades) | 2026-10-08 | Empezar por editar y archivar curso, sección y lección. |
| M3 | Codex (traspaso limitado M2/legacy autorizado por Carlos el 2026-10-09) | `m3/legacy-assignment-portal` #74 d523a7e0 → #73; `m3/legacy-timed-exam` #75 d724d308 → #72; `m3/legacy-exam-review` #76 526b54f5 → #71. Drafts previos #67–#73 sin fusionar. | REVIEW | Integración propuesta `m3/integrate-reviewed-evaluation` sobre `todo/curso-completo` fde25e43: traspaso publisher autorizado 21:50 UTC: también SOLO paso capturas y su enlace en `.github/workflows/ci.yml`, conservando resto CI y sin adoptar PR89 ni `publicar-registros.sh`; por ahora `src/server/exams.ts`, `tests/exam-submit-enrollment.test.ts` y `tests/integration/exam-submit-enrollment.test.ts` para revalidar matrícula al entregar, sin cambiar contratos. Resto detenido por solapes PR80/83/85/87 y pendiente handoff. Solo evaluación en curso/portal M2, formularios y acciones académicas heredadas; adaptadores/lectores y pruebas M3 relacionados. Sin otras funciones M2, esquema, migraciones, configuración compartida ni política de nota oficial. Solo esta fila. | 2026-10-09 | 23:03 UTC: Carlos autoriza nueva rama `m3/tanda4-enrollment-ci-artifacts` sobre `todo/tanda-4` 872014902632090ab4f3cb6c3a8edffaa3d72ed0: portar el guard y ambos tests de PR94 y sustituir AMBOS publishers de capturas y registros por artifacts conservando logs, resúmenes y estado de fallo. Cesión limitada a `src/server/exams.ts`, sus dos tests, `.github/workflows/ci.yml`, `.github/workflows/publicar-registros.sh` y esta fila M3. Sin otros contratos o regiones PR95/96, esquema, migraciones, merge ni producción. Único escritor Codex. 23:05 UTC: revisión independiente estática PASS del port y publishers; Node22: 5/5 focales, 137/137 suite base mediante node --import tsx (CLI npm test bloqueado localmente por EPERM de socket), lint completo, tipos, Prisma validate y build PASS. YAML/bash, comparación de pasos originales, fixtures presentes/ausentes y las nueve ramas de fallo del gate PASS. PostgreSQL y artifacts reales pendientes de CI para el nuevo SHA; no DB local/staging. Claim se publica junto al commit CI seguro en la nueva rama para no ejecutar el workflow heredado de la coordinadora. Historial: 22:10 UTC: PR94 draft publicado, HEAD3739b361a6f232a903e84ebbcbb7c579efb0a66a sobre base fde25e43; cuatro archivos (exams.ts, dos tests, publisher CI capturas). Actions37996095529 SUCCESS:121/121 unitarias base +280/280 integración,9PG nuevas PASS incluida carrera,smoke6/6; tipos/lint/build y Vercel PASS. Artifact11646689631 ZIP real verificado,260 archivos allowlisted sin .env/seed.json,7.427.687 bytes,expira23oct; digest coincide.5unit focales locales fuera de npm test. Sin cambios de esquema/migraciones; no DB local/staging,merge ni despliegue manual. Próximo paso: Carlos acepta Preview360px/teclado y decide integración/cesiones; siguiente escritor de regiones solapadas aún no confirmado. Al integrar PR89 conservar sus logs/resúmenes y este publisher seguro. Historial previo (los bloqueos CI/publicación siguientes están resueltos para PR94): 21:50 UTC: Carlos confirma cesión específica CI capturas→artefactos ante claim S0-GOV y PR89. Preparar cuatro archivos sobre fde25e43, revisión independiente antes de publicar. Revalidado21:49: guard5/5, tipos/lint/diff PASS;9PG pendientes. 18:55 UTC: guard matrícula local portable terminado y revisado independientemente: 5/5 DB-free, tipos, lint y diff-check PASS; 9 PG redactadas, incluida carrera con pg_blocking_pids, no ejecutadas; runner necesita al menos 3 conexiones. Patch aplica sobre base/tanda-3, sin publicar. Integración y UX detenidas por cesión de regiones80/83/85/87 y publisher CI. 18:46 UTC: recuperado worktree limpio; base/tanda-3 2dc69a1c ya integra los diez commits, no duplicar. Publicación bloqueada por publisher CI; no push de código hasta autorización. Tres cortes revisados independientemente y publicados draft. Legacy tareas delega a M3 y portal protege publicación/GradeEntry/exoneración; submitExam antiguo falla cerrado y dirige al temporizador; revisión docente exige motivo, snapshot completo e IDs manuales propios antes de delegar. Node22: A 146, B 126, C 125 pruebas DB-free PASS; tipos/lint/build PASS. CI desechable: #74 job136 SUCCESS 172/172; #76 job142 SUCCESS 147/147; #75 reintento job200 SUCCESS 146/146 sobre el mismo d724d308, incluido diff-check; sustituye el fallo de red de job132. Verificados #67–#76 a las 18:12 UTC: diez drafts abiertos sin merge, heads esperados y CircleCI/Vercel success. Totales incluyen 22/14/12 casos nuevos DB-free separados de 13/4/5 PostgreSQL reales; los 22 PostgreSQL nuevos verificados por nombre, nunca local/staging. Validación temporal combinada y revisión independiente PASS: 204/204 DB-free, tipos/lint/build; reconciliar imports y partes estudiante/docente del bloque examen, conservar grade-history de A. No staging, merge ni despliegue manual. Preview móvil/teclado pendiente. Persisten I1 máximo/representación docente, I2 historia exoneración, token de formulario antiguo, retención de intentos y decisión de nota oficial. |
| S0-GOV | Kiro | `fix/role-access-hardening` | BLOCKED | `TEAM-COORDINATION.md`, `AGENTS.md`, `.kiro/PLAN.md`, `.kiro/steering/{current-state,simplicity,tech,data-model,product,spec-governance,structure}.md`, documentación S0, CI PostgreSQL y runner E2E | 2026-10-08 | Revisión independiente final `PASS`: preflight exacto/read-only antes de escrituras, curso por ID y pickers por código. Puerta local: 93/93, auth 11/11, tipos, lint, build 23/23, audit 0, migraciones 6/6. No crear otro Supabase ni iniciar S1. Bloqueos únicos: autorización de commit/push y login/bypass de Preview para el recorrido desplegado. |
| S0-AUTH-DIAG | Kiro | `fix/role-access-hardening` | REVIEW | Diagnóstico seguro de credenciales en `src/lib/auth.ts` y prueba contractual en `tests/security.test.ts`; sin esquema, migraciones ni secretos | 2026-10-09 | Diagnóstico listo: cuatro causas explícitas, SHA/tenant/rol/updatedAt sin PII. Puerta: 94/94, auth 12/12, tipos, lint, build 23/23 y audit 0. Publicar en ambas ramas feature, ejecutar un solo login y leer `[auth][credentials-rejected]` en Vercel. |

Historial: los claims S1-SEC-A, S2-ID-A, S2-UI-A (Claude) quedaron integrados en `integration/curso-completo`; sus PR #6, #7 y #8 se cierran a favor de esa rama. S3-PROP (PR #9) queda en espera hasta cumplir la meta del tramo.

**Requisito operativo:** `integration/curso-completo` necesita tres migraciones aplicadas en el Supabase de staging (`s1_security`, `s1_grade_autograded`, `s2_identity`). Sin ellas el inicio de sesión de sus Preview falla.

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
