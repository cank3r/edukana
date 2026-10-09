# S3 · Estructura académica — Requisitos (propuesta)

**Estado:** PROPUESTA. No se escribe esquema ni código hasta que Carlos apruebe la decisión de abajo.
**Autor:** Claude. **Fecha:** 2026-10-08. **Depende de:** S2-ID-A (PR #7).

## Objetivo

Que el instituto pueda organizar 1,600 estudiantes en programas, promociones y grupos; que un curso tenga
varios grupos y varios docentes; y que matricular a una promoción entera sea una sola acción.

## Decisión que necesita aprobación de Carlos

`current-state.md` (decisión 4) dice: separar `Course` (contenido) de `Offering` (ejecución) y mover a la
oferta matrículas, tareas, exámenes, notas, asistencia y horario. Propongo llegar al mismo resultado para el
piloto con un cambio mucho menor:

| Necesidad | Decisión escrita | Propuesta |
|---|---|---|
| Mismo contenido para varios grupos a la vez | Un `Course` con varias `Offering` | Un `Course` con varios **grupos** (`CourseGroup`); cada matrícula pertenece a un grupo |
| Varios docentes | `OfferingStaff` | `CourseStaff`, por curso o por grupo |
| Repetir el curso el próximo período | Nueva `Offering` del mismo `Course` | **Duplicar el curso** al período nuevo: copia contenido, tareas y exámenes, sin entregas ni notas |
| Relaciones existentes (unas 15 tablas) | Se mueven de `Course` a `Offering` | No se tocan |

Qué se gana: migración aditiva, sin mover datos, y ninguna pantalla existente se rompe.
Qué se pierde: si se corrige una lección después de duplicar el curso, la corrección no llega a la copia
anterior. Para un instituto por períodos es el comportamiento habitual (así funciona Moodle). Para el
marketplace (S9), donde un curso se vende de forma continua, hará falta el curso sin período; se resuelve
entonces y esta propuesta no lo impide.

## Preguntas para Carlos (cambian el diseño)

1. ¿Cómo se organiza el instituto: por carreras técnicas con módulos, por cursos sueltos, o ambos?
2. ¿Un mismo curso se da a varios grupos en el mismo período (por ejemplo, tanda mañana y tanda noche)?
3. ¿Los estudiantes de una promoción toman todos los mismos cursos, o cada uno elige?
4. ¿Los períodos son cuatrimestres, trimestres o módulos de duración variable?

Los requisitos de abajo asumen: carreras con módulos, varios grupos por curso, y promociones que cursan juntas.

## Requisitos

**R1 — Programas y promociones**
1. Una institución SHALL poder crear programas (por ejemplo "Técnico en Enfermería") y asociarles cursos con un orden.
2. Una promoción (cohorte) SHALL pertenecer a un programa y tener nombre, fecha de inicio y, opcionalmente, de fin.
3. Una persona SHALL poder agregarse a una promoción una a una o desde la importación CSV (columna opcional "Promoción").
4. Programas y promociones SHALL ser opcionales: una institución que no los use sigue funcionando como hoy.

**R2 — Grupos dentro de un curso**
1. Un curso SHALL poder tener uno o más grupos con nombre, cupo opcional y horario propio.
2. Todo curso existente SHALL quedar con un grupo "Único" tras la migración, con sus matrículas dentro.
3. Asistencia, listas y calificaciones SHALL poder filtrarse por grupo; el contenido SHALL ser el mismo para todos.
4. Un docente asignado a un grupo SHALL ver y calificar solo a los estudiantes de ese grupo.

**R3 — Varios docentes**
1. Un curso o grupo SHALL poder tener varios docentes con papel titular, asistente o sustituto.
2. El docente actual de cada curso SHALL quedar como titular tras la migración.
3. Quitar a un docente SHALL cortar su acceso al curso de inmediato y conservar lo que ya calificó.

**R4 — Matrícula masiva**
1. SHALL poder matricularse una promoción entera en un curso y grupo con una sola acción, con resumen previo.
2. SHALL poder matricularse una promoción en todos los cursos de su programa para un período.
3. La acción SHALL ser idempotente: repetirla no duplica matrículas.
4. El cupo del grupo SHALL respetarse bajo concurrencia; si no caben todos, no se matricula a nadie y se dice cuántos faltan.
5. El retiro SHALL registrar motivo y fecha y conservar notas, entregas y asistencia.

**R5 — Repetir un curso**
1. SHALL poder duplicarse un curso a otro período: contenido, tareas, exámenes, categorías y ponderaciones.
2. La copia SHALL nacer sin matrículas, entregas, intentos, notas ni asistencia, y con las fechas sin definir.

**R6 — Aislamiento e integridad**
1. Toda tabla nueva SHALL llevar `institutionId` y pruebas de aislamiento entre dos instituciones.
2. Un grupo, docente o promoción de otra institución SHALL ser rechazado por el servidor aunque se envíe su id.

## Fuera de alcance de S3

Autoinscripción con prerrequisitos y créditos, lista de espera, promoción de grado, plan de estudios versionado,
choques de horario, y curso sin período para marketplace. La spec 05 los describe; ninguno es necesario para el piloto.
