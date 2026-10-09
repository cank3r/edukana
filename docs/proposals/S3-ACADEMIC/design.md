# S3 · Estructura académica — Diseño (propuesta)

**Estado:** PROPUESTA. Depende de la decisión descrita en `requirements.md`.

## Modelo de datos (aditivo)

```
Program        (id, institutionId, name, code?, isActive)                      @@unique(institutionId, name)
ProgramCourse  (programId, courseCode, order, institutionId)                   plan: qué cursos y en qué orden
Cohort         (id, institutionId, programId?, name, startsOn, endsOn?)        @@unique(institutionId, name)
CohortMember   (cohortId, userId, institutionId, joinedAt, leftAt?)            @@id(cohortId, userId)
CourseGroup    (id, institutionId, courseId, name, capacity?)                  @@unique(courseId, name)
CourseStaff    (id, institutionId, courseId, groupId?, userId, role)           role: LEAD | ASSISTANT | SUBSTITUTE
```

Columnas nuevas en tablas existentes, todas opcionales al inicio:

- `courses.programId?` — a qué programa pertenece.
- `enrollments.groupId?`, `enrollments.withdrawnAt?`, `enrollments.withdrawReason?`.
- `schedule_slots.groupId?`, `attendance_sessions.groupId?`.

`ProgramCourse` usa el código del curso y no su id porque el curso se duplica cada período: el plan del programa
debe sobrevivir a la copia.

## Migración

1. Crear tablas y columnas.
2. Por cada curso: crear un `CourseGroup` "Único" y asignarle sus matrículas, horarios y sesiones de asistencia.
3. Por cada curso: crear un `CourseStaff` titular con `courses.teacherId`.
4. Guardas `RAISE EXCEPTION` si queda alguna matrícula sin grupo o algún curso sin titular.

`courses.teacherId` se conserva como "titular" para no tocar las pantallas actuales; `CourseStaff` es la fuente de
verdad para permisos. Una migración posterior (`s3_enforce`) hace `enrollments.groupId` obligatorio.

## Permisos

Hoy el acceso docente se decide con `course.teacherId === user.id`. Pasa a una sola función:

```ts
// src/server/academic/access.ts
canTeach(user, courseId): Promise<{ all: true } | { groupIds: string[] } | null>
```

- Titular o asistente del curso completo → `{ all: true }`.
- Docente de grupos concretos → solo esos grupos.
- Coordinación y administración conservan su alcance por capacidad.

Todo listado de estudiantes, entregas, notas y asistencia filtra por ese resultado en el servidor.

## Matrícula masiva

```ts
// src/server/academic/bulk-enrollment.ts
planCohortEnrollment(actor, { cohortId, courseId, groupId })  -> { toEnroll, alreadyEnrolled, capacityLeft }
applyCohortEnrollment(actor, plan)                             -> { enrolled }
```

- Una transacción con `SELECT … FOR UPDATE` sobre el grupo: cuenta, compara con el cupo y, si cabe, inserta con
  `createMany … skipDuplicates`. Es el mismo patrón de bloqueo ya probado en los intentos de examen.
- Si no caben todos, no se inserta nada.
- Auditoría con una fila por operación, no por estudiante.

## Duplicar curso

`duplicateCourse(actor, { courseId, periodId })` copia en una transacción: curso, grupos (vacíos), personal,
secciones, lecciones, módulos, tareas, banco de preguntas, exámenes con sus preguntas, categorías e ítems de
calificación. Los archivos no se copian: la copia apunta a los mismos archivos privados, que solo se borran cuando
ningún curso los usa.

## Pruebas

Integración sobre PostgreSQL con las dos instituciones de la semilla:
- migración: curso existente queda con grupo "Único", matrículas dentro y titular en `CourseStaff`;
- docente de un grupo no ve estudiantes del otro grupo ni de otra institución;
- matrícula masiva: idempotente, respeta cupo con dos operaciones simultáneas, rechaza ids de otra institución;
- duplicado: copia contenido y evaluaciones, sin matrículas ni notas.

## Orden de trabajo

1. Migración + `CourseGroup` + `CourseStaff` + `canTeach` (sin cambios visibles).
2. Programas, promociones e importación con columna "Promoción".
3. Matrícula masiva.
4. Duplicar curso.
5. Pantallas (Kiro): programas y promociones, grupos del curso, matricular promoción.
