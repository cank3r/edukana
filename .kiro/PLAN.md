# Edukana — Plan de ejecución

Este archivo registra estado, dependencias y siguiente acción. No sustituye requirements/design/tasks de cada spec.

## Decisiones cerradas

- Conservar `Institution`/`institutionId`.
- Adoptar identidad global + `Membership` mediante migración aditiva.
- Separar `Course` y `Offering` antes de importar datos reales.
- Crear `ClassSession` y semana híbrida.
- Usar `MeetingProvider` con enlace externo primero; no videoconferencia propia.
- Migrar video a `VideoProvider` de streaming.
- Dinero en centavos.
- Cobros administrativos sin pasarela durante el piloto.
- IA después del núcleo, con revisión humana y presupuesto por institución.

## S0 — Consolidación

| ID | Trabajo | Estado | Evidencia / siguiente acción |
|---|---|---|---|
| S0-01 | Inventariar código, rama y cambios locales | DONE | `as-built-system-manual.md` y estado Git revisado. |
| S0-02 | Crear fuente de verdad actual | DONE | `.kiro/steering/current-state.md`. |
| S0-03 | Adoptar regla de simplicidad | DONE | `.kiro/steering/simplicity.md`. |
| S0-04 | Reconciliar cinco steerings legacy | DONE | Tech, data model, product, governance y structure alineados. |
| S0-05 | Inventariar restos Alpha | DONE | `docs/legacy-cleanup.md`; no se eliminó ningún modelo. |
| S0-06 | Crear coordinación multiagente | DONE | `TEAM-COORDINATION.md`, AGENTS y handoff para Claude. |
| S0-07 | Validar documentación y suite | DONE | 87/87, auth 11/11, types, lint, build 22/22, audit producción 0 y diff check. |
| S0-08 | Preservar cambios en commit | DONE | Commit S0 específico en `fix/role-access-hardening`. |
| S0-09 | Publicar rama y actualizar PR | DONE | Push explícito a feature branch; nunca a master. |
| S0-10 | Decidir privacidad del repositorio | DECISION | El repositorio es público; el propietario debe decidir. |
| S0-11 | Contratar infraestructura de piloto | EXTERNAL | Verificar planes, backups, correo, video y presupuesto. |
| S0-12 | Reset limpio y runner en Preview | BLOCKED | Depende del deployment actualizado y reset autorizado de staging. |

## Sprints aprobados

| Sprint | Objetivo | Dependencias | Salida |
|---|---|---|---|
| S1 | Seguridad y pruebas reales | S0 | Suspensión inmediata, recuperación, rate limit, bootstrap protegido, URLs firmadas, examen temporal, historia académica y Postgres CI. |
| S2 | Identidad y personas | S1 | Membership, invitaciones, CSV 1,600 y alta de espacios. |
| S3 | Estructura académica | S2 | Course/Offering, programas, cohortes, grupos, varios docentes y matrícula masiva. |
| S4 | Semana híbrida | S3 | ClassSession, Panel Hoy, MeetingProvider, asistencia y notificaciones. |
| S5 | Streaming de video | S3 | VideoProvider, carga, reproducción adaptable y reanudación. |
| S6 | Cierre operativo | S4/S5 | Cobros en lote, cierre, boletín, reportes y restore probado. |
| S7 | IA docente | S6 | Preguntas/rúbricas como borrador con costo y revisión. |
| S8 | Tutor IA del estudiante | S7 | Responde solo con cursos autorizados y cita fuentes. |
| S9 | Marketplace | S6 | Catálogo, orden, pasarela y matrícula automática. |
| S10 | Profesor independiente | S9 | Publicación, venta y liquidación. |

## Regla de avance

- Una spec a la vez por agregado compartido.
- No iniciar un sprint con bloqueadores de dependencia abiertos.
- Trabajo paralelo solo cuando no comparte esquema, contratos ni archivos.
- Cada salida necesita prueba E2E desplegada y simplicidad validada.
