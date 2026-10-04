# 05 · Estructura académica, cursos, ofertas y matrícula — Requisitos

### Requisito 1 — Estructura por tipo
1. SCHOOL: año escolar → períodos con peso → niveles → grados → grupos (sección) con titular y cupo.
2. UNIVERSITY: año → semestres → facultades → carreras → plan de estudios versionado (asignaturas por semestre, créditos, prerrequisitos).
3. INSTITUTE: programas → niveles o módulos → cohortes con fecha de inicio y fin.
4. MARKETPLACE: categorías y rutas de aprendizaje.
5. SHALL existir un asistente inicial por tipo y edición posterior en árbol.
6. WHEN se cierra un año THEN SHALL ofrecerse promoción masiva al grado siguiente (SCHOOL) y duplicación de ofertas.

### Requisito 2 — Curso y oferta
1. El contenido SHALL pertenecer al curso; matrículas, notas, asistencia, horario y fechas SHALL pertenecer a la oferta.
2. Una oferta SHALL ser `COHORT` (con período y fechas) o `SELF_PACED`.
3. SHALL poder asignarse uno o más docentes y asistentes por oferta.
4. SCHOOL: al crear un grupo SHALL poder generarse en bloque las ofertas de todas las asignaturas del grado.
5. WHEN se duplica una oferta THEN SHALL copiar configuración, tareas y exámenes sin entregas.

### Requisito 3 — Horario
1. SHALL validarse choques de docente, aula y grupo al crear bloques.
2. Estudiantes, docentes y tutores SHALL ver su horario semanal.

### Requisito 4 — Matrícula
1. Orígenes: asignación manual, masiva por grupo, importación, código de inscripción, autoinscripción en ventana (UNIVERSITY), compra.
2. SCHOOL: matricular a un estudiante en un grupo SHALL matricularlo en todas sus ofertas.
3. UNIVERSITY: la autoinscripción SHALL validar prerrequisitos, tope de créditos, choque de horario, cupo y deuda (`finance.blockAccessOnDebt`); con `ADVISOR`, requiere aprobación.
4. WHEN no hay cupo y `enroll.waitlist` THEN SHALL crear lista de espera y promover automáticamente.
5. El cupo SHALL respetarse bajo concurrencia.
6. El retiro SHALL registrar motivo y fecha y conservar historial.

### Requisito 5 — Finalización
1. La matrícula SHALL pasar a `COMPLETED` o `FAILED` según `completionRule` de la oferta: manual, fin de período con nota y asistencia mínimas, todas las lecciones, lecciones + nota mínima.
