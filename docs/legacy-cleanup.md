# Inventario de legado y compatibilidad

Este documento identifica restos Alpha y contratos que deben migrarse. S0 no elimina ni renombra datos.

## Modelos o campos legacy

| Elemento | Estado | Sustituto objetivo | Estrategia |
|---|---|---|---|
| `CourseModule` | Legacy; nuevas experiencias usan Section/Lesson | `CourseSection` + `Lesson` | Medir uso, migrar datos y retirar en migración posterior. |
| `Course.schedule` JSON | Legacy | `MeetingPattern` + `ClassSession` | Leer temporalmente como fallback; materializar y después retirar. |
| `Course.room` | Legacy | `Campus` + `Room` + sesión | Backfill a aula normalizada cuando sea posible. |
| `Course` como contenido y ejecución | Activo pero insuficiente | `Course` + `Offering` | Crear Offering para cada curso actual y mover relaciones por etapas. |
| `Course.teacherId` único | Restricción actual | `OfferingStaff` | Backfill como titular; conservar compatibilidad durante transición. |
| `Announcement.audience/audienceId` | Legacy compatible | Tablas normalizadas de targets | Ya existe backfill; retirar solo tras confirmar cero lectores legacy. |
| `Submission.fileUrls` | Legacy | `StorageAsset` | Migrar referencias existentes y bloquear nuevas escrituras. |
| `PaymentConcept.amount Float` | Riesgo monetario | `amountCents Int` + currency | Backfill con redondeo auditado y doble lectura temporal. |
| `PaymentConcept.studentId` sin relación | Riesgo de integridad | FK tenant-aware | Limpiar referencias inválidas y añadir relación/índice. |
| `User.institutionId` y `User.role` | Modelo actual | `User` global + `Membership` | Crear memberships, lectura dual, cambiar auth y retirar al final. |
| `ScheduleSlot` | Básico | `MeetingPattern` + `ClassSession` | Backfill patrón semanal y materializar futuras sesiones. |
| `AttendanceSession @@unique(courseId,date)` | Restricción | asistencia por `ClassSession` | Crear sesiones concretas antes de eliminar restricción. |
| `Submission @@unique(assignmentId,studentId)` | Restricción | intentos numerados | Añadir `attemptNumber` y nueva unicidad. |
| `Assignment`, `Enrollment`, `Submission`, `ExamQuestion`, `ExamAnswer` sin `institutionId` directo | Riesgo de aislamiento/índices | Columna física e índice | Migración aditiva, backfill por relaciones y NOT NULL posterior. |
| `AuditLog` parcial | Cobertura incompleta | Auditoría uniforme before/after | Migrar acciones al tocarlas; no falsificar historial. |

## Archivos grandes a dividir al tocar el dominio

- `src/app/dashboard/aula/[courseId]/page.tsx`: dividir por pestañas/rutas y view models.
- `src/app/dashboard/academico/actions.ts`: separar acciones por agregado.
- Páginas y acciones que importan `db`: migrar gradualmente a `src/server/data/**`.

## Regla de limpieza

1. Agregar sustituto.
2. Backfill verificable.
3. Lectura dual o compatibilidad temporal.
4. Cambiar escrituras.
5. Medir referencias legacy.
6. Retirar únicamente con migración aprobada y rollback documentado.
