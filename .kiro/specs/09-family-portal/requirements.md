# 09 · Portal de familias — Requisitos

### Requisito 1 — Vínculo
1. Solo personal con `guardian.link.manage` SHALL crear, editar o revocar vínculos tutor–estudiante.
2. Cada vínculo SHALL tener parentesco, permisos (notas, asistencia, conducta, finanzas) y marca de responsable financiero.
3. WHEN se crea el vínculo THEN el tutor SHALL recibir invitación; un tutor con varios hijos usa una sola cuenta.
4. WHEN el estudiante alcanza `privacy.guardianAccessUntilAge` THEN el vínculo SHALL requerir consentimiento del estudiante para continuar.

### Requisito 2 — Acceso
1. Un tutor sin vínculo activo SHALL ver solo avisos generales y su cuenta.
2. Con vínculo SHALL ver únicamente a sus hijos y solo las áreas permitidas en ese vínculo.
3. Todo acceso a datos del hijo SHALL auditarse.
4. El tutor SHALL NOT ver nombres de otros estudiantes ni de otros tutores.

### Requisito 3 — Experiencia
1. Inicio con selector de hijo y resumen: asistencia de la semana, tareas por vencer, últimas notas publicadas, saldo, avisos.
2. Secciones: Progreso, Tareas, Asistencia (justificar si se permite), Calificaciones (boletín), Pagos (pagar en línea), Mensajes con docentes.
3. Resumen semanal por correo o WhatsApp según `family.weeklyDigest`.
