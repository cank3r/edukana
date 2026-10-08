-- Distingue la nota puesta por el sistema (examen autocalificado) de la puesta por una persona.
-- "gradedById" sigue siendo obligatorio; cuando "autoGraded" es true identifica al docente
-- responsable del curso, no a quien calificó.
ALTER TABLE "grade_entries" ADD COLUMN "autoGraded" BOOLEAN NOT NULL DEFAULT false;
