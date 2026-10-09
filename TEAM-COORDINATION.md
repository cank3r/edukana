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

| Participante | Responsabilidad primaria | Puede escribir | No debe hacer |
|---|---|---|---|
| Carlos | Dirección de producto, decisiones, aprobación de specs, prueba como usuario y merge | Decisiones y aprobaciones | Fusionar sin evidencia o asignar dos escritores al mismo contrato |
| Claude | Arquitectura de fondo: migraciones, sesión/login, integridad SQL, Postgres CI, DAL e importaciones masivas | Rama propia y alcance reclamado; esquema solo con claim exclusivo | Editar UI o contratos activos de Kiro sin handoff |
| Kiro | Integrar cada recorrido: implementación de spec, acciones, UI, E2E, despliegue Preview y correcciones | Rama propia; todos los archivos del claim activo | Empezar otra spec o cambiar arquitectura aprobada sin registrar decisión |
| Codex | Revisión independiente, seguridad adversarial, casos límite, textos simples y QA | Docs/tests en rama propia si existe claim; por defecto revisión | Editar esquema o producción; aprobar el trabajo que él mismo escribió |

Un solo agente modifica `prisma/schema.prisma` y la migración activa. Un segundo agente revisa después de terminar, nunca escribe en paralelo sobre el mismo contrato.

## Flujo por tarea

1. Carlos aprueba objetivo y criterios.
2. Claude prepara o revisa arquitectura, migración y pruebas de fondo cuando el sprint lo requiere.
3. Kiro integra el recorrido completo sobre esa base y produce Preview/E2E.
4. Codex revisa de forma independiente seguridad, UX, casos límite y textos.
5. Kiro corrige hallazgos; Claude revisa cambios estructurales si los hubo.
6. Carlos prueba como usuario y autoriza merge.

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

| ID | Agente | Rama | Estado | Alcance exclusivo | Última actualización | Siguiente paso / bloqueo |
|---|---|---|---|---|---|---|
| S0-GOV | Kiro | `fix/role-access-hardening` | BLOCKED | `TEAM-COORDINATION.md`, `AGENTS.md`, `.kiro/PLAN.md`, `.kiro/steering/{current-state,simplicity,tech,data-model,product,spec-governance,structure}.md`, documentación S0, CI PostgreSQL y runner E2E | 2026-10-08 | Revisión independiente final `PASS`: preflight exacto/read-only antes de escrituras, curso por ID y pickers por código. Puerta local: 93/93, auth 11/11, tipos, lint, build 23/23, audit 0, migraciones 6/6. No crear otro Supabase ni iniciar S1. Bloqueos únicos: autorización de commit/push y login/bypass de Preview para el recorrido desplegado. |
| S1-SEC-A | Claude | `claude/s1-sec-a` | REVIEW (PR #6) | **Escritor único de `prisma/schema.prisma` y migraciones durante S1.** Pasos 1-3: `tests/integration/**`, `.circleci/config.yml`, script `test:integration`; migración `20261008160000_s1_security`; `src/server/session.ts`, `src/lib/auth.ts`, `src/proxy.ts`, `src/types/next-auth.d.ts`, `src/app/login/layout.tsx`; escritura de `institutionId` y `amountCents` en `academico/actions.ts` y `dashboard/actions.ts` (solo las llamadas `create`). Paso 4-5: `src/server/security/**`, `src/server/integrations/email/**`, `src/server/password-reset.ts`, `src/server/actions/password-reset.ts`, rutas públicas `/recuperar` y `/restablecer` en `src/lib/access.ts`. Paso 6: `src/server/exams.ts`, `src/server/actions/exams.ts`, migración `20261008190000_s1_grade_autograded`, instantánea al crear examen en `academico/actions.ts`. Paso 7-8: `src/server/grade-history.ts` y su uso en `academico/actions.ts` (entregas y revisión), `src/server/setup-token.ts`, `src/app/setup/{page.tsx,actions.ts,SetupForm.tsx}` (solo el token). Pendiente: migración `s1_security_enforce` (NOT NULL) tras desplegar; allowlist de DB/Storage del runner (archivo de Kiro). | 2026-10-08 | Evidencia CI en `dd52faf`: CircleCI verde con migraciones sobre PostgreSQL 16, verificación migraciones↔schema, 60+ pruebas de integración con dos instituciones, 93 unitarias, tipos, lint y build. Handoff: parte de servidor de S1 terminada; falta S1-SEC-B (pantallas de Kiro), revisión de Codex, aplicar migraciones en staging y E2E en Preview. Evidencia local previa: migración aplicada con psql sobre datos sembrados (backfill sin nulos, guarda detiene datos cruzados, FK de cobros activa); 90/90 pruebas unitarias; ESLint limpio. Evidencia CI: ver PR #6. No ejecutado en el entorno de Claude: Prisma (motores bloqueados), typecheck y build. Carlos declaró S0-GOV DONE el 2026-10-08; su fila la actualiza Kiro. Contrato para Kiro (S1-SEC-B, pantallas): **notas** — al corregir una nota de un período publicado, `reviewSubmission` exige el campo `reason`; agregar ese campo a la pantalla. **`/setup`** — con `SETUP_TOKEN` definido solo responde en `/setup?token=…`; sin la variable se conserva el comportamiento anterior para no romper el runner E2E; cuando el runner pase el token, se exige siempre. **examen** — la pantalla debe mostrar el botón "Iniciar examen" (`startExamAttemptAction`, campo `examId`; devuelve `attemptId`, `expiresAt` y las preguntas sin clave), un contador hasta `expiresAt`, y enviar con `submitExamAttemptAction` (campos `attemptId` y `question_<bankItemId>`); no mostrar preguntas antes de iniciar; al terminar, eliminar la acción antigua `submitExam`, marcada @deprecated: mientras exista, el tiempo no es obligatorio. **Recuperación** — `/recuperar` usa `requestPasswordResetAction` (campo `email`); `/restablecer/[token]` usa `resetPasswordAction` (campos `token`, `password`, `confirmPassword`); ambas devuelven `{ ok, message }` y sus rutas ya son públicas. Además: `auth()` ahora devuelve null si la cuenta no está activa; `/login` redirige con sesión vigente desde su layout, no desde el proxy. |
| S2-ID-A | Claude | `claude/s2-id-import` (sobre `claude/s1-sec-a`) | REVIEW (PR #7) | `src/server/imports/**`, `src/server/actions/people-import.ts`, `tests/integration/people-import.test.ts`, `docs/proposals/S2-ID/**`, `src/server/people/**`, `src/server/platform/**`, `src/server/actions/{people,platform}.ts`, `tests/integration/people-access.test.ts`. Además: `prisma/schema.prisma` y migración `20261008220000_s2_identity` (escritor único), `src/server/{identity,login,session}.ts`, `src/lib/auth.ts`, `src/server/actions/institutions.ts`, `src/server/password-reset.ts`, enlace de identidad en `setup/actions.ts` y `puesta-en-marcha/actions.ts`. Diseño `Identity` + `User` como membresía: Carlos respondió "continúa" a la propuesta; la migración es aditiva y reversible. | 2026-10-08 | Adelanto de S2 que no depende de nadie: importación masiva sobre el esquema de S1. Contrato para Kiro (pantalla de importación): `importPeopleAction`, campos `file` (CSV) y `confirm`; sin `confirm` previsualiza; devuelve conteos, primeras 20 filas rechazadas y `errorsCsv` para descargar. Contrato adicional para Kiro: pantalla `/elegir-institucion` con `listMyInstitutions()` y `switchInstitutionAction` (campo `userId`); `session.user.institutionCount` indica si mostrar el selector. Contrato para Kiro (gestión de personas, `src/server/actions/people.ts`, todas exigen `people.manage` y devuelven `{ ok, message }`): `invitePersonAction` (campo `userId`) invita o reinvita; `invitePendingPeopleAction` (sin campos) invita por lotes de 50 a quien aún no puede entrar y devuelve `remaining`: repetir mientras `ok` y `remaining > 0`; `setPersonStatusAction` (campos `userId`, `status` = `SUSPENDED`\|`ACTIVE`, `reason` obligatorio al suspender). Contrato de operador (`src/server/actions/platform.ts`): `amIPlatformOperator()` decide si mostrar la pantalla; `createInstitutionAction` (campos `name`, `slug`, `type`, `adminName`, `adminEmail`). El operador se define con la variable `PLATFORM_OPERATOR_EMAILS`; sin ella nadie lo es. Sin migración nueva: la invitación reutiliza `password_reset_tokens` con vigencia de 7 días y el enlace `/restablecer/<token>`. Servidor de S2 completo; pendiente: pantallas (Kiro), revisión (Codex), migraciones en staging (Carlos). |

## Claims reservados siguientes

| ID | Estado | Alcance | Dependencia |
|---|---|---|---|
| S1-SEC | PLANNED | Sesión viva, rate limit, recuperación, examen temporal, Postgres CI | S0-GOV DONE |
| S2-ID | PLANNED | Identidad global, Membership, invitaciones y CSV | S1-SEC DONE |
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
