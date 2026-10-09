---
inclusion: always
---
# Edukana — Gobernanza de especificaciones

## Precedencia

1. Código y migraciones reales.
2. Decisiones aprobadas en `current-state.md`.
3. Este archivo y demás steering reconciliado.
4. Specs READY.
5. Specs DRAFT como backlog no ejecutable.

`current-state.md` prevalece ante contradicciones. Ninguna spec se implementa por existir.

## Estado

- Specs 00–15 siguen DRAFT hasta revisión.
- S0 reconcilia steering y preserva el producto actual sin cambiar comportamiento.
- El seguimiento operativo vive en `.kiro/PLAN.md` y los claims en `TEAM-COORDINATION.md`.
- Las prioridades antiguas sobre tutor, minimización y curso completado ya están implementadas; permanecen como regresiones.

## Puerta DRAFT → READY

1. Dependencias explícitas.
2. Modelo con `institutionId`, relaciones e índices implementables.
3. Migración aditiva, backfill, compatibilidad y rollback.
4. Permisos y alcance por recurso.
5. Threat model.
6. Pantallas, textos y acciones definidos.
7. Estados vacío, cargando, error, sin permiso y solo lectura.
8. Casos sin permiso, ID ajeno e institución ajena contra Postgres real.
9. Simplicidad móvil según `simplicity.md`.
10. Criterio E2E desplegado.
11. Decisiones abiertas resueltas.
12. Aprobación humana para contratos irreversibles.

## Orden aprobado

| Sprint | Specs | Objetivo |
|---|---|---|
| S0 | Steering + docs | Consolidar fuente de verdad, cambios locales y Preview. |
| S1 | 00 + parte de 15 | Sesión viva, seguridad, examen temporal y Postgres CI. |
| S2 | 02 + 04 + parte de 01 | Identidad global, membresías, invitaciones, CSV y alta de espacios. |
| S3 | 05 | Course/Offering, programas, cohortes, grupos y matrícula masiva para INSTITUTE. |
| S4 | Nueva 16 | ClassSession, semana híbrida, Panel Hoy, MeetingProvider y notificaciones. |
| S5 | 06 | VideoProvider y streaming adaptable. |
| S6 | 08 + 12 sin pasarela + 14 | Cobros administrativos, cierre, boletín, reportes y restore. |
| S7–S8 | Nueva 17 | IA docente y tutor del estudiante. |
| S9–S10 | 13 + pago online de 12 | Marketplace, pasarela y profesor independiente. |

Las demás specs se integran cuando el sprint productor toca sus contratos; no se implementan completas fuera de orden.

## Reglas de ejecución

- Leer y reclamar alcance en `TEAM-COORDINATION.md` antes de escribir.
- Una spec a la vez por agregado compartido.
- No iniciar un sprint con bloqueadores abiertos.
- Trabajo paralelo solo sin solape de esquema, contratos ni archivos.
- Adoptar `src/server` gradualmente; no refactor global sin valor funcional.
- No mezclar formateo masivo con comportamiento.
- No migraciones destructivas, merge ni producción sin autorización explícita.
- Registrar decisiones en design y PLAN.
- Una capacidad termina con E2E en Preview.

## Pruebas

- Sustituir pruebas por lectura de fuente al tocar cada dominio.
- CI levanta Postgres y dos instituciones.
- Cada acción prueba permiso, propiedad y tenant.
- Mantener regresiones de tutor, privacidad, scope docente, archivos y cursos completados.

## S0

S0 no cambia lógica. Debe inventariar estado/legado, crear current-state/simplicity/PLAN/coordinación, reconciliar steering, validar cambios locales y preservar/publicar solo con autorización.
