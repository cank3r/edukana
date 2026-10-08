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
| S0-GOV | Kiro | `fix/role-access-hardening` | REVIEW | `TEAM-COORDINATION.md`, `AGENTS.md`, `.kiro/PLAN.md`, `.kiro/steering/{current-state,simplicity,tech,data-model,product,spec-governance,structure}.md`, documentación S0 y runner E2E local | 2026-10-08 | Revisiones técnica y documental aprobadas. Decisión de Carlos: staging conserva datos demo y no se borra antes de producción. S0-12 requiere un entorno de aceptación nuevo, aislado y allowlisted para ejecutar el E2E sin tocar staging. |

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
